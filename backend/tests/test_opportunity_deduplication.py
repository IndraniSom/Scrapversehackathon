"""Deduplication and versioning tests for Task 9."""

import pytest

from backend.contracts.source import OpportunitySummary
from backend.opportunity_deduplication import (
    classify_relationship,
    is_allowlisted_url,
    is_cross_portal_similar,
    is_exact_identity,
    opportunity_digest,
    queue_document_fetch,
    should_create_new_version,
)
from backend.source_provider import (
    canonical_opportunity_digest,
    is_allowlisted_document_url,
    opportunity_version_digest,
    stable_source_key,
)


def base_opportunity(overrides: dict | None = None) -> dict:
    """Return a minimal opportunity dict for mutation tests."""
    base = {
        "source": "NTPC",
        "source_tender_id": "NTPC-101",
        "authority": "NTPC Limited",
        "title": "ERP application maintenance",
        "reference_number": "NTPC/ERP/2026/101",
        "category": "ERP",
        "canonical_url": "https://ntpctender.ntpc.co.in/NITDetails/NITs/101",
        "closes_at": "2026-09-01T12:00:00+05:30",
        "document_hashes": ["abc123"],
    }
    if overrides:
        base.update(overrides)
    return base


def test_stable_source_key_combines_source_and_id() -> None:
    """Stable key must be source:sourceTenderId and differ by source."""
    assert stable_source_key("NTPC", "X") == "NTPC:X"
    assert stable_source_key("CPPP", "X") != stable_source_key("NTPC", "X")


def test_unchanged_replay_requires_no_new_version() -> None:
    """Identical fields must produce identical digests and no new version."""
    opp = base_opportunity()
    d1 = opportunity_digest(opp)
    d2 = opportunity_digest(base_opportunity())
    assert d1 == d2
    assert should_create_new_version(d1, d2) is False


def test_changed_deadline_triggers_new_version() -> None:
    """A changed closes_at must change digest and require a new version."""
    d1 = opportunity_digest(base_opportunity())
    d2 = opportunity_digest(base_opportunity({"closes_at": "2026-09-15T12:00:00+05:30"}))
    assert d1 != d2
    assert should_create_new_version(d1, d2) is True


def test_new_document_triggers_new_version() -> None:
    """An additional document hash must change digest and require a new version."""
    d1 = opportunity_digest(base_opportunity())
    d2 = opportunity_digest(base_opportunity({"document_hashes": ["abc123", "def456"]}))
    assert d1 != d2
    assert should_create_new_version(d1, d2) is True


def test_corrigendum_relationship() -> None:
    """A corrigendum title with same authority should be classified as corrigendum."""
    source = base_opportunity({"document_hashes": ["hash-source"]})
    target = base_opportunity({"title": "Corrigendum: ERP application maintenance", "source_tender_id": "NTPC-101-CORR", "document_hashes": ["hash-corr"]})
    rel = classify_relationship(source, target)
    assert rel is not None and rel["kind"] == "corrigendum" and rel["status"] == "confirmed"


def test_cross_portal_similarity_creates_candidate() -> None:
    """High title similarity across portals should yield a candidate."""
    a = base_opportunity({"source": "CPPP", "source_tender_id": "CPPP-1", "title": "Cloud operations support services for enterprise", "document_hashes": ["hash-a"]})
    b = base_opportunity({"source": "NTPC", "source_tender_id": "NTPC-99", "title": "Cloud operations support services for enterprise", "document_hashes": ["hash-b"]})
    rel = classify_relationship(a, b)
    assert rel is not None and rel["status"] == "candidate"
    assert is_cross_portal_similar(a, b) is True


def test_false_duplicate_is_rejected() -> None:
    """Low similarity and different data should be rejected as not a duplicate."""
    a = base_opportunity({"title": "Cloud operations support services", "document_hashes": ["hash-a"]})
    b = base_opportunity({"source": "WEST_BENGAL", "source_tender_id": "WB-999", "title": "Road construction and maintenance", "document_hashes": ["hash-b"]})
    assert classify_relationship(a, b) is None
    assert is_cross_portal_similar(a, b) is False


def test_exact_identity_is_confirmed_duplicate() -> None:
    """Exact source and sourceTenderId must be a confirmed duplicate."""
    a = base_opportunity()
    b = base_opportunity()
    assert is_exact_identity(a, b) is True
    rel = classify_relationship(a, b)
    assert rel is not None and rel["kind"] == "duplicate" and rel["status"] == "confirmed"


def test_allowlisted_fetch_permits_gov_and_rejects_untrusted() -> None:
    """Allowlisted hosts pass, evil or http hosts fail."""
    assert is_allowlisted_url("https://ntpctender.ntpc.co.in/NITDetails/NITs/101") is True
    assert is_allowlisted_document_url("https://www.eprocure.gov.in/epublish/app") is True
    assert is_allowlisted_url("https://odisha.gov.in/sites/default/files/2026-01/RFP.pdf") is True
    assert is_allowlisted_url("https://evil.example/NITDetails/NITs/101") is False
    assert is_allowlisted_url("http://ntpctender.ntpc.co.in/NITDetails/NITs/101") is False
    with pytest.raises(ValueError):
        queue_document_fetch("https://evil.example/doc.pdf")
    assert queue_document_fetch("https://ntpctender.ntpc.co.in/NITDetails/NITs/101") is True


def test_canonical_digest_is_deterministic() -> None:
    """Canonical digest must be stable for same input and change when fields change."""
    fields = {"a": "1", "b": "2"}
    assert canonical_opportunity_digest(fields) == canonical_opportunity_digest({"b": "2", "a": "1"})
    assert canonical_opportunity_digest({"a": "1"}) != canonical_opportunity_digest({"a": "2"})


def test_version_digest_includes_mode_preservation_indirectly() -> None:
    """OpportunitySummary preserves LIVE/RECORDED/MANUAL labels without digest collision."""
    summary = OpportunitySummary(
        source="NTPC",
        source_tender_id="NTPC-101",
        reference_number="R1",
        authority="NTPC Limited",
        title="ERP application maintenance",
        category="OTHER",
        published_at=None,
        closes_at=None,
        canonical_url="https://ntpctender.ntpc.co.in/NITDetails/NITs/101",
        id="ntpc-abc",
        data_mode="LIVE",
        snapshot_sha256="a" * 64,
    )
    d_live = opportunity_version_digest(summary, ["h1"])
    summary2 = summary.model_copy(update={"data_mode": "RECORDED_BRIGHT_DATA_SNAPSHOT"})
    # data_mode not in digest but must be preserved separately; digests equal
    d_recorded = opportunity_version_digest(summary2, ["h1"])
    assert d_live == d_recorded
    assert summary.data_mode == "LIVE"
    assert summary2.data_mode == "RECORDED_BRIGHT_DATA_SNAPSHOT"


def test_preserves_live_recorded_manual_labels() -> None:
    """Every view must preserve all three data mode labels distinctly."""
    for mode in ["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"]:
        s = OpportunitySummary(
            source="NTPC",
            source_tender_id="X",
            reference_number=None,
            authority="A",
            title="T",
            category="OTHER",
            published_at=None,
            closes_at=None,
            canonical_url="https://ntpctender.ntpc.co.in/NITDetails/NITs/12",
            id="ntpc-x",
            data_mode=mode,  # type: ignore[arg-type]
            snapshot_sha256="b" * 64,
        )
        assert s.data_mode == mode
