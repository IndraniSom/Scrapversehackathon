"""Frozen OpenAPI and runtime response schema parity tests."""

import json
from pathlib import Path

import pytest
from api_helpers import client_for, copied_demo
from fastapi.routing import APIRoute
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import BaseModel, ValidationError

from backend.artifacts import load_demo_bundle
from backend.config import Settings
from backend.contracts.api import ApiEnvelope, HealthResponse, success
from backend.contracts.source import SourceProof
from backend.contracts.views import (
    AmendmentImpactView,
    AssessmentView,
    OpportunityList,
)
from backend.main import create_app

CONTRACT = Path(__file__).parents[2] / "contracts" / "api-v1.openapi.json"


def concrete_routes(app: object) -> list[APIRoute]:
    """Return actual concrete FastAPI routes beneath included-router wrappers."""
    found: list[APIRoute] = []
    for route in getattr(app, "routes", []):
        original = getattr(route, "original_router", route)
        for child in getattr(original, "routes", []):
            if isinstance(child, APIRoute):
                found.append(child)
    return found


def test_application_openapi_is_exact_frozen_contract(tmp_path: Path) -> None:
    """The application exposes the reviewed OpenAPI document without schema drift."""
    app = create_app(Settings(demo_data_dir=copied_demo(tmp_path)))
    assert app.openapi() == json.loads(CONTRACT.read_text())


def test_concrete_routes_match_frozen_operation_response_models(tmp_path: Path) -> None:
    """Six actual GET routes retain distinct operation IDs and response models."""
    app = create_app(Settings(demo_data_dir=copied_demo(tmp_path)))
    actual = {
        (route.path, frozenset(route.methods), route.operation_id): route.response_model
        for route in concrete_routes(app)
    }
    assert actual == {
        ("/health/live", frozenset({"GET"}), "getLiveness"): HealthResponse,
        ("/health/ready", frozenset({"GET"}), "getReadiness"): HealthResponse,
        ("/api/v1/opportunities", frozenset({"GET"}), "listOpportunities"): ApiEnvelope[OpportunityList],
        ("/api/v1/opportunities/{opportunity_id:path}", frozenset({"GET"}), "getAssessment"): ApiEnvelope[AssessmentView],
        ("/api/v1/opportunities/{opportunity_id:path}/amendment-impact", frozenset({"GET"}), "getAmendmentImpact"): ApiEnvelope[AmendmentImpactView],
        ("/api/v1/source-proof", frozenset({"GET"}), "getSourceProof"): ApiEnvelope[SourceProof],
    }


def test_operation_specific_models_reject_wrong_success_branch(tmp_path: Path) -> None:
    """Assessment and amendment routes cannot validate each other's response data."""
    root = copied_demo(tmp_path)
    app = create_app(Settings(demo_data_dir=root))
    bundle = load_demo_bundle(root)
    by_operation = {route.operation_id: route for route in concrete_routes(app)}
    detail_model = by_operation["getAssessment"].response_model
    impact_model = by_operation["getAmendmentImpact"].response_model
    assert isinstance(detail_model, type) and issubclass(detail_model, BaseModel)
    assert isinstance(impact_model, type) and issubclass(impact_model, BaseModel)
    with pytest.raises(ValidationError):
        detail_model.model_validate(success(bundle.impact).model_dump())
    with pytest.raises(ValidationError):
        impact_model.model_validate(success(bundle.assessment).model_dump())


def test_application_rejects_non_frozen_contract_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Application construction fails if its declared frozen contract is altered."""
    import backend.main as main_module

    changed = tmp_path / "api-v1.openapi.json"
    changed.write_text("{}\n")
    monkeypatch.setattr(main_module, "CONTRACT_PATH", changed)
    with pytest.raises(RuntimeError, match="contract"):
        main_module.create_app(Settings(demo_data_dir=copied_demo(tmp_path)))


def test_runtime_success_and_error_instances_validate_frozen_schemas(
    tmp_path: Path,
) -> None:
    """Every API payload validates against its exact frozen response branch."""
    contract = json.loads(CONTRACT.read_text())
    validator = Draft202012Validator(contract, format_checker=FormatChecker())
    cases = (
        ("/api/v1/opportunities", "OpportunityListEnvelope"),
        (
            "/api/v1/opportunities/ocac-pond-monitoring-26001",
            "AssessmentViewEnvelope",
        ),
        (
            "/api/v1/opportunities/ocac-pond-monitoring-26001/amendment-impact",
            "AmendmentImpactViewEnvelope",
        ),
        ("/api/v1/source-proof", "SourceProofViewEnvelope"),
        ("/api/v1/opportunities/missing", "ErrorEnvelope"),
    )
    with client_for(copied_demo(tmp_path)) as client:
        for path, schema_name in cases:
            response = client.get(path)
            schema = contract["components"]["schemas"][schema_name]
            errors = list(validator.evolve(schema=schema).iter_errors(response.json()))
            assert errors == []
