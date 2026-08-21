"""Governance metrics, gate, rate limits, token tracking, kill switches."""

import json
from pathlib import Path

from backend.ai_evaluation import (
    AI_FEATURES,
    ALLOWED_MODELS,
    TokenUsage,
    check_production_gate,
    check_rate_limit,
    compute_metrics,
    estimate_cost,
    is_feature_enabled,
    is_model_allowed,
)

CASES_DIR = Path(__file__).parent / "evaluation_cases"


def _load(feature: str) -> list[dict]:
    """Load labeled cases for one feature."""
    data = json.loads((CASES_DIR / f"{feature}.json").read_text())
    return data["cases"]


def _outputs_for(cases: list[dict], **overrides: object) -> list[dict]:
    """Build passing outputs aligned to cases."""
    outs = []
    for c in cases:
        outs.append(
            {
                "schema_valid": True,
                "cited_ids": c.get("expectedCitedIds", []),
                "excerpt_located": True,
                "unsupported_claim": False,
                "cross_tenant": False,
                "abstained": c.get("requires_abstention", False),
                "latency_ms": 120,
                "cost": 0.001,
            }
            | dict(overrides)
        )
    return outs


def test_eval_sets_exist_for_all_features() -> None:
    """Each labeled eval set must exist with version and cases."""
    for feat in ["extraction", "citations", "qa", "compliance", "claims", "amendment_mapping"]:
        path = CASES_DIR / f"{feat}.json"
        assert path.exists()
        data = json.loads(path.read_text())
        assert data["datasetVersion"]
        assert len(data["cases"]) >= 2


def test_metrics_perfect_run() -> None:
    """Perfect outputs yield 1.0 validity/precision/recall and zero unsupported."""
    cases = _load("extraction")
    metrics = compute_metrics(cases, _outputs_for(cases))
    assert metrics.schema_validity == 1.0
    assert metrics.citation_precision == 1.0
    assert metrics.citation_recall == 1.0
    assert metrics.excerpt_location == 1.0
    assert metrics.unsupported_claim_rate == 0.0
    assert metrics.abstention_correctness == 1.0
    assert metrics.cross_tenant_count == 0
    assert metrics.unsupported_hard_count == 0


def test_citation_precision_recall_partial() -> None:
    """Partial citations lower precision and recall."""
    cases = _load("citations")
    outs = _outputs_for(cases)
    outs[0]["cited_ids"] = ["chunk-010"]  # miss one
    outs[1]["cited_ids"] = ["chunk-012", "chunk-999"]  # one fp
    metrics = compute_metrics(cases, outs)
    assert metrics.citation_precision < 1.0
    assert metrics.citation_recall < 1.0


def test_unsupported_claim_rate_and_latency_cost() -> None:
    """Unsupported claims, latency, and cost are aggregated."""
    cases = _load("claims")
    outs = _outputs_for(cases)
    outs[1]["unsupported_claim"] = True
    outs[0]["latency_ms"] = 200
    outs[1]["latency_ms"] = 400
    outs[2]["latency_ms"] = 300
    outs[0]["cost"] = 0.002
    metrics = compute_metrics(cases, outs)
    assert metrics.unsupported_claim_rate > 0
    assert metrics.avg_latency_ms == 300
    assert metrics.total_cost == 0.004


def test_abstention_correctness() -> None:
    """Abstention must match requires_abstention per case."""
    cases = _load("qa")
    outs = _outputs_for(cases)
    outs[1]["abstained"] = False  # should abstain but didn't
    metrics = compute_metrics(cases, outs)
    assert metrics.abstention_correctness < 1.0


def test_gate_requires_zero_hard_and_zero_cross_tenant() -> None:
    """Gate blocks when any hard unsupported or cross-tenant retrieval exists."""
    cases = _load("extraction")
    outs = _outputs_for(cases)
    metrics = compute_metrics(cases, outs)
    assert check_production_gate(metrics)["enabled"] is True
    outs[0]["unsupported_claim"] = True
    metrics2 = compute_metrics(cases, outs)
    gate2 = check_production_gate(metrics2)
    assert gate2["enabled"] is False
    assert "unsupported_hard_clause" in gate2["blocked_reasons"]
    outs[0]["unsupported_claim"] = False
    outs[0]["cross_tenant"] = True
    metrics3 = compute_metrics(cases, outs)
    gate3 = check_production_gate(metrics3)
    assert "cross_tenant_retrieval" in gate3["blocked_reasons"]


def test_gate_blocks_schema_invalid() -> None:
    """Schema invalidity also blocks production enablement."""
    cases = _load("compliance")
    outs = _outputs_for(cases)
    outs[0]["schema_valid"] = False
    metrics = compute_metrics(cases, outs)
    assert "schema_validity" in check_production_gate(metrics)["blocked_reasons"]


def test_rate_limits_per_user_org_global() -> None:
    """Per-user, per-org, global limits enforce with retry_after."""
    assert check_rate_limit({"per_user": 9, "per_org": 50, "per_global": 500})["allowed"] is True
    assert check_rate_limit({"per_user": 10, "per_org": 50, "per_global": 500})["allowed"] is False
    assert check_rate_limit({"per_user": 5, "per_org": 100, "per_global": 500})["allowed"] is False
    assert check_rate_limit({"per_user": 5, "per_org": 50, "per_global": 1000})["allowed"] is False
    r = check_rate_limit({"per_user": 10})
    assert r["retry_after_ms"] == 60000


def test_token_tracking_and_cost() -> None:
    """Token usage excludes cache hits and estimates cost."""
    usage = TokenUsage(feature="qa", input_tokens=1000, output_tokens=500, cached_tokens=200)
    assert usage.total() == 1300
    cost = estimate_cost(usage)
    assert cost == round(1 * 0.001 + 0.5 * 0.002, 6)
    assert TokenUsage(feature="extraction", input_tokens=100, output_tokens=50).total() == 150


def test_kill_switch_and_model_allowlist() -> None:
    """Kill switches disable features; only allowlisted models pass."""
    assert is_feature_enabled("extraction", {}) is True
    assert is_feature_enabled("extraction", {"extraction": True}) is False
    assert is_feature_enabled("unknown", {}) is False
    assert is_model_allowed("deepseek-v4-flash") is True
    assert is_model_allowed("deepseek-v4-pro") is True
    assert is_model_allowed("gpt-4") is False
    assert ALLOWED_MODELS == {"deepseek-v4-flash", "deepseek-v4-pro"}
    assert AI_FEATURES == {"extraction", "citations", "qa", "compliance", "claims", "amendment_mapping"}
