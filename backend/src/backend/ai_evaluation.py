"""AI governance, evaluation metrics, rate limits, and cost controls."""

from dataclasses import dataclass

ALLOWED_MODELS = frozenset({"deepseek-v4-flash", "deepseek-v4-pro"})
AI_FEATURES = frozenset(
    {
        "extraction",
        "citations",
        "qa",
        "compliance",
        "claims",
        "amendment_mapping",
    }
)
RATE_LIMITS = {"per_user": 10, "per_org": 100, "per_global": 1000}
WINDOW_MS = 60_000
COST_PER_1K = {"input": 0.001, "output": 0.002}


@dataclass(frozen=True, slots=True)
class TokenUsage:
    """Track counted tokens per feature without sensitive prompts."""

    feature: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0

    def total(self) -> int:
        """Return billable tokens excluding cache hits."""
        return max(0, self.input_tokens + self.output_tokens - self.cached_tokens)


@dataclass(frozen=True, slots=True)
class EvalMetrics:
    """Aggregate governance metrics across one labeled evaluation run."""

    schema_validity: float
    citation_precision: float
    citation_recall: float
    excerpt_location: float
    unsupported_claim_rate: float
    abstention_correctness: float
    avg_latency_ms: float
    total_cost: float
    unsupported_hard_count: int
    cross_tenant_count: int


def estimate_cost(usage: TokenUsage) -> float:
    """Estimate USD cost from token counts without logging prompts."""
    return round(
        usage.input_tokens / 1000 * COST_PER_1K["input"]
        + usage.output_tokens / 1000 * COST_PER_1K["output"],
        6,
    )


def is_model_allowed(model: str) -> bool:
    """Return whether the model is on the approved allowlist."""
    return model in ALLOWED_MODELS


def is_feature_enabled(feature: str, kill_switches: dict[str, bool]) -> bool:
    """Return feature availability after kill-switch check."""
    if feature not in AI_FEATURES:
        return False
    return not kill_switches.get(feature, False)


def check_rate_limit(counts: dict[str, int]) -> dict[str, object]:
    """Check per-user/org/global token-bucket counts within WINDOW_MS."""
    for key in ("per_user", "per_org", "per_global"):
        if counts.get(key, 0) >= RATE_LIMITS[key]:
            return {"allowed": False, "retry_after_ms": WINDOW_MS, "limited": key}
    return {"allowed": True, "retry_after_ms": 0, "limited": None}


def _expected_ids(case: dict) -> set[str]:
    """Return expected citation ids supporting both snake and camel keys."""
    return set(case.get("expected_cited_ids", case.get("expectedCitedIds", [])))


def compute_metrics(cases: list[dict], outputs: list[dict]) -> EvalMetrics:
    """Compute schema, citation, claim, abstention, latency, and cost metrics."""
    n = max(1, len(cases))
    valid = sum(1 for o in outputs if o.get("schema_valid"))
    tp = sum(len(set(o.get("cited_ids", [])) & _expected_ids(c)) for c, o in zip(cases, outputs))
    fp = sum(len(set(o.get("cited_ids", [])) - _expected_ids(c)) for c, o in zip(cases, outputs))
    fn = sum(len(_expected_ids(c) - set(o.get("cited_ids", []))) for c, o in zip(cases, outputs))
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    located = sum(1 for o in outputs if o.get("excerpt_located"))
    unsupported = sum(1 for o in outputs if o.get("unsupported_claim"))
    hard_unsupported = sum(1 for c, o in zip(cases, outputs) if c.get("hard_clause") and o.get("unsupported_claim"))
    cross = sum(1 for o in outputs if o.get("cross_tenant"))
    abstain_ok = sum(1 for c, o in zip(cases, outputs) if c.get("requires_abstention") == o.get("abstained"))
    lat = sum(o.get("latency_ms", 0) for o in outputs) / n
    cost = sum(o.get("cost", 0) for o in outputs)
    return EvalMetrics(
        schema_validity=round(valid / n, 4),
        citation_precision=round(precision, 4),
        citation_recall=round(recall, 4),
        excerpt_location=round(located / n, 4),
        unsupported_claim_rate=round(unsupported / n, 4),
        abstention_correctness=round(abstain_ok / n, 4),
        avg_latency_ms=round(lat, 2),
        total_cost=round(cost, 6),
        unsupported_hard_count=hard_unsupported,
        cross_tenant_count=cross,
    )


def check_production_gate(metrics: EvalMetrics) -> dict[str, object]:
    """Require zero unsupported hard clauses and zero cross-tenant before enable."""
    blocked: list[str] = []
    if metrics.unsupported_hard_count != 0:
        blocked.append("unsupported_hard_clause")
    if metrics.cross_tenant_count != 0:
        blocked.append("cross_tenant_retrieval")
    if metrics.schema_validity < 1.0:
        blocked.append("schema_validity")
    return {"enabled": len(blocked) == 0, "blocked_reasons": blocked}
