"""Portal-specific human approval and source-target validation."""

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from typing import Literal
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, model_validator

from backend.contracts.source import HttpsUrl, MetadataText

_POLICIES = {
    "NTPC": "https://ntpctender.ntpc.co.in/Index/Disclaimer",
    "CPPP": "https://www.eprocure.gov.in/eprocure/app?page=Disclaimer&service=page",
    "WEST_BENGAL": "https://www.wbtenders.gov.in/nicgep/app?page=Disclaimer&service=page",
}
_INDIA_TIME = ZoneInfo("Asia/Kolkata")


class ApprovalError(ValueError):
    """Report a local approval mismatch before provider traffic."""


class PortalReview(BaseModel):
    """Record named-human collection and retention decisions for one portal."""

    model_config = ConfigDict(extra="forbid")
    portal: Literal["CPPP", "WEST_BENGAL", "NTPC"]
    decision: Literal["ALLOW", "DENY", "LEGAL_VERIFY"]
    retention_decision: Literal["ALLOW", "DENY", "LEGAL_VERIFY"]
    reviewed_at: date
    policy_url: HttpsUrl
    reviewer: MetadataText
    reviewer_kind: Literal["HUMAN"]

    @model_validator(mode="after")
    def validate_policy_surface(self) -> "PortalReview":
        """Bind the declared portal to its reviewed official policy surface."""
        if self.policy_url != _POLICIES[self.portal]:
            raise ValueError("policy URL does not match portal")
        return self


def validate_collection_inputs(
    inputs: Sequence[Mapping[str, str]], review: PortalReview, now: datetime
) -> list[dict[str, str]]:
    """Return approved normalized inputs or reject before provider traffic."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise ApprovalError("approval clock must be timezone-aware")
    if review.reviewed_at > portal_calendar_date(now, review.portal):
        raise ApprovalError("review date is in the future")
    if review.decision != "ALLOW" or review.retention_decision != "ALLOW":
        raise ApprovalError("collection and retention require ALLOW")
    if not inputs or len(inputs) > 10:
        raise ApprovalError("collection input count is outside the approved bound")
    validated: list[dict[str, str]] = []
    for item in inputs:
        if set(item) != {"url"}:
            raise ApprovalError("collector input must contain only url")
        url = item["url"]
        if not _target_matches_review(url, review.portal):
            raise ApprovalError("collector target does not match portal approval")
        validated.append({"url": url})
    return validated


def _target_matches_review(url: str, portal: str) -> bool:
    """Check one credential-free HTTPS URL against a supported portal route."""
    parsed = urlsplit(url)
    try:
        port = parsed.port
    except ValueError:
        return False
    if (
        parsed.scheme != "https"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or port is not None
    ):
        return False
    query = parse_qs(parsed.query, keep_blank_values=True)
    if portal == "NTPC":
        return (
            parsed.hostname == "ntpctender.ntpc.co.in"
            and parsed.path == "/Index/Search"
            and (
                not query
                or (
                    set(query) == {"Type", "Region"}
                    and query["Type"] == ["Reg"]
                    and len(query["Region"]) == 1
                    and query["Region"][0].isdigit()
                )
            )
        )
    if portal == "CPPP":
        return (
            parsed.hostname == "www.eprocure.gov.in"
            and parsed.path == "/epublish/app"
            and query == {"page": ["FrontEndLatestActiveTenders"], "service": ["page"]}
        )
    return False


def portal_calendar_date(moment: datetime, portal: str) -> date:
    """Return the official local calendar date used for a reviewed Indian portal."""
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ApprovalError("approval clock must be timezone-aware")
    if portal in {"NTPC", "CPPP", "WEST_BENGAL"}:
        return moment.astimezone(_INDIA_TIME).date()
    raise ApprovalError("portal calendar is unsupported")
