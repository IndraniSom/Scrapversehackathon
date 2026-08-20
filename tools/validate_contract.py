"""Validate the frozen OpenAPI document and its cross-stack response examples."""

import json
from collections.abc import Mapping
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError, ValidationError
from openapi_spec_validator import validate
from openapi_spec_validator.exceptions import OpenAPISpecValidatorError
from referencing import Registry, Resource
from referencing.exceptions import Unresolvable
from referencing.jsonschema import DRAFT202012

CONTRACT_URI = "urn:bidradar:api-v1"
EXAMPLE_SCHEMAS = {
    "opportunities.manual.json": "OpportunityListEnvelope",
    "assessment.manual.json": "AssessmentViewEnvelope",
    "amendment-impact.manual.json": "AmendmentImpactViewEnvelope",
    "source-proof.manual.json": "SourceProofViewEnvelope",
}
PROVIDER_FIELDS = frozenset(
    {
        "collector_config_version",
        "collector_name",
        "provider_run_id",
        "raw_record",
        "raw_snapshot_sha256",
        "terminal_state",
    }
)


class ContractValidationError(ValueError):
    """Report invalid OpenAPI structure, response examples, or honesty invariants."""


def _load_json_object(path: Path) -> dict[str, object]:
    """Load a UTF-8 JSON object or fail with a path-specific validation error."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractValidationError(f"{path}: expected a JSON object")
    return value


def _iter_key_values(value: object) -> list[tuple[str, object]]:
    """Flatten object keys recursively for fixture-mode and provider-claim checks."""
    found: list[tuple[str, object]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            found.append((str(key), child))
            found.extend(_iter_key_values(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_iter_key_values(child))
    return found


def _validate_group_invariants(value: object, location: str) -> None:
    """Enforce recursive RuleGroup constraints not expressible in JSON Schema."""
    if isinstance(value, dict):
        if value.get("node_type") == "GROUP":
            children = value.get("children")
            minimum = value.get("minimum_matches")
            operator = value.get("operator")
            if not isinstance(children, list) or not children:
                raise ContractValidationError(f"{location}: group children must be non-empty")
            if operator in {"ALL", "ANY"} and minimum is not None:
                raise ContractValidationError(
                    f"{location}: {operator} minimum_matches must be null"
                )
            if operator == "AT_LEAST_N" and (
                not isinstance(minimum, int)
                or isinstance(minimum, bool)
                or minimum < 1
                or minimum > len(children)
            ):
                raise ContractValidationError(
                    f"{location}: AT_LEAST_N minimum_matches must be within children"
                )
        for key, child in value.items():
            _validate_group_invariants(child, f"{location}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _validate_group_invariants(child, f"{location}[{index}]")


def _validate_manual_honesty(name: str, instance: object) -> None:
    """Require manual fixture modes and forbid embedded provider proof claims."""
    key_values = _iter_key_values(instance)
    modes = {value for key, value in key_values if key == "data_mode"}
    if not modes or modes != {"MANUAL_FIXTURE"}:
        raise ContractValidationError(f"{name}: every data_mode must be MANUAL_FIXTURE")
    claimed_fields = [
        key for key, value in key_values if key in PROVIDER_FIELDS and value is not None
    ]
    if claimed_fields:
        joined = ", ".join(sorted(set(claimed_fields)))
        raise ContractValidationError(f"{name}: manual fixture claims provider fields: {joined}")


def _validate_named_stories(name: str, instance: object) -> None:
    """Protect the deterministic transition and unavailable source-proof branches."""
    if not isinstance(instance, dict) or not isinstance(instance.get("data"), dict):
        raise ContractValidationError(f"{name}: missing response data object")
    data = instance["data"]
    if name == "opportunities.manual.json":
        items = data.get("items")
        if not isinstance(items, list) or data.get("total") != len(items):
            raise ContractValidationError(f"{name}: total must equal items length")
    if name == "assessment.manual.json":
        base = data.get("base_assessment")
        amended = data.get("amended_assessment")
        if not isinstance(base, dict) or not isinstance(amended, dict):
            raise ContractValidationError(f"{name}: assessments must be objects")
        story = (base.get("recommendation"), base.get("failed_hard_rule_count"), base.get("unknown_applicable_rule_count"), amended.get("recommendation"), amended.get("failed_hard_rule_count"), amended.get("unknown_applicable_rule_count"))
        if story != ("NO_BID", 1, 3, "REVIEW", 0, 3):
            raise ContractValidationError(f"{name}: expected NO_BID to REVIEW with three UNKNOWN certifications")
        values = _iter_key_values(data)
        if sum(key == "valid_at" and value is None for key, value in values) != 6 or sum(key == "evaluation" and value == "UNKNOWN" for key, value in values) != 7:
            raise ContractValidationError(f"{name}: certification anchors/results must be UNKNOWN")
    if name == "amendment-impact.manual.json":
        statement = data.get("authority_statement")
        if (
            not isinstance(statement, dict)
            or statement.get("actor") != "AUTHORITY"
            or statement.get("disposition") != "ACCEPTED"
            or statement.get("effective_change") is not True
            or not statement.get("replaces_document_id")
            or data.get("authority_change_applied") is not True
            or data.get("base_recommendation") != "NO_BID"
            or data.get("amended_recommendation") != "REVIEW"
        ):
            raise ContractValidationError(f"{name}: invalid authority-backed transition")
    if name == "source-proof.manual.json":
        if data.get("status") != "UNAVAILABLE":
            raise ContractValidationError(f"{name}: source proof must be UNAVAILABLE")
        if data.get("provider_run_id") is not None:
            raise ContractValidationError(f"{name}: provider_run_id must be null")
    if data.get("status") == "VERIFIED":
        normalized = data.get("normalized_record")
        if not isinstance(normalized, dict) or normalized.get("data_mode") != "RECORDED_BRIGHT_DATA_SNAPSHOT" or normalized.get("snapshot_sha256") != data.get("raw_snapshot_sha256"):
            raise ContractValidationError(f"{name}: verified normalized record must match recorded proof hash")


def validate_contract_document(
    contract: dict[str, object], examples: Mapping[str, Mapping[str, object]]
) -> None:
    """Validate OpenAPI, resolve all used refs, and enforce cross-example truthfulness."""
    try:
        validate(contract)
        resource = Resource.from_contents(
            contract, default_specification=DRAFT202012
        )
        registry = Registry().with_resource(CONTRACT_URI, resource)
        for name, target in examples.items():
            schema_name = target.get("schema_name")
            instance = target.get("instance")
            if not isinstance(schema_name, str):
                raise ContractValidationError(f"{name}: schema_name must be a string")
            schema = {"$ref": f"{CONTRACT_URI}#/components/schemas/{schema_name}"}
            validator = Draft202012Validator(
                schema, registry=registry, format_checker=FormatChecker()
            )
            errors = sorted(validator.iter_errors(instance), key=lambda item: str(item.path))
            if errors:
                raise ContractValidationError(f"{name}: {errors[0].message}")
            _validate_group_invariants(instance, name)
            if name.endswith(".manual.json"):
                _validate_manual_honesty(name, instance)
            _validate_named_stories(name, instance)
    except ContractValidationError:
        raise
    except (OpenAPISpecValidatorError, SchemaError, ValidationError) as error:
        raise ContractValidationError(f"OpenAPI document is invalid: {error}") from error
    except Unresolvable as error:
        raise ContractValidationError(f"OpenAPI document has an unresolved ref: {error}") from error


def main() -> int:
    """Load the repository contract and four named examples, then validate them."""
    repository_root = Path(__file__).resolve().parents[1]
    contract = _load_json_object(repository_root / "contracts/api-v1.openapi.json")
    examples = {
        name: {
            "schema_name": schema_name,
            "instance": _load_json_object(repository_root / "contracts/examples" / name),
        }
        for name, schema_name in EXAMPLE_SCHEMAS.items()
    }
    validate_contract_document(contract, examples)
    print(f"validated OpenAPI and {len(examples)} contract examples")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
