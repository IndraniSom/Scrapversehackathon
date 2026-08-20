"""Regression tests for repository policy and frozen-contract validation."""

import json
from copy import deepcopy
from pathlib import Path
from runpy import run_path
from typing import Protocol, TypedDict

import pytest

ROOT = Path(__file__).resolve().parents[2]
TARGETS = {
    "assessment.manual.json": "AssessmentViewEnvelope", "amendment-impact.manual.json": "AmendmentImpactViewEnvelope",
    "opportunities.manual.json": "OpportunityListEnvelope", "source-proof.manual.json": "SourceProofViewEnvelope",
}


class Checker(Protocol):
    """Describe the public line-checker callable consumed by these tests."""
    def __call__(self, paths: list[Path], limit: int = 199) -> list[object]:
        """Return policy violations for the supplied paths."""


class ExampleTarget(TypedDict):
    """Pair a response schema name with one loaded example document."""
    schema_name: str
    instance: object


class Validator(Protocol):
    """Describe the shared contract validator callable consumed by tests."""
    def __call__(self, contract: dict[str, object], examples: dict[str, ExampleTarget]) -> None:
        """Validate the OpenAPI document and named response examples."""


def load_checker() -> Checker:
    """Load the repository checker from the tools directory."""
    return run_path(str(ROOT / "tools/check_code_file_lengths.py"))["check_paths"]


def load_contract_validator() -> tuple[Validator, type[ValueError]]:
    """Load the contract validator and its stable failure type."""
    namespace = run_path(str(ROOT / "tools/validate_contract.py"))
    return namespace["validate_contract_document"], namespace["ContractValidationError"]


def load_contract_fixtures() -> tuple[dict[str, object], dict[str, ExampleTarget]]:
    """Load independent copies of the frozen contract and named examples."""
    contract = json.loads((ROOT / "contracts/api-v1.openapi.json").read_text(encoding="utf-8"))
    examples = {
        name: {
            "schema_name": schema,
            "instance": json.loads((ROOT / "contracts/examples" / name).read_text(encoding="utf-8")),
        }
        for name, schema in TARGETS.items()
    }
    return contract, examples


def test_reports_files_at_or_above_200_lines(tmp_path: Path) -> None:
    """Report a supported code file when it reaches the forbidden 200th line."""
    oversized = tmp_path / "oversized.py"
    oversized.write_text("pass\n" * 200, encoding="utf-8")
    violations = load_checker()([oversized])
    assert [(item.path, item.line_count) for item in violations] == [(oversized, 200)]


def test_accepts_199_lines_and_counts_a_final_unterminated_line(tmp_path: Path) -> None:
    """Accept the maximum and count a final physical line without a newline."""
    allowed = tmp_path / "allowed.ts"
    allowed.write_text("line\n" * 198 + "line", encoding="utf-8")
    assert load_checker()([allowed]) == []


def test_scans_in_order_while_excluding_generated_inputs(tmp_path: Path) -> None:
    """Sort findings and exclude dependencies and exact private-data paths."""
    first = tmp_path / "a.tsx"
    second = tmp_path / "z.mjs"
    dependency = tmp_path / "node_modules/ignored.js"
    private = tmp_path / "backend/data/private-demo/ignored.py"
    authored = tmp_path / "frontend/components/generated/authored.ts"
    authored_out = tmp_path / "frontend/components/out/authored.ts"
    generated_out = tmp_path / "frontend/out/generated.ts"
    for file_path in (first, second, dependency, private, authored, authored_out, generated_out):
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("line\n" * 200, encoding="utf-8")
    assert [item.path for item in load_checker()([tmp_path])] == [
        first,
        authored,
        authored_out,
        second,
    ]


def test_rejects_invalid_limits_and_missing_paths(tmp_path: Path) -> None:
    """Reject invalid caller input instead of silently weakening checks."""
    checker = load_checker()
    with pytest.raises(ValueError, match="non-negative"):
        checker([tmp_path], limit=-1)
    with pytest.raises(FileNotFoundError):
        checker([tmp_path / "missing"])


def test_validates_frozen_examples_and_a_separate_unknown_input() -> None:
    """Accept the honest transition and a distinct schema-valid UNKNOWN scenario."""
    validate, _ = load_contract_validator()
    contract, examples = load_contract_fixtures()
    unknown_examples = deepcopy(examples)
    unknown_examples["unknown.contract-test.json"] = deepcopy(examples["assessment.manual.json"])
    assessment = unknown_examples["unknown.contract-test.json"]["instance"]
    profile = assessment["data"]["company_profile"]
    profile["bidder_legal_entity_id"] = None
    profile["turnover_evidence"][0]["legal_entity_id"] = None
    for assessment_name in ("base_assessment", "amended_assessment"):
        view = assessment["data"][assessment_name]
        view["recommendation"] = "REVIEW"
        view["rule_results"][0]["evaluation"] = "UNKNOWN"
        view["rule_results"][0]["children"][0]["evaluation"] = "UNKNOWN"
        view["unknown_applicable_rule_count"] = 1
        view["failed_hard_rule_count"] = 0
    project = {
        "id": "project-001", "title": "Completed platform migration", "client": "Example Client",
        "value_inr": "5000000.00", "completion_state": "COMPLETED", "completed_at": "2026-01-01",
        "similar_work_confirmed": True, "evidence_reference": "completion-certificate-001",
    }
    assessment["data"]["company_profile"]["projects"] = [project]
    validate(contract, examples)
    validate(contract, unknown_examples)


def test_rejects_schema_drift_and_invalid_rule_shapes() -> None:
    """Reject unresolved schemas, closed-field drift, and invalid rule shapes."""
    validate, validation_error = load_contract_validator()
    contract, examples = load_contract_fixtures()
    broken_ref = deepcopy(contract)
    envelope = broken_ref["components"]["schemas"]["OpportunityListEnvelope"]
    envelope["properties"]["data"]["$ref"] = "#/components/schemas/Missing"
    with pytest.raises(validation_error, match="unresolved"):
        validate(broken_ref, examples)
    extra = deepcopy(examples)
    extra["source-proof.manual.json"]["instance"]["data"]["provider_claim"] = "x"
    with pytest.raises(validation_error, match="source-proof.manual.json"):
        validate(contract, extra)
    group_examples = deepcopy(examples)
    assessment = group_examples["assessment.manual.json"]["instance"]["data"]
    group = assessment["amended_assessment"]["requirements"]
    group.update(operator="AT_LEAST_N", minimum_matches=len(group["children"]) + 1)
    with pytest.raises(validation_error, match="minimum_matches"):
        validate(contract, group_examples)
    mismatched = deepcopy(examples)
    assessment = mismatched["assessment.manual.json"]["instance"]["data"]
    leaf = assessment["base_assessment"]["requirements"]["children"][0]
    leaf["kind"] = "CERTIFICATION"
    with pytest.raises(validation_error, match="assessment.manual.json"):
        validate(contract, mismatched)
    for assessment_name in ("base_assessment", "amended_assessment"):
        unknown_count = deepcopy(examples)
        assessment = unknown_count["assessment.manual.json"]["instance"]["data"]
        assessment[assessment_name]["unknown_applicable_rule_count"] = 1
        with pytest.raises(validation_error, match="three UNKNOWN certifications"):
            validate(contract, unknown_count)
    for field, value in (
        ("actor", "BIDDER"),
        ("disposition", "REJECTED"),
        ("disposition", "UNCHANGED"),
        ("disposition", "AMBIGUOUS"),
        ("replaces_document_id", None),
    ):
        invalid_authority = deepcopy(examples)
        impact = invalid_authority["amendment-impact.manual.json"]["instance"]["data"]
        statement = impact["authority_statement"]
        statement[field] = value
        with pytest.raises(validation_error, match="amendment-impact.manual.json"):
            validate(contract, invalid_authority)
    alternate = deepcopy(examples)
    target = alternate.pop("amendment-impact.manual.json")
    alternate["alternate-transition.contract-test.json"] = target
    impact = target["instance"]["data"]
    impact.update(base_recommendation="BID", amended_recommendation="NO_BID", authority_change_applied=False)
    impact["authority_statement"].update(actor="BIDDER", disposition="REJECTED", effective_change=False, replaces_document_id=None)
    with pytest.raises(validation_error, match="alternate-transition.contract-test.json"):
        validate(contract, alternate)
    for unsafe_id in (".", ".."):
        unsafe = deepcopy(examples)
        opportunity = unsafe["opportunities.manual.json"]["instance"]["data"]["items"][0]
        original_id = opportunity["id"]
        opportunity["id"] = unsafe_id
        with pytest.raises(validation_error, match="opportunities.manual.json"):
            validate(contract, unsafe)
        opportunity["id"] = original_id
        unsafe["amendment-impact.manual.json"]["instance"]["data"]["opportunity_id"] = unsafe_id
        with pytest.raises(validation_error, match="amendment-impact.manual.json"):
            validate(contract, unsafe)
    for safe_id in ("a/b", "a?b", "a#b", "a%b", "a b"):
        safe = deepcopy(examples)
        safe["opportunities.manual.json"]["instance"]["data"]["items"][0]["id"] = safe_id
        safe["amendment-impact.manual.json"]["instance"]["data"]["opportunity_id"] = safe_id
        validate(contract, safe)
