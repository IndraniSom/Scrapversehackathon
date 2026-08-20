"""Immutable demo bundle generation, containment, and replay tests."""

import json
import shutil
from hashlib import sha256
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from backend.artifact_build import demo_company_profile
from backend.artifacts import ArtifactError, load_demo_bundle, write_demo_bundle

SOURCE_DEMO = Path(__file__).parents[1] / "data" / "demo"


def seed_prerequisites(tmp_path: Path) -> Path:
    """Copy trusted prerequisite artifacts and write the synthetic company input."""
    root = tmp_path / "demo"
    root.mkdir()
    for name in ("opportunities.json", "source-proof.json"):
        shutil.copy2(SOURCE_DEMO / name, root / name)
    shutil.copytree(SOURCE_DEMO / "raw", root / "raw")
    shutil.copytree(SOURCE_DEMO / "extractions", root / "extractions")
    (root / "company-profile.json").write_text(
        demo_company_profile().model_dump_json() + "\n"
    )
    return root


def seeded_demo(tmp_path: Path) -> Path:
    """Generate a complete bundle from a copied prerequisite set."""
    root = seed_prerequisites(tmp_path)
    write_demo_bundle(root)
    return root


def rewrite_json(path: Path, mutate: object) -> None:
    """Rewrite one controlled JSON mutation with stable compact bytes."""
    path.write_text(json.dumps(mutate, sort_keys=True, separators=(",", ":")) + "\n")


def update_manifest_hash(root: Path, key: str) -> None:
    """Update one manifest digest so semantic validation, not hashing, is exercised."""
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    relative = manifest["files"][key]["path"]
    manifest["files"][key]["sha256"] = sha256((root / relative).read_bytes()).hexdigest()
    rewrite_json(manifest_path, manifest)


def test_bundle_recomputes_truthful_no_bid_to_review_story(tmp_path: Path) -> None:
    """Missing certificate anchors remain unknown across the authority change."""
    bundle = load_demo_bundle(seeded_demo(tmp_path))
    assert bundle.assessment.base_assessment.recommendation == "NO_BID"
    assert bundle.assessment.amended_assessment.recommendation == "REVIEW"
    assert bundle.impact.authority_change_applied is True
    assert bundle.assessment.base_assessment.failed_hard_rule_count == 1
    assert bundle.assessment.amended_assessment.failed_hard_rule_count == 0
    assert bundle.assessment.base_assessment.unknown_applicable_rule_count == 3
    assert bundle.assessment.amended_assessment.unknown_applicable_rule_count == 3
    assert len(bundle.manifest.files) == 8


def test_manifest_rejects_escape_before_read(tmp_path: Path) -> None:
    """A manifest path cannot escape the canonical demo root."""
    root = seeded_demo(tmp_path)
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"]["company"]["path"] = "../company-profile.json"
    rewrite_json(manifest_path, manifest)
    with pytest.raises(ArtifactError, match="path"):
        load_demo_bundle(root)


def test_manifest_rejects_exact_byte_hash_mismatch(tmp_path: Path) -> None:
    """A mutated artifact fails before any cached data is returned."""
    root = seeded_demo(tmp_path)
    (root / "company-profile.json").write_text("{}\n")
    with pytest.raises(ArtifactError, match="hash"):
        load_demo_bundle(root)


def test_loader_rejects_self_rehashed_cached_assessment_drift(tmp_path: Path) -> None:
    """A self-rehashed recommendation mutation cannot defeat recomputation."""
    root = seeded_demo(tmp_path)
    path = root / "assessment.json"
    assessment = json.loads(path.read_text())
    assessment["base_assessment"]["recommendation"] = "BID"
    rewrite_json(path, assessment)
    update_manifest_hash(root, "assessment")
    with pytest.raises(ArtifactError, match="recompute"):
        load_demo_bundle(root)


def test_loader_rejects_self_rehashed_non_https_view(tmp_path: Path) -> None:
    """A self-rehashed non-HTTPS public URL remains invalid."""
    root = seeded_demo(tmp_path)
    path = root / "assessment.json"
    assessment = json.loads(path.read_text())
    assessment["opportunity"]["canonical_url"] = "http://example.test/tender"
    rewrite_json(path, assessment)
    update_manifest_hash(root, "assessment")
    with pytest.raises(ArtifactError, match="invalid"):
        load_demo_bundle(root)


def test_loader_rejects_self_rehashed_extraction_lineage(tmp_path: Path) -> None:
    """Manifest hashes cannot legitimize a swapped extraction role."""
    root = seeded_demo(tmp_path)
    path = root / "extractions" / "amendment.json"
    cached = json.loads(path.read_text())
    cached["document"]["role"] = "BASE_TENDER"
    rewrite_json(path, cached)
    update_manifest_hash(root, "amendment_extraction")
    with pytest.raises(ArtifactError, match="extraction"):
        load_demo_bundle(root)


def test_loader_rejects_self_rehashed_raw_proof_mutation(tmp_path: Path) -> None:
    """Manifest hashing cannot bypass the source proof's content address."""
    root = seeded_demo(tmp_path)
    raw = next((root / "raw").glob("*.json"))
    raw.write_bytes(raw.read_bytes() + b" ")
    update_manifest_hash(root, "raw_snapshot")
    with pytest.raises(ArtifactError, match="source proof"):
        load_demo_bundle(root)


def test_writer_validates_proof_before_publishing_outputs(tmp_path: Path) -> None:
    """Invalid prerequisite proof leaves assessment, impact, and manifest absent."""
    root = seed_prerequisites(tmp_path)
    raw = next((root / "raw").glob("*.json"))
    raw.write_bytes(raw.read_bytes() + b" ")
    with pytest.raises(ArtifactError, match="source proof"):
        write_demo_bundle(root)
    assert not (root / "assessment.json").exists()
    assert not (root / "amendment-impact.json").exists()
    assert not (root / "manifest.json").exists()


def test_generated_views_validate_against_frozen_openapi(tmp_path: Path) -> None:
    """Generated assessment and impact instances satisfy their frozen schemas."""
    root = seeded_demo(tmp_path)
    contract = json.loads((SOURCE_DEMO.parents[2] / "contracts" / "api-v1.openapi.json").read_text())
    validator = Draft202012Validator(contract, format_checker=FormatChecker())
    for name, filename in (
        ("AssessmentView", "assessment.json"),
        ("AmendmentImpactView", "amendment-impact.json"),
    ):
        schema = contract["components"]["schemas"][name]
        errors = list(validator.evolve(schema=schema).iter_errors(json.loads((root / filename).read_text())))
        assert errors == []
