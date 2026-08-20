"""Regression tests for the repository code-file line policy."""

import json
from copy import deepcopy
from pathlib import Path
from runpy import run_path
from typing import Protocol, TypedDict

import pytest


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

    def __call__(
        self, contract: dict[str, object], examples: dict[str, ExampleTarget]
    ) -> None:
        """Validate the OpenAPI document and named response examples."""


def load_checker() -> Checker:
    """Load the repository checker while keeping tools outside the package tree."""
    checker_path = Path(__file__).resolve().parents[2] / "tools/check_code_file_lengths.py"
    assert checker_path.is_file(), "line-policy checker is missing"
    return run_path(str(checker_path))["check_paths"]


def load_contract_validator() -> tuple[Validator, type[ValueError]]:
    """Load the contract validator and its stable public failure type."""
    validator_path = Path(__file__).resolve().parents[2] / "tools/validate_contract.py"
    assert validator_path.is_file(), "contract validator is missing"
    namespace = run_path(str(validator_path))
    return namespace["validate_contract_document"], namespace["ContractValidationError"]


def load_contract_fixtures() -> tuple[dict[str, object], dict[str, ExampleTarget]]:
    """Load the frozen contract and examples as independent test inputs."""
    root = Path(__file__).resolve().parents[2]
    contract = json.loads((root / "contracts/api-v1.openapi.json").read_text())
    targets = {
        "assessment.manual.json": "AssessmentViewEnvelope",
        "amendment-impact.manual.json": "AmendmentImpactViewEnvelope",
        "opportunities.manual.json": "OpportunityListEnvelope",
        "source-proof.manual.json": "SourceProofViewEnvelope",
    }
    examples = {
        name: {
            "schema_name": schema_name,
            "instance": json.loads((root / "contracts/examples" / name).read_text()),
        }
        for name, schema_name in targets.items()
    }
    return contract, examples


def test_reports_files_at_or_above_200_lines(tmp_path: Path) -> None:
    """Report a supported code file when it reaches the forbidden 200th line."""
    check_paths = load_checker()
    oversized_file = tmp_path / "oversized.py"
    oversized_file.write_text("pass\n" * 200, encoding="utf-8")

    violations = check_paths([oversized_file])

    assert [(item.path, item.line_count) for item in violations] == [
        (oversized_file, 200)
    ]


def test_accepts_199_lines_and_counts_a_final_unterminated_line(tmp_path: Path) -> None:
    """Accept the maximum and count a final physical line without a newline."""
    check_paths = load_checker()
    allowed_file = tmp_path / "allowed.ts"
    allowed_file.write_text("line\n" * 198 + "line", encoding="utf-8")

    assert check_paths([allowed_file]) == []


def test_scans_in_order_while_excluding_dependencies_and_private_data(
    tmp_path: Path,
) -> None:
    """Sort findings and exclude dependencies, generated output, and private input."""
    check_paths = load_checker()
    first_file = tmp_path / "a.tsx"
    second_file = tmp_path / "z.mjs"
    dependency_file = tmp_path / "node_modules" / "ignored.js"
    private_file = tmp_path / "backend/data/private-demo" / "ignored.py"
    authored_generated_file = tmp_path / "frontend/components/generated/authored.ts"
    for file_path in (
        first_file,
        second_file,
        dependency_file,
        private_file,
        authored_generated_file,
    ):
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("line\n" * 200, encoding="utf-8")

    violations = check_paths([tmp_path])

    assert [item.path for item in violations] == [
        first_file,
        authored_generated_file,
        second_file,
    ]


def test_rejects_invalid_limits_and_missing_paths(tmp_path: Path) -> None:
    """Reject invalid caller input instead of silently weakening or skipping checks."""
    check_paths = load_checker()

    with pytest.raises(ValueError, match="non-negative"):
        check_paths([tmp_path], limit=-1)
    with pytest.raises(FileNotFoundError):
        check_paths([tmp_path / "missing"])


def test_validates_frozen_examples_and_a_separate_unknown_input() -> None:
    """Accept the honest transition and a distinct schema-valid UNKNOWN scenario."""
    validate, _ = load_contract_validator()
    contract, examples = load_contract_fixtures()
    unknown_examples = deepcopy(examples)
    unknown_examples["unknown.contract-test.json"] = deepcopy(
        examples["assessment.manual.json"]
    )
    assessment = unknown_examples["unknown.contract-test.json"]["instance"]
    assessment["data"]["amended_assessment"]["recommendation"] = "REVIEW"
    assessment["data"]["amended_assessment"]["rule_results"][0]["evaluation"] = (
        "UNKNOWN"
    )
    assessment["data"]["amended_assessment"]["rule_results"][0]["children"][0][
        "evaluation"
    ] = "UNKNOWN"
    assessment["data"]["amended_assessment"]["unknown_applicable_rule_count"] = 1
    assessment["data"]["company_profile"]["projects"] = [
        {
            "id": "project-001",
            "title": "Completed platform migration",
            "client": "Example Client",
            "value_inr": "5000000.00",
            "completion_state": "COMPLETED",
            "completed_at": "2026-01-01",
            "similar_work_confirmed": True,
            "evidence_reference": "completion-certificate-001",
        }
    ]

    validate(contract, examples)
    validate(contract, unknown_examples)


def test_rejects_unresolved_refs_extra_fields_and_invalid_group_counts() -> None:
    """Reject unresolved schemas, closed-schema drift, and impossible group minimums."""
    validate, validation_error = load_contract_validator()
    contract, examples = load_contract_fixtures()

    broken_ref = deepcopy(contract)
    broken_ref["components"]["schemas"]["OpportunityListEnvelope"]["properties"][
        "data"
    ]["$ref"] = "#/components/schemas/Missing"
    with pytest.raises(validation_error, match="unresolved"):
        validate(broken_ref, examples)

    extra_field = deepcopy(examples)
    extra_field["source-proof.manual.json"]["instance"]["data"]["provider_claim"] = (
        "fabricated"
    )
    with pytest.raises(validation_error, match="source-proof.manual.json"):
        validate(contract, extra_field)

    invalid_group = deepcopy(examples)
    group = invalid_group["assessment.manual.json"]["instance"]["data"][
        "amended_assessment"
    ]["requirements"]
    group["operator"] = "AT_LEAST_N"
    group["minimum_matches"] = 3
    with pytest.raises(validation_error, match="minimum_matches"):
        validate(contract, invalid_group)

    mismatched_predicate = deepcopy(examples)
    leaf = mismatched_predicate["assessment.manual.json"]["instance"]["data"][
        "base_assessment"
    ]["requirements"]["children"][0]
    leaf["kind"] = "CERTIFICATION"
    with pytest.raises(validation_error, match="assessment.manual.json"):
        validate(contract, mismatched_predicate)
