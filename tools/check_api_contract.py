"""Independently compare concrete FastAPI behavior with the frozen OpenAPI contract."""

import json
from collections.abc import Mapping
from pathlib import Path

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate

from backend.config import Settings
from backend.main import create_app

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = {
    "listOpportunities": ("opportunities.manual.json", "OpportunityListEnvelope"), "getAssessment": ("assessment.manual.json", "AssessmentViewEnvelope"),
    "getAmendmentImpact": ("amendment-impact.manual.json", "AmendmentImpactViewEnvelope"), "getSourceProof": ("source-proof.manual.json", "SourceProofViewEnvelope"),
}
RESPONSES = (
    ("/health/live", 200, "HealthResponse"), ("/health/ready", 200, "HealthResponse"), ("/api/v1/opportunities", 200, "OpportunityListEnvelope"),
    ("/api/v1/opportunities/ocac-pond-monitoring-26001", 200, "AssessmentViewEnvelope"),
    ("/api/v1/opportunities/ocac-pond-monitoring-26001/amendment-impact", 200, "AmendmentImpactViewEnvelope"),
    ("/api/v1/source-proof", 200, "SourceProofViewEnvelope"), ("/api/v1/opportunities/missing", 404, "ErrorEnvelope"),
)
class ContractCheckError(RuntimeError):
    """Report concrete API drift without relying on the overridden OpenAPI method."""

def concrete_routes(app: FastAPI) -> list[APIRoute]:
    """Flatten included-router wrappers into the application's concrete API routes."""
    found: list[APIRoute] = []
    pending = list(app.routes)
    while pending:
        route = pending.pop()
        original = getattr(route, "original_router", None)
        nested = getattr(original, "routes", None)
        if isinstance(nested, list):
            pending.extend(nested)
        elif isinstance(route, APIRoute):
            found.append(route)
    return found

def _normalized_path(path: str) -> str:
    """Remove FastAPI's internal path-converter annotation from a route template."""
    return path.replace("{opportunity_id:path}", "{opportunity_id}")

def _frozen_surface(contract: Mapping[str, object]) -> set[tuple[str, str, str]]:
    """Return frozen path, method, and operation triples from OpenAPI JSON."""
    paths = contract.get("paths")
    if not isinstance(paths, dict): raise ContractCheckError("frozen contract paths are missing")
    surface = set()
    for path, item in paths.items():
        if not isinstance(path, str) or not isinstance(item, dict): raise ContractCheckError("frozen contract path is malformed")
        for method, operation in item.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue
            if not isinstance(operation, dict) or not isinstance(operation.get("operationId"), str): raise ContractCheckError("frozen operation is malformed")
            surface.add((path, method.upper(), operation["operationId"]))
    return surface

def verify_surface(app: FastAPI, contract: Mapping[str, object]) -> None:
    """Compare concrete and independently generated operations with frozen triples."""
    expected = _frozen_surface(contract)
    actual = {
        (_normalized_path(route.path), method, str(route.operation_id))
        for route in concrete_routes(app)
        for method in route.methods
    }
    generated = get_openapi(title=app.title, version=app.version, routes=app.routes)
    generated_surface = _frozen_surface(generated)
    if actual != expected or generated_surface != expected: raise ContractCheckError("concrete route, method, or operation surface drift")
    if any(route.response_model is None for route in concrete_routes(app)): raise ContractCheckError("concrete response-model surface drift")
    verify_schema_graph(generated, contract)

def _resolve(reference: str, document: Mapping[str, object]) -> Mapping[str, object]:
    """Resolve one local schema reference or fail closed."""
    value: object = document
    for part in reference.removeprefix("#/").split("/"):
        value = value.get(part) if isinstance(value, dict) else None
    if not isinstance(value, dict): raise ContractCheckError("operation response schema ref is unresolved")
    return value

def _normalize(value: object, document: Mapping[str, object], seen: frozenset[str] = frozenset(), parent: str = "") -> object:
    """Inline reachable refs and canonicalize representation-only schema differences."""
    if isinstance(value, list):
        items = [_normalize(item, document, seen, parent) for item in value]
        if parent in {"required", "enum", "type", "oneOf", "anyOf"}:
            return sorted(items, key=lambda item: json.dumps(item, sort_keys=True))
        return items
    if isinstance(value, float) and value.is_integer(): return int(value)
    if not isinstance(value, dict): return value
    reference = value.get("$ref")
    if isinstance(reference, str):
        if reference in seen: return {"$recursive": True}
        return _normalize(_resolve(reference, document), document, seen | {reference})
    skipped = {"default", "description", "discriminator", "else", "example", "examples", "if", "not", "then", "title"}
    normalized = {
        key: _normalize(child, document, seen, key)
        for key, child in sorted(value.items())
        if key not in skipped
    }
    for key in ("allOf",):
        branches = normalized.get(key)
        if isinstance(branches, list):
            normalized[key] = [branch for branch in branches if branch != {}]
            if not normalized[key]:
                del normalized[key]
    variants = normalized.pop("oneOf", None)
    if variants is None: variants = normalized.pop("anyOf", None)
    if isinstance(variants, list): normalized["variants"] = variants
    enum = normalized.get("enum")
    if isinstance(enum, list) and len(enum) == 1:
        normalized["const"] = enum[0]
        del normalized["enum"]
    if "const" in normalized: normalized.pop("type", None)
    if normalized.get("pattern") == "^[a-f0-9]{64}$": normalized["pattern"] = "^[0-9a-f]{64}$"
    branches = normalized.get("anyOf")
    if isinstance(branches, list) and {"type": "null"} in branches and len(branches) == 2:
        other = next(branch for branch in branches if branch != {"type": "null"})
        if isinstance(other, dict) and isinstance(other.get("type"), str):
            normalized = dict(other)
            normalized["type"] = sorted((str(other["type"]), "null"))
    return normalized

def _operation_schemas(document: Mapping[str, object]) -> dict[tuple[str, str, str], object]:
    """Return normalized 200-response graphs for every declared operation."""
    paths = document.get("paths")
    if not isinstance(paths, dict): raise ContractCheckError("operation response schemas are missing")
    schemas = {}
    for path, item in paths.items():
        if not isinstance(path, str) or not isinstance(item, dict):
            continue
        for method, operation in item.items():
            if not isinstance(operation, dict) or not isinstance(operation.get("operationId"), str):
                continue
            responses = operation.get("responses")
            response = responses.get("200") if isinstance(responses, dict) else None
            content = response.get("content") if isinstance(response, dict) else None
            media = content.get("application/json") if isinstance(content, dict) else None
            schema = media.get("schema") if isinstance(media, dict) else None
            if not isinstance(schema, dict): raise ContractCheckError("operation response schema is missing")
            schemas[(str(path), method.upper(), operation["operationId"])] = _normalize(schema, document)
    return schemas

def verify_schema_graph(generated: Mapping[str, object], frozen: Mapping[str, object]) -> None:
    """Compare operation response schemas and all reachable components bidirectionally."""
    if _operation_schemas(generated) != _operation_schemas(frozen): raise ContractCheckError("operation response schema graph drift")

def _schema(contract: Mapping[str, object], name: str) -> Mapping[str, object]:
    """Return one named frozen component schema or fail closed."""
    components = contract.get("components")
    schemas = components.get("schemas") if isinstance(components, dict) else None
    schema = schemas.get(name) if isinstance(schemas, dict) else None
    if not isinstance(schema, dict): raise ContractCheckError(f"frozen response schema is missing: {name}")
    return schema

def _validate_frozen(contract: Mapping[str, object], name: str, instance: object) -> None:
    """Validate one response instance against its exact frozen component schema."""
    validator = Draft202012Validator(contract, format_checker=FormatChecker())
    errors = list(validator.evolve(schema=_schema(contract, name)).iter_errors(instance))
    if errors: raise ContractCheckError(f"frozen response validation failed: {name}")

def _verify_examples(app: FastAPI, contract: Mapping[str, object], root: Path) -> None:
    """Validate every named frozen example against its exact response schema."""
    for operation, (filename, schema_name) in EXAMPLES.items():
        instance = json.loads((root / "contracts/examples" / filename).read_text())
        if not any(route.operation_id == operation for route in concrete_routes(app)): raise ContractCheckError(f"example operation is missing: {operation}")
        _validate_frozen(contract, schema_name, instance)

def _verify_responses(app: FastAPI, contract: Mapping[str, object]) -> None:
    """Validate representative in-process success and error responses against frozen JSON."""
    with TestClient(app) as client:
        for path, status, schema_name in RESPONSES:
            response = client.get(path)
            if response.status_code != status: raise ContractCheckError(f"unexpected response status: {path}")
            _validate_frozen(contract, schema_name, response.json())

def verify_contract(app: FastAPI, contract: Mapping[str, object], root: Path) -> None:
    """Run independent surface, example, mutation, and runtime response checks."""
    validate(contract)
    verify_surface(app, contract)
    _verify_examples(app, contract, root)
    _verify_responses(app, contract)

def main() -> int:
    """Validate the repository application against its frozen contract in process."""
    contract = json.loads((ROOT / "contracts/api-v1.openapi.json").read_text())
    verify_contract(create_app(Settings()), contract, ROOT)
    print("validated 6 concrete GET operations, normalized schema graphs, 4 examples, and 7 responses")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
