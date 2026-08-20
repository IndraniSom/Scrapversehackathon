"""Self-rehashed OCAC opportunity semantic lineage tests."""

import json
from pathlib import Path

import pytest
from test_artifacts import rewrite_json, seeded_demo, update_manifest_hash

from backend.artifacts import ArtifactError, load_demo_bundle


def mutate_selected(root: Path, changes: dict[str, object]) -> None:
    """Apply matching opportunity/assessment mutations and refresh both digests."""
    opportunities_path = root / "opportunities.json"
    assessment_path = root / "assessment.json"
    opportunities = json.loads(opportunities_path.read_text())
    assessment = json.loads(assessment_path.read_text())
    selected = next(
        item
        for item in opportunities["items"]
        if item["id"] == assessment["opportunity"]["id"]
    )
    selected.update(changes)
    assessment["opportunity"] = selected
    rewrite_json(opportunities_path, opportunities)
    rewrite_json(assessment_path, assessment)
    update_manifest_hash(root, "opportunities")
    update_manifest_hash(root, "assessment")


def test_loader_rejects_self_rehashed_cross_tender_alias(tmp_path: Path) -> None:
    """Matching IDs cannot attach selected OCAC documents to unrelated semantics."""
    root = seeded_demo(tmp_path)
    mutate_selected(
        root,
        {
            "source": "WEST_BENGAL",
            "authority": "Unrelated Authority",
            "title": "Unrelated tender",
            "reference_number": "OTHER-1",
            "source_tender_id": "OTHER-1",
            "canonical_url": "https://wbtenders.gov.in/nicgep/app?page=Web",
        },
    )
    with pytest.raises(ArtifactError, match="semantic"):
        load_demo_bundle(root)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("data_mode", "RECORDED_BRIGHT_DATA_SNAPSHOT"),
        ("snapshot_sha256", "e" * 64),
        ("category", "CLOUD"),
        ("published_at", "2026-01-01T00:00:00Z"),
        ("closes_at", "2026-02-01T00:00:00+05:30"),
    ],
)
def test_loader_rejects_self_rehashed_ocac_semantic_field(
    tmp_path: Path, field: str, value: object
) -> None:
    """Every contract-approved OCAC field is bound to reviewed document lineage."""
    root = seeded_demo(tmp_path)
    mutate_selected(root, {field: value})
    with pytest.raises(ArtifactError, match="semantic"):
        load_demo_bundle(root)
