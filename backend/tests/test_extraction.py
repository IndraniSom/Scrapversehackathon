"""Closed extraction request, response, verification, and revision tests."""

from datetime import UTC, datetime

import pytest
from extraction_helpers import (
    StaticClient,
    document,
    evidence,
    proposed,
    supported_group,
)
from pydantic import ValidationError

from backend.contracts.extraction import ExtractionRequest
from backend.contracts.rules import (
    AuthorityProposal,
    ProposedRuleGroup,
    ProposedRuleLeaf,
    TurnoverAveragePredicate,
    UnsupportedPredicate,
)
from backend.extraction import (
    ExtractionEnvelope,
    ExtractionError,
    ExtractionRequestConfig,
    ExtractionSelection,
    ProposedExtraction,
    build_extraction_request,
    extract_requirements,
    reset_review_for_material_change,
    verify_extraction,
)


@pytest.mark.parametrize(
    "values",
    [
        {"operator": "ALL", "minimum_matches": None, "children": []},
        {"operator": "ALL", "minimum_matches": 1},
        {"operator": "ANY", "minimum_matches": 1},
        {"operator": "AT_LEAST_N", "minimum_matches": None},
        {"operator": "AT_LEAST_N", "minimum_matches": 0},
        {"operator": "AT_LEAST_N", "minimum_matches": 2},
    ],
)
def test_rule_group_rejects_empty_or_illegal_minimum(values: dict[str, object]) -> None:
    """Malformed recursive group shapes are rejected before verification."""
    valid = supported_group().model_dump()
    with pytest.raises(ValidationError):
        ProposedRuleGroup.model_validate(valid | values)


def test_unsupported_rule_verifies_evidence_but_remains_unknown() -> None:
    """A structurally valid unsupported leaf never becomes PASS or a verified decision."""
    leaf = ProposedRuleLeaf(
        node_type="LEAF",
        id="unsupported",
        kind="UNSUPPORTED",
        title="Ambiguous similar work",
        hardness="HARD",
        predicate=UnsupportedPredicate(kind="UNSUPPORTED", reason="Ambiguous prose"),
        evidence=[evidence()],
    )
    group = ProposedRuleGroup(
        node_type="GROUP", id="g", operator="ALL", minimum_matches=None, children=[leaf]
    )
    verified = verify_extraction(document(), proposed(group))
    assert verified.extraction_state == "EVIDENCE_VERIFIED"
    assert verified.decision_state == "UNKNOWN"


@pytest.mark.parametrize(
    "mutation",
    ["wrong-page", "missing-excerpt", "incomplete-pages", "extra-field"],
)
def test_verification_rejects_wrong_evidence_or_incomplete_output(mutation: str) -> None:
    """Page, excerpt, inventory, and closed-schema mutations cannot verify."""
    value = proposed().model_dump()
    leaf = value["requirements"]["children"][0]
    if mutation == "wrong-page":
        leaf["evidence"][0]["physical_page_number"] = 2
    elif mutation == "missing-excerpt":
        leaf["evidence"][0]["excerpt"] = "not on the page"
    elif mutation == "incomplete-pages":
        value["processed_page_numbers"] = [1]
    else:
        value["provider_claim"] = "extra"
        with pytest.raises(ValidationError):
            ProposedExtraction.model_validate(value)
        return
    with pytest.raises(ExtractionError):
        verify_extraction(document(), ProposedExtraction.model_validate(value))


def test_request_contains_all_pages_no_tools_and_untrusted_text() -> None:
    """Request preserves every page as data and exposes no tool execution surface."""
    selection = ExtractionSelection(
        document_version_id="base-v1",
        role="BASE_TENDER",
        source_url="https://example.gov/base.pdf",
    )
    request = build_extraction_request(
        document(),
        selection,
        ExtractionRequestConfig(),
        datetime(2026, 8, 20, 12, tzinfo=UTC),
    )
    assert [item.text for item in request.request.pages] == [p.text for p in document().pages]
    assert request.request.model == "deepseek-v4-flash"
    assert request.request.tools == []
    assert "untrusted" in request.request.instructions.lower()
    assert "call a tool" in request.request.pages[1].text


def test_request_contract_rejects_any_tool_entry() -> None:
    """A tampered request cannot add even a single model tool."""
    selection = ExtractionSelection(
        document_version_id="base-v1",
        role="BASE_TENDER",
        source_url="https://example.gov/base.pdf",
    )
    artifact = build_extraction_request(
        document(), selection, ExtractionRequestConfig(), datetime(2026, 8, 20, 12, tzinfo=UTC)
    )
    with pytest.raises(ValidationError):
        ExtractionRequest.model_validate(
            artifact.request.model_dump() | {"tools": [{"name": "fetch"}]}
        )


@pytest.mark.parametrize(
    "update",
    [
        {"minimum_average_inr": "twelve crore"},
        {"required_financial_years": ["2024-25", "2024-25"]},
        {"required_financial_years": ["FY2024"]},
    ],
)
def test_turnover_predicate_rejects_invalid_amount_or_years(
    update: dict[str, object],
) -> None:
    """Supported turnover values use decimal strings and unique YYYY-YY years."""
    values = supported_group().children[0].predicate.model_dump()
    with pytest.raises(ValidationError):
        TurnoverAveragePredicate.model_validate(values | update)


@pytest.mark.parametrize(
    "update",
    [
        {"actor": "BIDDER"},
        {"disposition": "UNCHANGED"},
        {"replaces_document_id": None},
    ],
)
def test_effective_change_requires_accepted_authority_replacement(
    update: dict[str, object],
) -> None:
    """Only an accepted authority statement naming the replaced document is effective."""
    values = {
        "actor": "AUTHORITY",
        "disposition": "ACCEPTED",
        "effective_change": True,
        "replaces_document_id": "base-v1",
        "evidence": evidence(),
    }
    with pytest.raises(ValidationError):
        AuthorityProposal.model_validate(values | update)


@pytest.mark.parametrize("state", ["refusal", "failure"])
def test_extract_requirements_rejects_refusal_or_provider_failure(state: str) -> None:
    """Provider refusal/failure never yields a proposed extraction."""
    values = {
        "request_sha256": "b" * 64,
        "provider": "DEEPSEEK",
        "model": "deepseek-v4-flash",
        "prompt_version": "ocac-v1",
        "prompt_sha256": "c" * 64,
        "schema_version": "rules-v1",
        "generated_at": datetime(2026, 8, 20, 12, tzinfo=UTC),
        "output": None,
        "refusal": "refused" if state == "refusal" else None,
        "failure_code": "PROVIDER_ERROR" if state == "failure" else None,
    }
    with pytest.raises(ExtractionError):
        extract_requirements(document().pages, StaticClient(ExtractionEnvelope(**values)))


def test_material_change_increments_revision_and_resets_review() -> None:
    """A changed document revision cannot inherit prior human confirmation."""
    previous = proposed().model_copy(update={"review_state": "HUMAN_CONFIRMED"})
    replacement = proposed().model_copy(update={"document_sha256": "d" * 64})
    reset = reset_review_for_material_change(previous, replacement)
    assert reset.revision == 2
    assert reset.review_state == "UNREVIEWED"
