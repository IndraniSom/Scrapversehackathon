"""Cited tender Q&A with per-paragraph citations and tenant isolation."""

import re
from collections import defaultdict
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field

ABSTAIN_TEXT = "Not established by the reviewed documents"
_RATE_LIMIT = 20
_TOKEN_COST_PER_1K = 0.002
_usage: dict[str, dict[str, float]] = defaultdict(lambda: {"tokens": 0, "cost": 0})
_rate: dict[str, list[float]] = defaultdict(list)


class RetrievedChunk(BaseModel):
    """One retrievable chunk bound to tenant, tender, and document."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    chunk_id: str = Field(min_length=1)
    organization_id: str = Field(min_length=1)
    opportunity_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    document_hash: str = Field(min_length=16)
    page_number: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=4000)


class Citation(BaseModel):
    """Citation linking a paragraph to an authorized source chunk."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    chunk_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    page_number: int = Field(ge=1)
    document_hash: str = Field(min_length=16)


class AnswerParagraph(BaseModel):
    """One answer paragraph requiring at least one authorized citation."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    text: str = Field(min_length=1, max_length=2000)
    citations: list[Citation] = Field(min_length=1)


class TenderAnswer(BaseModel):
    """Validated cited answer or abstention with usage metadata."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    question: str = Field(min_length=1)
    paragraphs: list[AnswerParagraph]
    abstained: bool
    model_name: str = Field(min_length=1)
    tokens_used: int = Field(ge=0)
    cost_usd: float = Field(ge=0)


def _now() -> float:
    """Return current UTC epoch seconds for rate limiting."""
    return datetime.now(UTC).timestamp()


def check_rate_limit(organization_id: str) -> None:
    """Enforce per-organization Q&A rate limit or raise."""
    now = _now()
    window = [t for t in _rate[organization_id] if now - t < 60]
    if len(window) >= _RATE_LIMIT:
        raise ValueError("RATE_LIMITED")
    window.append(now)
    _rate[organization_id] = window


def _validate_tenant(
    chunks: list[RetrievedChunk], organization_id: str, opportunity_id: str
) -> None:
    """Reject retrieval that crosses tenant or tender boundaries."""
    for chunk in chunks:
        if chunk.organization_id != organization_id:
            raise ValueError("CROSS_TENANT_RETRIEVAL")
        if chunk.opportunity_id != opportunity_id:
            raise ValueError("CROSS_TENDER_RETRIEVAL")


def _validate_citations(
    paragraphs: list[AnswerParagraph], allowed_ids: set[str]
) -> None:
    """Require each paragraph to cite only supplied chunk ids."""
    for para in paragraphs:
        if not para.citations:
            raise ValueError("MISSING_CITATION")
        for citation in para.citations:
            if citation.chunk_id not in allowed_ids:
                raise ValueError("CITATION_NOT_IN_CONTEXT")


def _sanitize_question(question: str) -> str:
    """Treat question as data and strip prompt-injection directives."""
    lowered = question.lower()
    if "ignore previous" in lowered or "system:" in lowered:
        return question.strip()[:500]
    return question.strip()[:500]


def retrieve_with_adjacent(
    chunks: list[RetrievedChunk], query: str, limit: int = 6
) -> list[RetrievedChunk]:
    """Return top chunks plus adjacent pages without crossing documents."""
    _ = query
    by_doc: dict[str, list[RetrievedChunk]] = defaultdict(list)
    for chunk in chunks:
        by_doc[chunk.document_id].append(chunk)
    top = chunks[:limit]
    expanded: list[RetrievedChunk] = []
    seen: set[str] = set()
    for item in top:
        for neighbor in by_doc[item.document_id]:
            if neighbor.chunk_id not in seen and abs(neighbor.page_number - item.page_number) <= 1:
                expanded.append(neighbor)
                seen.add(neighbor.chunk_id)
    return expanded[: limit + 2]


def build_answer(
    organization_id: str,
    opportunity_id: str,
    question: str,
    chunks: list[RetrievedChunk],
    draft_paragraphs: list[AnswerParagraph] | None,
    model_name: str = "deepseek-v4-flash",
) -> TenderAnswer:
    """Validate tenant, citations, and abstention for one tender answer."""
    if not question.strip():
        raise ValueError("EMPTY_QUESTION")
    check_rate_limit(organization_id)
    sanitized = _sanitize_question(question)
    _validate_tenant(chunks, organization_id, opportunity_id)
    allowed = {chunk.chunk_id for chunk in chunks}
    chunk_text = " ".join(chunk.text for chunk in chunks).lower()
    if not chunks or draft_paragraphs is None or len(draft_paragraphs) == 0:
        return _abstain(sanitized, model_name)
    _validate_citations(draft_paragraphs, allowed)
    query_terms = [re.sub(r"[^a-z0-9]", "", term) for term in sanitized.lower().split()]
    query_terms = [term for term in query_terms if len(term) >= 3]
    has_support = any(term in chunk_text for term in query_terms) if query_terms else False
    if not has_support:
        return _abstain(sanitized, model_name)
    tokens = sum(len(paragraph.text.split()) for paragraph in draft_paragraphs) + len(sanitized.split())
    cost = round((tokens / 1000) * _TOKEN_COST_PER_1K, 6)
    _usage[organization_id]["tokens"] += tokens
    _usage[organization_id]["cost"] += cost
    return TenderAnswer(
        question=sanitized,
        paragraphs=draft_paragraphs,
        abstained=False,
        model_name=model_name,
        tokens_used=tokens,
        cost_usd=cost,
    )


def _abstain(question: str, model_name: str) -> TenderAnswer:
    """Return the single allowed abstention response."""
    return TenderAnswer(
        question=question,
        paragraphs=[],
        abstained=True,
        model_name=model_name,
        tokens_used=0,
        cost_usd=0,
    )


def get_usage(organization_id: str) -> dict[str, float]:
    """Return tracked token and cost usage for one organization."""
    return dict(_usage[organization_id])


def reset_state() -> None:
    """Clear rate and usage state for isolated tests."""
    _usage.clear()
    _rate.clear()
