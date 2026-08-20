"""Zero-provider-request regressions for every approval rejection branch."""

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from source_helpers import temporary_storage_roots
from test_source_policy import NTPC_INPUT, approved_review

from backend.bright_data import BrightDataScraperStudioClient
from backend.source_attempts import CollectionAttemptFailure
from backend.source_policy import PortalReview
from backend.source_runs import CollectionLimits, collect_source


def cppp_review() -> PortalReview:
    """Return a valid CPPP approval that cannot authorize an NTPC input."""
    return approved_review("CPPP")


def unresolved_collection() -> PortalReview:
    """Return an NTPC review without collection approval."""
    return approved_review().model_copy(update={"decision": "LEGAL_VERIFY"})


def unresolved_retention() -> PortalReview:
    """Return an NTPC review without retention approval."""
    return approved_review().model_copy(
        update={"retention_decision": "LEGAL_VERIFY"}
    )


@pytest.mark.parametrize(
    ("review_factory", "inputs", "clock"),
    [
        (cppp_review, [NTPC_INPUT], datetime(2026, 8, 20, 12, tzinfo=UTC)),
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
            [NTPC_INPUT | {"legal_decision": "ALLOW"}],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (approved_review, [NTPC_INPUT], datetime(2026, 8, 19, 12, tzinfo=UTC)),
        (approved_review, [NTPC_INPUT], datetime(2026, 8, 20, 12)),  # noqa: DTZ001
        (
            unresolved_collection,
            [NTPC_INPUT],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
        (
            unresolved_retention,
            [NTPC_INPUT],
            datetime(2026, 8, 20, 12, tzinfo=UTC),
        ),
    ],
)
def test_every_approval_rejection_makes_zero_provider_requests(
    tmp_path: Path,
    review_factory: Callable[[], PortalReview],
    inputs: list[dict[str, str]],
    clock: datetime,
) -> None:
    """Every locally rejected input exits before the HTTP adapter sends anything."""
    requests = 0

    def handler(_: httpx.Request) -> httpx.Response:
        """Count any request that incorrectly crosses the approval boundary."""
        nonlocal requests
        requests += 1
        return httpx.Response(500)

    limits = CollectionLimits(
        staging_directory=tmp_path / "preparation",
        storage_roots=temporary_storage_roots(tmp_path / "preparation"),
        collector_name="collector",
        collector_config_version="v1",
        review=review_factory(),
    )
    with httpx.Client(
        transport=httpx.MockTransport(handler), base_url="https://api.brightdata.com"
    ) as http:
        result = collect_source(
            BrightDataScraperStudioClient(http, "c_test"),
            inputs,
            lambda: clock,
            lambda _: None,
            limits,
        )
    assert isinstance(result, CollectionAttemptFailure)
    assert result.failure_code == "LEGAL_VERIFY_REQUIRED"
    assert requests == 0
    assert not limits.staging_directory.exists()
