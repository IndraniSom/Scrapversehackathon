"""Signed deterministic proposal DOCX and submission ZIP rendering."""

import base64
import hashlib
import hmac
import json
import os
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.export_docx import DocxInput, DocxSection, build_proposal_docx

router = APIRouter()


class PackageSection(BaseModel):
    """Carry one approved, cited, bounded proposal section."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=20_000)
    citation: str | None = Field(default=None, max_length=1000)
    order: int = Field(ge=0)
    state: str


class PackageRequest(BaseModel):
    """Bind locked proposal identity and approved sections for rendering."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    proposal_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=300)
    revision: int = Field(ge=1)
    sections: list[PackageSection] = Field(min_length=1, max_length=200)
    compliance_csv: str = Field(max_length=1_000_000)


def _verified(body: bytes, signature: str | None) -> bool:
    """Verify exact request bytes against configured worker HMAC."""
    secret = os.getenv("BIDRADAR_WORKER_HMAC_SECRET")
    if not signature or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def build_submission_zip(payload: PackageRequest) -> tuple[bytes, dict[str, str]]:
    """Render deterministic DOCX, compliance CSV, and hash manifest ZIP."""
    docx = build_proposal_docx(DocxInput(proposal_id=payload.proposal_id, title=payload.title, revision=payload.revision, sections=[DocxSection(**section.model_dump()) for section in payload.sections]))
    files = {"proposal.docx": docx, "compliance.csv": payload.compliance_csv.encode()}
    manifest = {name: hashlib.sha256(content).hexdigest() for name, content in files.items()}
    files["manifest.json"] = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name in sorted(files):
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, files[name])
    return output.getvalue(), manifest


@router.post("/internal/v1/proposal-package")
async def proposal_package(request: Request, worker_signature: str | None = Header(default=None, alias="X-Worker-Signature")) -> dict[str, object]:
    """Return base64 ZIP and SHA-256 only for valid signed package input."""
    body = await request.body()
    if not _verified(body, worker_signature):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})
    try:
        payload = PackageRequest.model_validate(json.loads(body))
    except (json.JSONDecodeError, ValidationError) as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_PACKAGE_INPUT"}) from error
    archive, manifest = build_submission_zip(payload)
    return {"archive": base64.b64encode(archive).decode(), "digest": hashlib.sha256(archive).hexdigest(), "manifest": manifest}
