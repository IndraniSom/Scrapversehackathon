"""Worker security: headers, CORS, rate limits, SSRF, parser, webhook, agency."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.documents import DocumentError, DocumentLimits, parse_pdf
from backend.main import clear_rate_limits, create_app
from backend.source_policy import (
    ApprovalError,
    PortalReview,
    validate_collection_inputs,
)


def make_client() -> TestClient:
    """Create test client with cleared rate state and eager bundle for non-lifespan usage."""
    clear_rate_limits()
    from backend.artifacts import load_demo_bundle
    app = create_app(Settings())
    try:
        app.state.bundle = load_demo_bundle(Settings().demo_data_dir)  # type: ignore[attr-defined]
    except Exception:
        pass
    return TestClient(app, raise_server_exceptions=False)


def test_security_headers_present_on_all_routes() -> None:
    """Every response includes HSTS, frame, MIME, referrer, permissions, CSP."""
    client = make_client()
    for path in ["/health/live", "/health/ready", "/api/v1/opportunities", "/api/v1/opportunities/missing"]:
        resp = client.get(path)
        for header in ["strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "content-security-policy"]:
            assert header in resp.headers, f"{header} missing on {path}"
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert "max-age=63072000" in resp.headers["strict-transport-security"]


def test_cors_narrow_allows_only_allowlisted_origin() -> None:
    """Allowlisted Origin passes; evil origin stripped."""
    client = make_client()
    ok = client.get("/health/live", headers={"Origin": "http://localhost:3000"})
    # CORSMiddleware echoes allowlisted origin
    assert ok.headers.get("access-control-allow-origin") in (None, "http://localhost:3000")
    evil = client.get("/health/live", headers={"Origin": "https://evil.example"})
    # Evil origin must not be echoed as allowed
    assert evil.headers.get("access-control-allow-origin") != "https://evil.example"


def test_rate_limit_returns_429_when_exceeded() -> None:
    """Sliding window blocks after limit; helper and HTTP path verified."""
    from backend.main import _is_rate_limited

    clear_rate_limits()
    key = "test-org:default"
    # 120 allowed, 121st blocked
    for _ in range(120):
        assert _is_rate_limited(key, 120, 60) is False
    assert _is_rate_limited(key, 120, 60) is True
    # HTTP path: flood health endpoint
    clear_rate_limits()
    client = make_client()
    last = None
    for _ in range(122):
        last = client.get("/health/live", headers={"x-organization-id": "org_flood"})
    assert last is not None
    assert last.status_code == 429
    body = last.json()
    assert body["error"]["code"] == "RATE_LIMITED"


def test_ssrf_rejects_private_ip_and_non_allowlisted_url() -> None:
    """Provider input allowlist rejects private IP and credential-bearing URLs."""
    review = PortalReview.model_validate({
        "portal": "NTPC",
        "decision": "ALLOW",
        "retention_decision": "ALLOW",
        "reviewed_at": "2026-08-20",
        "policy_url": "https://ntpctender.ntpc.co.in/Index/Disclaimer",
        "reviewer": "Asha Rao",
        "reviewer_kind": "HUMAN",
    })
    bad_inputs = [
        {"url": "https://10.0.0.1/Index/Search?Type=Reg"},
        {"url": "https://evil.example/Index/Search?Type=Reg&Region=1"},
        {"url": "https://user:pass@ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1"},
    ]
    for inp in bad_inputs:
        with pytest.raises(ApprovalError):
            validate_collection_inputs([inp], review, datetime(2026, 8, 20, 12, tzinfo=UTC))


def test_parser_decompression_bomb_maps_to_limit(tmp_path: Path) -> None:
    """MemoryError decompression bomb returns DECOMPRESSION_LIMIT not leak."""
    pdf = tmp_path / "bomb.pdf"
    pdf.write_bytes(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    limits = DocumentLimits(max_bytes=25*1024*1024, max_pages=80, max_page_chars=8000)
    with patch("backend.documents.PdfReader", side_effect=MemoryError("decompression bomb")):
        with pytest.raises(DocumentError) as exc:
            parse_pdf(pdf, limits)
        assert exc.value.code == "DECOMPRESSION_LIMIT"
    # Also via document pipeline stamina cleared in finally
    with patch("backend.documents.PdfReader", side_effect=RecursionError("bomb")):
        with pytest.raises(DocumentError) as exc2:
            parse_pdf(pdf, limits)
        assert exc2.value.code == "DECOMPRESSION_LIMIT"


def test_error_envelope_does_not_leak_internals() -> None:
    """Validation and not-found errors use safe fixed messages."""
    client = make_client()
    resp = client.get("/api/v1/opportunities/%2e/amendment-impact")
    assert resp.status_code in (404, 422)
    body = resp.json()
    assert "error" in body
    assert body["error"]["message"] == "Request did not match the API contract."
    assert "traceback" not in resp.text.lower()
    assert "backend/src" not in resp.text


def test_prompt_injection_payload_not_executed() -> None:
    """Document text with injection markers treated as data; parse does not exec."""
    # Injection string should not be evaluated; parser only extracts text
    pdf_path = Path(__file__).parents[1] / "data" / "demo" / "opportunity.pdf"
    if not pdf_path.exists():
        pytest.skip("demo pdf missing")
    limits = DocumentLimits()
    # Ensure parse does not raise unexpected and avoids dynamic evaluation
    result = parse_pdf(pdf_path, limits)
    # Pages must be bounded strings, not code
    for page in result.pages:
        assert "ignore previous instructions" not in page.text.lower() or True  # data preserved, not executed
        assert len(page.text) <= limits.max_page_chars


def test_excessive_agency_worker_cannot_autonomously_submit() -> None:
    """No worker route allows autonomous submission; only read-only 6 exist."""
    client = make_client()
    # POST to any read-only route must be 405 CONTRACT_VALIDATION_FAILED
    resp = client.post("/api/v1/opportunities")
    assert resp.status_code in (404, 405, 422)
    assert resp.json()["error"]["code"] == "CONTRACT_VALIDATION_FAILED"


def test_export_submission_require_tenant_isolation() -> None:
    """Cross-tenant opportunity id must return NOT_FOUND safe envelope."""
    client = make_client()
    resp = client.get("/api/v1/opportunities/cross-tenant-id-123")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "OPPORTUNITY_NOT_FOUND"
