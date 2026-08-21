"""Runtime deterministic assessment and signed API regression tests."""

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app
from backend.runtime_assessment import AssessmentRequest, evaluate_request


def _request() -> dict[str, object]:
    """Build one closed assessment request with supported and missing evidence."""
    return {
        "company_id": "company_a",
        "opportunity_id": "opportunity_a",
        "lifecycle": "open",
        "closes_at": 2_000_000_000_000,
        "as_of": 1_800_000_000_000,
        "company": {
            "turnover": [{"amountInr": 90_000_000, "audited": True}],
            "certifications": [{"name": "ISO 27001", "validFrom": None, "validUntil": None}],
            "projects": [],
            "exemptions": [],
        },
        "requirements": [
            {"id": "turnover", "hardness": "hard", "predicate": {"field": "turnover_average", "operator": "gte", "expected": "60000000"}, "evidence": ["Page 19"]},
            {"id": "certificate", "hardness": "hard", "predicate": {"field": "certification", "operator": "is_true", "expected": "ISO 27001"}, "evidence": ["Page 20"]},
        ],
    }


def test_unknown_evidence_keeps_recommendation_in_review() -> None:
    """Missing certificate dates stay UNKNOWN and cannot become BID."""
    result = evaluate_request(AssessmentRequest.model_validate(_request()))
    assert result.recommendation == "REVIEW"
    assert [rule.evaluation for rule in result.rules] == ["PASS", "UNKNOWN"]
    assert result.counts == {"pass": 1, "fail": 0, "unknown": 1}


def test_closed_lifecycle_forces_no_bid() -> None:
    """Closed opportunity is NO_BID even when supported rules pass."""
    payload = _request()
    payload["lifecycle"] = "closed"
    payload["requirements"] = [payload["requirements"][0]]  # type: ignore[index]
    assert evaluate_request(AssessmentRequest.model_validate(payload)).recommendation == "NO_BID"


def test_signed_endpoint_rejects_bad_signature_and_returns_result(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Assessment endpoint fails closed and accepts exact-body HMAC only."""
    secret = "assessment-worker-secret"
    monkeypatch.setenv("BIDRADAR_WORKER_HMAC_SECRET", secret)
    body = json.dumps(_request(), separators=(",", ":")).encode()
    with TestClient(create_app(Settings())) as client:
        assert client.post("/internal/v1/assessments", content=body, headers={"X-Worker-Signature": "sha256=bad"}).status_code == 401
        signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        response = client.post("/internal/v1/assessments", content=body, headers={"X-Worker-Signature": signature})
    assert response.status_code == 200
    assert response.json()["recommendation"] == "REVIEW"
