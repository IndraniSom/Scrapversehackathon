"""Working translation invariants: anchor preservation and labeling."""

import pytest

from backend.tender_translation import (
    NON_AUTHORITATIVE_LABEL,
    TranslationParagraph,
    build_translation,
    needs_review,
)


def _para(**overrides: object) -> TranslationParagraph:
    """Build a paragraph preserving numbers, dates, currency, anchors."""
    base: dict[str, object] = {
        "paragraph_id": "p1",
        "original_text": "Fee Rs. 2,00,000 due 2026-09-15 ref NTPC/2024-25/001 anchor p1",
        "translated_text": "शुल्क Rs. 2,00,000 तिथि 2026-09-15 संदर्भ NTPC/2024-25/001 anchor p1",
        "document_id": "doc-1",
        "page_number": 1,
        "document_hash": "c" * 64,
        "anchor": "p1",
    }
    base.update(overrides)
    return TranslationParagraph(**base)  # type: ignore[arg-type]


def test_valid_translation_labeled_non_authoritative() -> None:
    """Valid translation preserves anchors and is labeled non-authoritative."""
    result = build_translation("org-1", "opp-1", "hi", [_para()])
    assert result.is_machine_translation is True
    assert result.disclaimer == NON_AUTHORITATIVE_LABEL
    assert result.paragraphs[0].original_text in "Fee Rs. 2,00,000 due 2026-09-15 ref NTPC/2024-25/001 anchor p1"


def test_missing_number_rejected() -> None:
    """Dropping numbers routes to review."""
    para = _para(translated_text="शुल्क तिथि 2026-09-15 संदर्भ NTPC/2024-25/001 anchor p1")
    with pytest.raises(ValueError, match="MISSING"):
        build_translation("org-1", "opp-1", "hi", [para])
    assert needs_review(ValueError("MISSING_ANCHORS: numbers in p1"))


def test_missing_date_rejected() -> None:
    """Dropping dates is rejected."""
    para = _para(translated_text="शुल्क Rs. 2,00,000 संदर्भ NTPC/2024-25/001 anchor p1")
    with pytest.raises(ValueError, match="MISSING"):
        build_translation("org-1", "opp-1", "hi", [para])


def test_missing_currency_rejected() -> None:
    """Dropping currency is rejected."""
    para = _para(translated_text="शुल्क 2,00,000 तिथि 2026-09-15 संदर्भ NTPC/2024-25/001 anchor p1")
    with pytest.raises(ValueError, match="MISSING"):
        build_translation("org-1", "opp-1", "hi", [para])


def test_missing_reference_rejected() -> None:
    """Dropping reference identifiers is rejected."""
    para = _para(translated_text="शुल्क Rs. 2,00,000 तिथि 2026-09-15 anchor p1")
    with pytest.raises(ValueError, match="MISSING"):
        build_translation("org-1", "opp-1", "hi", [para])


def test_missing_anchor_rejected() -> None:
    """Dropping paragraph anchor is rejected."""
    para = _para(anchor="p1", translated_text="शुल्क Rs. 2,00,000 तिथि 2026-09-15 संदर्भ NTPC/2024-25/001")
    with pytest.raises(ValueError, match="MISSING_ANCHOR"):
        build_translation("org-1", "opp-1", "hi", [para])


def test_cross_tenant_rejected() -> None:
    """Translation crossing tenant document is rejected."""
    para = _para(document_id="doc-1")
    with pytest.raises(ValueError, match="CROSS_TENANT"):
        build_translation(
            "org-1",
            "opp-1",
            "hi",
            [para],
            tenant_chunks=[{"document_id": "doc-2"}],
        )


def test_unsupported_language_rejected() -> None:
    """Unsupported language is rejected."""
    with pytest.raises(ValueError, match="UNSUPPORTED_LANGUAGE"):
        build_translation("org-1", "opp-1", "xx", [_para()])
