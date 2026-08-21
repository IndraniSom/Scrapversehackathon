"""Content-addressed ZIP submission package with manifest and safety gates."""

import hashlib
import io
import json
import zipfile
from pathlib import PurePosixPath

from pydantic import BaseModel, ConfigDict, Field

from backend.contracts.source import NonEmpty


class PackageError(ValueError):
    """Safe submission package validation error with stable code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PackageFile(BaseModel):
    """One file to include in the package."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    path: NonEmpty
    data: bytes
    mime: NonEmpty
    origin: NonEmpty
    revision: int = Field(ge=1)


class ManifestEntry(BaseModel):
    """Manifest entry with content address and metadata."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    path: NonEmpty
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    byte_length: int = Field(ge=0)
    mime: NonEmpty
    origin: NonEmpty
    revision: int = Field(ge=1)


def _validate_path(path: str) -> None:
    """Reject traversal, absolute, or backslash paths."""
    if "\\" in path or path.startswith("/") or ".." in PurePosixPath(path).parts:
        raise PackageError("PATH_TRAVERSAL")
    if not path or path.strip() != path:
        raise PackageError("INVALID_PATH")
    # normalize and re-check
    normalized = str(PurePosixPath(path))
    if normalized != path or "/../" in f"/{path}/":
        raise PackageError("PATH_TRAVERSAL")


def _validate_gates(
    approvals: list[dict], amendment_state: str, evidence_ok: bool, sections: list[dict]
) -> None:
    """Reject stale approvals, evidence, amendment, or unapproved sections."""
    for gate in approvals:
        if gate.get("decision") != "approved":
            raise PackageError("MISSING_APPROVAL")
    if amendment_state not in {"approved", "HUMAN_CONFIRMED", "HUMAN_EDITED"}:
        raise PackageError("STALE_AMENDMENT")
    if not evidence_ok:
        raise PackageError("MISSING_EVIDENCE")
    for sec in sections:
        if sec.get("state") not in {"APPROVED", "LOCKED"}:
            raise PackageError("UNAPPROVED_SECTION")


def build_submission_package(
    *,
    proposal_id: str,
    proposal_revision: int,
    files: list[PackageFile] | list[dict],
    approvals: list[dict],
    amendment_state: str,
    evidence_ok: bool,
    sections: list[dict] | None = None,
) -> bytes:
    """Build deterministic ZIP with sorted manifest and fixed timestamps."""
    parsed_files = [
        PackageFile.model_validate(f) if isinstance(f, dict) else f for f in files
    ]
    _validate_gates(approvals, amendment_state, evidence_ok, sections or [])
    for pf in parsed_files:
        _validate_path(pf.path)
    # deterministic order
    parsed_files = sorted(parsed_files, key=lambda f: f.path)
    # build manifest entries
    entries = [
        ManifestEntry(
            path=pf.path,
            sha256=hashlib.sha256(pf.data).hexdigest(),
            byte_length=len(pf.data),
            mime=pf.mime,
            origin=pf.origin,
            revision=pf.revision,
        )
        for pf in parsed_files
    ]
    manifest = {
        "proposal_id": proposal_id,
        "proposal_revision": proposal_revision,
        "files": [e.model_dump() for e in entries],
    }
    manifest_bytes = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    manifest_entry = ManifestEntry(
        path="manifest.json",
        sha256=hashlib.sha256(manifest_bytes).hexdigest(),
        byte_length=len(manifest_bytes),
        mime="application/json",
        origin="generated",
        revision=proposal_revision,
    )
    # zip deterministic: sorted, fixed date, deflated
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for pf in parsed_files:
            info = zipfile.ZipInfo(pf.path, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, pf.data)
        info = zipfile.ZipInfo(manifest_entry.path, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        zf.writestr(info, manifest_bytes)
    return buf.getvalue()


def verify_submission_package(zip_bytes: bytes) -> dict:
    """Verify manifest hashes, byte lengths, and path safety; return manifest."""
    try:
        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
            for name in names:
                _validate_path(name)
            if "manifest.json" not in names:
                raise PackageError("MISSING_MANIFEST")
            manifest_bytes = zf.read("manifest.json")
            manifest = json.loads(manifest_bytes)
            for entry in manifest.get("files", []):
                data = zf.read(entry["path"])
                if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                    raise PackageError("DIGEST_MISMATCH")
                if len(data) != entry["byte_length"]:
                    raise PackageError("LENGTH_MISMATCH")
            return manifest
    except PackageError:
        raise
    except Exception as exc:
        raise PackageError("INVALID_PACKAGE") from exc
