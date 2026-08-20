"""Evidence lookup normalization regressions for digital-text PDF artifacts."""

import pytest
from extraction_helpers import document, evidence, page, proposed, supported_group

from backend.extraction import ExtractionError, verify_extraction


def test_evidence_lookup_treats_private_use_pdf_bullet_as_spacing() -> None:
    """A PDF font bullet may be omitted without weakening other excerpt matching."""
    page_text = (
        "The Bidder must have certification \uf0b7 ISO 9001, "
        "\uf0b7 ISO 27001 \uf0b7 CMMI DEV- Level 3."
    )
    parsed = document().model_copy(
        update={"pages": [page(1, page_text), document().pages[1]]}
    )
    group = supported_group()
    leaf = group.children[0].model_copy(
        update={
            "evidence": [
                evidence(
                    excerpt=(
                        "The Bidder must have certification ISO 9001, ISO 27001 "
                        "CMMI DEV- Level 3."
                    )
                )
            ]
        }
    )
    changed_group = group.model_copy(update={"children": [leaf]})
    verified = verify_extraction(parsed, proposed(changed_group))
    assert verified.extraction_state == "EVIDENCE_VERIFIED"


@pytest.mark.parametrize(
    ("page_text", "excerpt"),
    [
        ("Required: ISO 9001, ISO 27001.", "Required: ISO 9001 ISO 27001."),
        ("Required: ISO 9001 ISO 27001.", "Required: ISO 9001, ISO 27001."),
        ("The required amount is INR 1,200.", "The required amount is INR 1 200."),
    ],
)
def test_evidence_lookup_preserves_commas(page_text: str, excerpt: str) -> None:
    """Comma insertion/removal cannot create a list or spaced-number match."""
    parsed = document().model_copy(
        update={"pages": [page(1, page_text), document().pages[1]]}
    )
    group = supported_group()
    leaf = group.children[0].model_copy(
        update={"evidence": [evidence(excerpt=excerpt)]}
    )
    changed_group = group.model_copy(update={"children": [leaf]})
    with pytest.raises(ExtractionError, match="EXCERPT_NOT_FOUND"):
        verify_extraction(parsed, proposed(changed_group))
