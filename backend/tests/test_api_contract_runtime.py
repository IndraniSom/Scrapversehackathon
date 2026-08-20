"""Frozen OpenAPI and runtime response schema parity tests."""

import json
from pathlib import Path

import pytest
from api_helpers import client_for, copied_demo
from jsonschema import Draft202012Validator, FormatChecker

from backend.config import Settings
from backend.main import create_app

CONTRACT = Path(__file__).parents[2] / "contracts" / "api-v1.openapi.json"


def test_application_openapi_is_exact_frozen_contract(tmp_path: Path) -> None:
    """The application exposes the reviewed OpenAPI document without schema drift."""
    app = create_app(Settings(demo_data_dir=copied_demo(tmp_path)))
    assert app.openapi() == json.loads(CONTRACT.read_text())


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
