"""Generated JSON Schema hooks for the frozen public rule graph."""


def rule_leaf_json_schema(schema: dict[str, object]) -> None:
    """Expose frozen applicability and kind/predicate conditionals for public use."""
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return
    applicability = properties.get("applicability")
    if isinstance(applicability, dict) and isinstance(applicability.get("anyOf"), list):
        applicability["oneOf"] = applicability.pop("anyOf")
    predicate = properties.get("predicate")
    if not isinstance(predicate, dict) or not isinstance(predicate.get("oneOf"), list):
        return
    branches = [branch for branch in predicate["oneOf"] if isinstance(branch, dict)]
    kinds = (
        "TURNOVER_AVERAGE",
        "CERTIFICATION",
        "PROJECT_EXPERIENCE",
        "EMD",
        "DEADLINE",
    )
    if len(branches) != len(kinds):
        return
    schema["allOf"] = [
        {
            "if": {
                "properties": {"kind": {"const": kind}},
                "required": ["kind"],
            },
            "then": {"properties": {"predicate": reference}},
        }
        for kind, reference in zip(kinds, branches, strict=True)
    ]


def rule_group_json_schema(schema: dict[str, object]) -> None:
    """Expose only public recursive nodes and frozen operator/minimum branches."""
    properties = schema.get("properties")
    children = properties.get("children") if isinstance(properties, dict) else None
    items = children.get("items") if isinstance(children, dict) else None
    branches = items.pop("anyOf", None) if isinstance(items, dict) else None
    if isinstance(branches, list):
        items["oneOf"] = [
            branch
            for branch in branches
            if not (
                isinstance(branch, dict)
                and "UnsupportedRuleLeaf" in str(branch.get("$ref", ""))
            )
        ]
    schema["oneOf"] = [
        {
            "properties": {
                "operator": {"enum": ["ALL", "ANY"]},
                "minimum_matches": {"type": "null"},
            }
        },
        {
            "properties": {
                "operator": {"const": "AT_LEAST_N"},
                "minimum_matches": {"type": "integer", "minimum": 1},
            }
        },
    ]


def authority_json_schema(schema: dict[str, object]) -> None:
    """Expose the frozen effective-change authority conditional."""
    schema["allOf"] = [
        {
            "if": {
                "properties": {"effective_change": {"const": True}},
                "required": ["effective_change"],
            },
            "then": {
                "properties": {
                    "actor": {"const": "AUTHORITY"},
                    "disposition": {"const": "ACCEPTED"},
                    "replaces_document_id": {"type": "string", "minLength": 1},
                }
            },
        }
    ]


def amendment_impact_json_schema(schema: dict[str, object]) -> None:
    """Expose frozen applied-authority and unequal-recommendation conditionals."""
    properties = schema.get("properties")
    authority = properties.get("authority_statement") if isinstance(properties, dict) else None
    if not isinstance(authority, dict):
        return
    equal_pairs = [
        {
            "properties": {
                "base_recommendation": {"const": state},
                "amended_recommendation": {"const": state},
            },
            "required": ["base_recommendation", "amended_recommendation"],
        }
        for state in ("BID", "REVIEW", "NO_BID")
    ]
    schema["allOf"] = [
        {
            "if": {
                "properties": {"authority_change_applied": {"const": True}},
                "required": ["authority_change_applied"],
            },
            "then": {
                "properties": {
                    "authority_statement": {
                        "allOf": [
                            authority,
                            {"properties": {"effective_change": {"const": True}}},
                        ]
                    }
                }
            },
        },
        {
            "if": {"not": {"anyOf": equal_pairs}},
            "then": {
                "properties": {"authority_change_applied": {"const": True}}
            },
        },
    ]


def verified_source_proof_json_schema(schema: dict[str, object]) -> None:
    """Expose the frozen recorded nested opportunity constraint for VERIFIED proof."""
    schema["description"] = (
        "A verified proof requires the nested recorded opportunity snapshot_sha256 "
        "to equal raw_snapshot_sha256; runtime validators enforce hash equality."
    )
    properties = schema.get("properties")
    normalized = (
        properties.get("normalized_record") if isinstance(properties, dict) else None
    )
    if not isinstance(normalized, dict):
        return
    reference = dict(normalized)
    normalized.clear()
    normalized["allOf"] = [
        reference,
        {
            "properties": {
                "data_mode": {"const": "RECORDED_BRIGHT_DATA_SNAPSHOT"}
            },
            "required": ["data_mode"],
            "type": "object",
        },
    ]
