"""Normalize and compare reachable OpenAPI operation response schema graphs."""

import json
from collections.abc import Mapping


class SchemaComparisonError(RuntimeError):
    """Report substantive operation or reachable-component schema drift."""


def _resolve(reference: str, document: Mapping[str, object]) -> Mapping[str, object]:
    """Resolve one local schema reference or fail closed."""
    value: object = document
    for part in reference.removeprefix("#/").split("/"):
        value = value.get(part) if isinstance(value, dict) else None
    if not isinstance(value, dict):
        raise SchemaComparisonError("operation response schema ref is unresolved")
    return value


def _normalize(
    value: object,
    document: Mapping[str, object],
    seen: frozenset[str] = frozenset(),
    parent: str = "",
) -> object:
    """Inline reachable refs while preserving every executable schema keyword."""
    if isinstance(value, list):
        items = [_normalize(item, document, seen, parent) for item in value]
        if parent in {"required", "enum", "type", "oneOf", "anyOf"}:
            return sorted(items, key=lambda item: json.dumps(item, sort_keys=True))
        return items
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if not isinstance(value, dict):
        return value
    reference = value.get("$ref")
    if isinstance(reference, str):
        if reference in seen:
            return {"$recursive": True}
        return _normalize(_resolve(reference, document), document, seen | {reference})
    skipped = {"default", "description", "discriminator", "example", "examples", "title"}
    normalized = {
        key: _normalize(child, document, seen, key)
        for key, child in sorted(value.items())
        if key not in skipped
    }
    for key in ("allOf", "anyOf", "oneOf"):
        branches = normalized.get(key)
        if isinstance(branches, list):
            normalized[key] = [branch for branch in branches if branch != {}]
            if not normalized[key]:
                del normalized[key]
    enum = normalized.get("enum")
    if isinstance(enum, list) and len(enum) == 1:
        normalized["const"] = enum[0]
        del normalized["enum"]
    if "const" in normalized:
        normalized.pop("type", None)
    if normalized.get("pattern") == "^[a-f0-9]{64}$":
        normalized["pattern"] = "^[0-9a-f]{64}$"
    branches = normalized.get("anyOf")
    if (
        set(normalized) == {"anyOf"}
        and isinstance(branches, list)
        and {"type": "null"} in branches
        and len(branches) == 2
    ):
        other = next(branch for branch in branches if branch != {"type": "null"})
        if isinstance(other, dict) and isinstance(other.get("type"), str):
            normalized = dict(other)
            normalized["type"] = sorted((str(other["type"]), "null"))
    return normalized


def _operation_schemas(
    document: Mapping[str, object],
) -> dict[tuple[str, str, str], object]:
    """Return normalized 200-response graphs for every declared operation."""
    paths = document.get("paths")
    if not isinstance(paths, dict):
        raise SchemaComparisonError("operation response schemas are missing")
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
            if not isinstance(schema, dict):
                raise SchemaComparisonError("operation response schema is missing")
            schemas[(str(path), method.upper(), operation["operationId"])] = _normalize(
                schema, document
            )
    return schemas


def verify_schema_graph(
    generated: Mapping[str, object], frozen: Mapping[str, object]
) -> None:
    """Compare operation responses and reachable components bidirectionally."""
    if _operation_schemas(generated) != _operation_schemas(frozen):
        raise SchemaComparisonError("operation response schema graph drift")
