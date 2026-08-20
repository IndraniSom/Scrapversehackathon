"""Immutable demo bundle generation and fail-fast offline loading."""

import json
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ValidationError

from backend.amendments import assess_versions
from backend.artifact_build import build_assessment_input
from backend.contracts.artifacts import ArtifactRef, DemoBundle, DemoManifest
from backend.contracts.cache import CachedExtraction
from backend.contracts.evaluation import CompanyProfile
from backend.contracts.views import AmendmentImpactView, AssessmentView, OpportunityList
from backend.extraction_import import ExtractionImportError, verify_extraction_directory
from backend.source_proof import (
    ProofVerificationError,
    SourceProofArtifact,
    verify_source_proof,
)
from backend.source_storage import StorageError, atomic_install

ASSESSMENT_AS_OF = datetime(2026, 2, 2, 12, tzinfo=ZoneInfo("Asia/Kolkata"))
STATIC_PATHS = {
    "opportunities": "opportunities.json",
    "source_proof": "source-proof.json",
    "base_extraction": "extractions/base.json",
    "amendment_extraction": "extractions/amendment.json",
    "company": "company-profile.json",
    "assessment": "assessment.json",
    "impact": "amendment-impact.json",
}


class ArtifactError(ValueError):
    """Report safe immutable-bundle generation or validation failure."""


def write_demo_bundle(root: Path) -> DemoBundle:
    """Recompute and atomically publish assessment, impact, then manifest bytes."""
    try:
        try:
            verify_source_proof(root / "source-proof.json")
        except ProofVerificationError as error:
            raise ArtifactError("source proof is invalid") from error
        input = build_assessment_input(root, ASSESSMENT_AS_OF)
        result = assess_versions(input)
        atomic_install(root, "assessment.json", _json_bytes(result.assessment_view))
        atomic_install(root, "amendment-impact.json", _json_bytes(result.impact_view))
        proof = SourceProofArtifact.model_validate_json(
            (root / "source-proof.json").read_bytes()
        )
        paths = STATIC_PATHS | {"raw_snapshot": proof.raw_snapshot_path}
        references = {
            key: ArtifactRef(path=path, sha256=_digest(root / path))
            for key, path in paths.items()
        }
        manifest = DemoManifest(
            version="1",
            opportunity_id=input.opportunity.id,
            assessment_as_of=ASSESSMENT_AS_OF,
            files=references,
        )
        atomic_install(root, "manifest.json", _json_bytes(manifest))
        return load_demo_bundle(root)
    except (OSError, StorageError, ValidationError, ValueError) as error:
        if isinstance(error, ArtifactError):
            raise
        raise ArtifactError("demo bundle generation failed") from error


def load_demo_bundle(root: Path) -> DemoBundle:
    """Verify containment, hashes, proof, lineage, and exact assessment replay."""
    try:
        resolved_root = root.resolve(strict=True)
        manifest = DemoManifest.model_validate_json(
            (resolved_root / "manifest.json").read_bytes()
        )
        paths = _verified_paths(resolved_root, manifest)
        opportunities = OpportunityList.model_validate_json(paths["opportunities"].read_bytes())
        company = CompanyProfile.model_validate_json(paths["company"].read_bytes())
        assessment = AssessmentView.model_validate_json(paths["assessment"].read_bytes())
        impact = AmendmentImpactView.model_validate_json(paths["impact"].read_bytes())
        source_artifact = SourceProofArtifact.model_validate_json(
            paths["source_proof"].read_bytes()
        )
    except ArtifactError:
        raise
    except (OSError, ValidationError) as error:
        raise ArtifactError("bundle artifact is invalid") from error
    try:
        verified_proof = verify_source_proof(paths["source_proof"])
    except ProofVerificationError as error:
        raise ArtifactError("source proof is invalid") from error
    try:
        base, amendment = verify_extraction_directory(resolved_root / "extractions")
    except ExtractionImportError as error:
        raise ArtifactError("extraction lineage is invalid") from error
    if (base, amendment) != (
        _load_cache(paths["base_extraction"]),
        _load_cache(paths["amendment_extraction"]),
    ):
        raise ArtifactError("extraction manifest paths do not match canonical caches")
    _verify_cross_artifact(
        manifest,
        opportunities,
        source_artifact,
        company,
        assessment,
        impact,
        resolved_root,
    )
    return DemoBundle(
        manifest=manifest,
        opportunities=opportunities,
        source_proof=source_artifact,
        verified_proof=verified_proof,
        base_extraction=base,
        amendment_extraction=amendment,
        company=company,
        assessment=assessment,
        impact=impact,
    )


def _verified_paths(root: Path, manifest: DemoManifest) -> dict[str, Path]:
    """Resolve exact canonical paths and verify every referenced byte digest."""
    expected = STATIC_PATHS | {
        "raw_snapshot": manifest.files["raw_snapshot"].path
    }
    if any(manifest.files[key].path != path for key, path in expected.items()):
        raise ArtifactError("manifest path is invalid")
    paths: dict[str, Path] = {}
    for key, reference in manifest.files.items():
        path = (root / reference.path).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ArtifactError("manifest path is invalid")
        if _digest(path) != reference.sha256:
            raise ArtifactError("manifest hash mismatch")
        paths[key] = path
    return paths


def _verify_cross_artifact(
    manifest: DemoManifest,
    opportunities: OpportunityList,
    source: SourceProofArtifact,
    company: CompanyProfile,
    assessment: AssessmentView,
    impact: AmendmentImpactView,
    root: Path,
) -> None:
    """Recompute views and correlate opportunity, proof, company, and documents."""
    if any(item.data_mode == "LIVE" for item in opportunities.items):
        raise ArtifactError("bundle contains an unsupported LIVE claim")
    selected = next(
        (item for item in opportunities.items if item.id == manifest.opportunity_id), None
    )
    if selected is None or selected != assessment.opportunity:
        raise ArtifactError("assessment opportunity lineage is invalid")
    if source.proof.normalized_record not in opportunities.items:
        raise ArtifactError("provider proof opportunity lineage is invalid")
    if source.raw_snapshot_path != manifest.files["raw_snapshot"].path:
        raise ArtifactError("source proof raw path differs from manifest")
    try:
        input = build_assessment_input(root, manifest.assessment_as_of)
    except ValueError as error:
        raise ArtifactError("opportunity semantic lineage is invalid") from error
    if input.company_profile != company:
        raise ArtifactError("company profile lineage is invalid")
    recomputed = assess_versions(input)
    if recomputed.assessment_view != assessment or recomputed.impact_view != impact:
        raise ArtifactError("cached assessment recompute mismatch")


def _load_cache(path: Path) -> CachedExtraction:
    """Load one cache model for exact canonical-path equality."""
    return CachedExtraction.model_validate_json(path.read_bytes())


def _json_bytes(value: BaseModel) -> bytes:
    """Serialize one Pydantic artifact into stable compact UTF-8 JSON bytes."""
    return (
        json.dumps(value.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode()


def _digest(path: Path) -> str:
    """Hash exact artifact bytes without normalizing content."""
    return sha256(path.read_bytes()).hexdigest()
