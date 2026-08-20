"""Public generated-schema and runtime-boundary parity tests."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.artifacts import load_demo_bundle
from backend.contracts.api import ApiEnvelope, success
from backend.contracts.source import OpportunitySummary, SourceProof
from backend.contracts.views import AmendmentImpactView, AssessmentView
from backend.source_views import build_unavailable_source_proof


def test_public_opportunity_schema_retains_https_and_route_constraints() -> None:
    """Shared opportunity JSON Schema exposes frozen HTTPS and dot guards."""
    properties = OpportunitySummary.model_json_schema()["properties"]
    assert properties["canonical_url"] | {} == {
        "format": "uri",
        "pattern": "^https://",
        "title": "Canonical Url",
        "type": "string",
    }
    assert properties["id"]["not"] == {"enum": [".", ".."]}


def test_public_assessment_schema_excludes_internal_unsupported_branch() -> None:
    """Public recursive rules expose only frozen supported group/leaf variants."""
    schema = AssessmentView.model_json_schema()
    definitions = schema["$defs"]
    group = definitions["RuleGroup"]
    children = group["properties"]["children"]["items"]["oneOf"]
    assert len(children) == 2
    assert "UnsupportedRuleLeaf" not in str(children)
    assert len(group["oneOf"]) == 2
    leaf = definitions["RuleLeaf"]
    assert len(leaf["allOf"]) == 5
    assert "oneOf" in leaf["properties"]["applicability"]
    assert definitions["TurnoverAveragePredicate"]["properties"][
        "required_financial_years"
    ]["uniqueItems"] is True


def test_public_assessment_runtime_rejects_internal_unsupported_leaf() -> None:
    """Response validation rejects unsupported internal fixtures hidden from schema."""
    bundle = load_demo_bundle(Path(__file__).parents[1] / "data" / "demo")
    payload = success(bundle.assessment).model_dump(mode="json")
    group = payload["data"]["base_assessment"]["requirements"]
    known = group["children"][0]
    unsupported = {
        key: value
        for key, value in known.items()
        if key not in {"predicate", "title"}
    }
    unsupported.update(
        id="unsupported-public",
        kind="UNSUPPORTED",
        title="Unsupported public rule",
        reason="Internal-only semantics",
    )
    group["children"].append(unsupported)
    with pytest.raises(ValidationError):
        ApiEnvelope[AssessmentView].model_validate(payload)


def test_public_impact_schema_exposes_authority_transition_conditionals() -> None:
    """Generated impact and authority schemas retain frozen conditional gates."""
    schema = AmendmentImpactView.model_json_schema()
    assert len(schema["allOf"]) == 2
    assert len(schema["$defs"]["AuthorityStatement"]["allOf"]) == 1


def test_source_proof_response_model_accepts_both_frozen_branches() -> None:
    """Public proof response schema and runtime accept VERIFIED or UNAVAILABLE."""
    schema = ApiEnvelope[SourceProof].model_json_schema()
    assert len(schema["properties"]["data"]["oneOf"]) == 2
    unavailable = build_unavailable_source_proof("PROOF_NOT_CAPTURED")
    validated = ApiEnvelope[SourceProof].model_validate(
        success(unavailable).model_dump(mode="json")
    )
    assert validated.data.status == "UNAVAILABLE"
