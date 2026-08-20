"""Focused structured assertions for BidRadar smoke-test API payloads."""

from collections import Counter

OPPORTUNITY_ID = "ocac-pond-monitoring-26001"
RAW_SHA256 = "b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef"
BASE_SHA256 = "f1bc41678cd71b0d20cd2432cf579b840af7a52152b72d8c55a5ee129b927afd"
AMENDMENT_SHA256 = "ccbe30fa4f886087bb09d94cf1073fca97e66789957ba2da63c09a5e7fa657a1"


class SmokeAssertionError(RuntimeError):
    """Report the exact structured smoke invariant that failed."""


def _object(value: object, label: str) -> dict[str, object]:
    """Return one nested object or fail with its precise smoke label."""
    if not isinstance(value, dict):
        raise SmokeAssertionError(f"{label} must be an object")
    return value


def check_inventory(opportunities: dict[str, object], proof: dict[str, object]) -> None:
    """Check exact inventory counts and sole recorded-row proof correlation."""
    items = opportunities.get("items")
    rows = [_object(item, "opportunity row") for item in items] if isinstance(items, list) else []
    if opportunities.get("total") != 7 or len(rows) != 7:
        raise SmokeAssertionError("opportunity total must equal seven items")
    if Counter(str(item.get("source")) for item in rows) != Counter({"CPPP": 2, "WEST_BENGAL": 2, "NTPC": 2, "ODISHA": 1}):
        raise SmokeAssertionError("opportunity source distribution must be 2/2/2/1")
    if Counter(str(item.get("data_mode")) for item in rows) != Counter({"MANUAL_FIXTURE": 6, "RECORDED_BRIGHT_DATA_SNAPSHOT": 1}):
        raise SmokeAssertionError("opportunity modes must be six manual and one recorded")
    recorded = [item for item in rows if item.get("data_mode") == "RECORDED_BRIGHT_DATA_SNAPSHOT"]
    normalized = _object(proof.get("normalized_record"), "proof normalized record")
    if len(recorded) != 1 or recorded[0] != normalized or recorded[0].get("snapshot_sha256") != RAW_SHA256:
        raise SmokeAssertionError("sole recorded opportunity must equal normalized proof/hash")


def check_source_proof(proof: dict[str, object]) -> None:
    """Check verified provider branch, chosen run, mode, and raw hash."""
    actual = (proof.get("status"), proof.get("data_mode"), proof.get("provider_run_id"), proof.get("raw_snapshot_sha256"))
    if actual != ("VERIFIED", "RECORDED_BRIGHT_DATA_SNAPSHOT", "j_mt0i928kyu57telkk", RAW_SHA256):
        raise SmokeAssertionError("verified source proof run/mode/hash drift")


def check_assessment(detail: dict[str, object]) -> str:
    """Check selected ID, truthful outcomes, UNKNOWN counts, and document hashes."""
    selected = _object(detail.get("opportunity"), "assessed opportunity")
    base = _object(detail.get("base_assessment"), "base assessment")
    amended = _object(detail.get("amended_assessment"), "amended assessment")
    base_document = _object(base.get("document"), "base document")
    amended_document = _object(amended.get("document"), "amended document")
    actual = (selected.get("id"), base.get("recommendation"), base.get("failed_hard_rule_count"), base.get("unknown_applicable_rule_count"), amended.get("recommendation"), amended.get("failed_hard_rule_count"), amended.get("unknown_applicable_rule_count"), base_document.get("sha256"), amended_document.get("sha256"))
    if actual != (OPPORTUNITY_ID, "NO_BID", 1, 3, "REVIEW", 0, 3, BASE_SHA256, AMENDMENT_SHA256):
        raise SmokeAssertionError("assessment outcome/count/document lineage drift")
    return str(base_document.get("id"))


def check_amendment(impact: dict[str, object], base_document_id: str) -> None:
    """Check REVIEW transition and accepted authority replacement lineage."""
    base = _object(impact.get("base_document"), "impact base document")
    amendment = _object(impact.get("amendment_document"), "impact amendment document")
    statement = _object(impact.get("authority_statement"), "authority statement")
    actual = (impact.get("opportunity_id"), impact.get("base_recommendation"), impact.get("amended_recommendation"), impact.get("authority_change_applied"), base.get("sha256"), amendment.get("sha256"), statement.get("actor"), statement.get("disposition"), statement.get("effective_change"), statement.get("replaces_document_id"))
    expected = (OPPORTUNITY_ID, "NO_BID", "REVIEW", True, BASE_SHA256, AMENDMENT_SHA256, "AUTHORITY", "ACCEPTED", True, base_document_id)
    if actual != expected:
        raise SmokeAssertionError("amendment outcome/authority/document lineage drift")


def verify_api_payloads(opportunities: dict[str, object], proof: dict[str, object], detail: dict[str, object], impact: dict[str, object]) -> None:
    """Run all focused structured smoke assertions in dependency order."""
    check_inventory(opportunities, proof)
    check_source_proof(proof)
    check_amendment(impact, check_assessment(detail))
