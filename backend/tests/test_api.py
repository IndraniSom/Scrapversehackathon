"""Read-only FastAPI route, envelope, and safe error tests."""

from pathlib import Path
from uuid import UUID

from api_helpers import client_for, copied_demo


def get_paths(routes: list[object]) -> set[str]:
    """Flatten FastAPI's included-router wrappers into concrete GET route paths."""
    paths: set[str] = set()
    for route in routes:
        original = getattr(route, "original_router", route)
        nested = getattr(original, "routes", None)
        if isinstance(nested, list):
            paths.update(get_paths(nested))
        methods = getattr(route, "methods", set())
        path = getattr(route, "path", None)
        if isinstance(methods, set) and "GET" in methods and isinstance(path, str):
            paths.add(path)
    return paths


def assert_request_id(payload: dict[str, object]) -> None:
    """Require one canonical UUID request identifier in an API envelope."""
    assert UUID(str(payload["request_id"])).version == 4


def test_health_routes_and_exact_route_surface(tmp_path: Path) -> None:
    """Only six GET routes exist and successful startup is live and ready."""
    with client_for(copied_demo(tmp_path)) as client:
        assert client.get("/health/live").json() == {"status": "ok"}
        assert client.get("/health/ready").json() == {"status": "ok"}
        paths = get_paths(client.app.routes)
        assert paths == {
            "/health/live",
            "/health/ready",
            "/api/v1/opportunities",
            "/api/v1/opportunities/{opportunity_id}",
            "/api/v1/opportunities/{opportunity_id}/amendment-impact",
            "/api/v1/source-proof",
        }


def test_opportunities_route_returns_seven_rows_and_four_sources(tmp_path: Path) -> None:
    """The list envelope retains the exact current contract inventory."""
    with client_for(copied_demo(tmp_path)) as client:
        response = client.get("/api/v1/opportunities")
        assert response.status_code == 200
        payload = response.json()
        assert_request_id(payload)
        assert payload["data"]["total"] == 7
        assert {item["source"] for item in payload["data"]["items"]} == {
            "CPPP",
            "WEST_BENGAL",
            "NTPC",
            "ODISHA",
        }
        second = client.get("/api/v1/opportunities").json()
        assert second["request_id"] != payload["request_id"]
        assert "access-control-allow-origin" not in response.headers


def test_assessment_route_returns_reviewed_evidence_and_transition(tmp_path: Path) -> None:
    """The assessed OCAC route exposes exact document and deterministic outcomes."""
    with client_for(copied_demo(tmp_path)) as client:
        response = client.get("/api/v1/opportunities/ocac-pond-monitoring-26001")
        assert response.status_code == 200
        payload = response.json()
        assert_request_id(payload)
        data = payload["data"]
        assert data["opportunity"]["source"] == "ODISHA"
        assert data["base_assessment"]["recommendation"] == "NO_BID"
        assert data["amended_assessment"]["recommendation"] == "BID"
        evidence = data["base_assessment"]["requirements"]["children"][0]["evidence"][0]
        assert evidence["document_version_id"] == "ocac-pond-monitoring-rfp-v1"
        assert evidence["physical_page_number"] == 19


def test_amendment_route_returns_hashes_authority_and_manual_mode(tmp_path: Path) -> None:
    """The impact envelope shows exact hashes and accepted authority replacement."""
    with client_for(copied_demo(tmp_path)) as client:
        response = client.get(
            "/api/v1/opportunities/ocac-pond-monitoring-26001/amendment-impact"
        )
        assert response.status_code == 200
        payload = response.json()
        assert_request_id(payload)
        data = payload["data"]
        assert data["data_mode"] == "MANUAL_FIXTURE"
        assert data["base_document"]["sha256"].startswith("f1bc4167")
        assert data["amendment_document"]["sha256"].startswith("ccbe30fa")
        assert data["authority_statement"]["actor"] == "AUTHORITY"
        assert (data["base_recommendation"], data["amended_recommendation"]) == (
            "NO_BID",
            "BID",
        )


def test_source_proof_route_returns_real_verified_lineage(tmp_path: Path) -> None:
    """The proof envelope returns the chosen run and content-addressed raw digest."""
    with client_for(copied_demo(tmp_path)) as client:
        response = client.get("/api/v1/source-proof")
        assert response.status_code == 200
        payload = response.json()
        assert_request_id(payload)
        proof = payload["data"]
        assert proof["provider_run_id"] == "j_mt0i928kyu57telkk"
        assert proof["raw_snapshot_sha256"] == (
            "b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef"
        )


def test_unknown_opportunity_returns_safe_uuid_error_envelopes(tmp_path: Path) -> None:
    """Both detail routes return frozen safe 404 envelopes without internal context."""
    with client_for(copied_demo(tmp_path)) as client:
        for suffix in ("", "/amendment-impact"):
            response = client.get(f"/api/v1/opportunities/missing{suffix}")
            assert response.status_code == 404
            payload = response.json()
            assert_request_id(payload)
            assert payload["error"] == {
                "code": "OPPORTUNITY_NOT_FOUND",
                "message": "Opportunity was not found.",
            }
            rendered = response.text.lower()
            assert "traceback" not in rendered
            assert str(tmp_path).lower() not in rendered


def test_invalid_opportunity_id_returns_safe_contract_error(tmp_path: Path) -> None:
    """Path validation errors use a UUID envelope without echoing validation internals."""
    with client_for(copied_demo(tmp_path)) as client:
        response = client.get(f"/api/v1/opportunities/{'x' * 161}")
        assert response.status_code == 422
        payload = response.json()
        assert_request_id(payload)
        assert payload["error"] == {
            "code": "CONTRACT_VALIDATION_FAILED",
            "message": "Request did not match the API contract.",
        }


def test_api_exposes_no_write_upload_or_url_fetch_route(tmp_path: Path) -> None:
    """Mutation verbs and arbitrary fetch/upload paths remain outside runtime scope."""
    with client_for(copied_demo(tmp_path)) as client:
        responses = (
            client.post("/api/v1/opportunities"),
            client.get("/api/v1/fetch?url=https://example.test"),
            client.post("/api/v1/upload", files={"file": ("x", b"x")}),
        )
        assert [response.status_code for response in responses] == [405, 404, 404]
        for response in responses:
            payload = response.json()
            assert_request_id(payload)
            assert payload["error"] == {
                "code": "CONTRACT_VALIDATION_FAILED",
                "message": "Request did not match the API contract.",
            }


def test_missing_in_memory_bundle_returns_safe_readiness_503(tmp_path: Path) -> None:
    """A lost readiness state returns the frozen UUID 503 without internal details."""
    with client_for(copied_demo(tmp_path)) as client:
        client.app.state.bundle = None
        response = client.get("/health/ready")
        assert response.status_code == 503
        payload = response.json()
        assert_request_id(payload)
        assert payload["error"] == {
            "code": "DEMO_DATA_UNAVAILABLE",
            "message": "Validated demo data is unavailable.",
        }
