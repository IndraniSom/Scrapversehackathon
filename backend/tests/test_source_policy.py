"""Human approval and portal-target binding tests."""

from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from backend.source_policy import (
    ApprovalError,
    PortalReview,
    validate_collection_inputs,
)

NTPC_INPUT = {"url": "https://ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1"}


def approved_review(portal: str = "NTPC") -> PortalReview:
    """Build one literal named-human approval for policy tests."""
    policies = {
        "NTPC": "https://ntpctender.ntpc.co.in/Index/Disclaimer",
        "CPPP": "https://www.eprocure.gov.in/eprocure/app?page=Disclaimer&service=page",
        "WEST_BENGAL": "https://www.wbtenders.gov.in/nicgep/app?page=Disclaimer&service=page",
    }
    return PortalReview.model_validate(
        {
            "portal": portal,
            "decision": "ALLOW",
            "retention_decision": "ALLOW",
            "reviewed_at": "2026-08-20",
            "policy_url": policies[portal],
            "reviewer": "Asha Rao",
            "reviewer_kind": "HUMAN",
        }
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("reviewer", ""),
        ("reviewer_kind", "AGENT"),
        ("policy_url", "http://ntpctender.ntpc.co.in/Index/Disclaimer"),
        ("policy_url", "https://example.com/policy"),
    ],
)
def test_review_rejects_nonhuman_or_unbound_policy(field: str, value: str) -> None:
    """A review names a human and the exact HTTPS policy surface for its portal."""
    review = approved_review().model_dump(mode="json") | {field: value}
    with pytest.raises(ValidationError):
        PortalReview.model_validate(review)


def test_approved_ntpc_input_is_preserved_without_allow_marker() -> None:
    """Validation returns only the original supported collector input shape."""
    validated = validate_collection_inputs(
        [NTPC_INPUT], approved_review(), datetime(2026, 8, 20, 12, tzinfo=UTC)
    )
    assert validated == [NTPC_INPUT]


@pytest.mark.parametrize(
    ("review", "inputs", "now"),
    [
        (
            lambda: approved_review("CPPP"),
            [NTPC_INPUT],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            approved_review,
            [{"url": "https://evil.example/Index/Search?Type=Reg&Region=1"}],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            approved_review,
            [{"url": "https://ntpctender.ntpc.co.in/Index/Disclaimer"}],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            approved_review,
            [{"url": "https://user:pass@ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1"}],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            approved_review,
            [{"url": "https://ntpctender.ntpc.co.in:bad/Index/Search?Type=Reg&Region=1"}],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            approved_review,
            [NTPC_INPUT | {"legal_decision": "ALLOW"}],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            approved_review,
            [NTPC_INPUT],
            datetime(2026, 8, 19, 12, tzinfo=UTC),
        ),
        (approved_review, [NTPC_INPUT], datetime(2026, 8, 20, 12)),  # noqa: DTZ001
    ],
)
def test_mismatched_or_unsupported_inputs_are_rejected(
    review: Callable[[], PortalReview],
    inputs: list[dict[str, str]],
    now: datetime,
) -> None:
    """Every input must match the dated human approval and supported portal route."""
    with pytest.raises(ApprovalError):
        validate_collection_inputs(inputs, review(), now)


@pytest.mark.parametrize("field", ["decision", "retention_decision"])
def test_both_approval_dimensions_are_required(field: str) -> None:
    """Collection and retention must each be explicitly allowed."""
    review = approved_review().model_copy(update={field: "LEGAL_VERIFY"})
    with pytest.raises(ApprovalError):
        validate_collection_inputs(
            [NTPC_INPUT], review, datetime(2026, 8, 20, 12, tzinfo=UTC)
        )
