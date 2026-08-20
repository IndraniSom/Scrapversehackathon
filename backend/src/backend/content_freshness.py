"""Approved content freshness, duplicate, and SME helpers."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ContentEntry:
    """Minimal approved content view for freshness checks."""

    id: str
    title: str
    body: str
    status: str
    capability_area: str | None
    owner_id: str
    updated_at_ms: int
    review_cadence_days: int | None
    valid_until_ms: int | None


@dataclass(frozen=True, slots=True)
class Contribution:
    """Prior approved contribution for SME ranking."""

    owner_id: str
    capability_area: str
    approved_count: int
    last_approved_ms: int


@dataclass(frozen=True, slots=True)
class NearDuplicate:
    """Suggested duplicate with similarity score."""

    candidate_id: str
    score: float


_STALE_FALLBACK_DAYS = 90


def _is_stale(entry: ContentEntry, now_ms: int) -> bool:
    """Return true when entry exceeds cadence or fallback age."""
    if entry.status == "expired":
        return True
    cadence = entry.review_cadence_days if entry.review_cadence_days is not None else _STALE_FALLBACK_DAYS
    if cadence <= 0:
        return False
    age_days = (now_ms - entry.updated_at_ms) / 86_400_000
    return age_days > cadence


def _is_cert_expired(entry: ContentEntry, now_ms: int) -> bool:
    """Return true when embedded certification validity has passed."""
    if entry.valid_until_ms is None:
        return False
    return now_ms > entry.valid_until_ms


def _has_changed_reference(body: str, known_people: Sequence[str], known_products: Sequence[str]) -> bool:
    """Detect stale person/product mentions that no longer exist."""
    lowered = body.lower()
    for person in known_people:
        if person.lower() in lowered:
            return False
    for product in known_products:
        if product.lower() in lowered:
            return False
    # If body mentions generic stale markers and no known valid remains, flag for review
    stale_markers = ["former employee", "discontinued", "deprecated", "legacy product"]
    return any(marker in lowered for marker in stale_markers)


def find_stale_entries(
    entries: Sequence[ContentEntry],
    now_ms: int,
    known_people: Sequence[str] = (),
    known_products: Sequence[str] = (),
) -> list[ContentEntry]:
    """Return approved entries that need review due to age, expiry, or stale refs."""
    stale: list[ContentEntry] = []
    for entry in entries:
        if entry.status != "approved":
            continue
        if _is_stale(entry, now_ms) or _is_cert_expired(entry, now_ms):
            stale.append(entry)
            continue
        if _has_changed_reference(entry.body, known_people, known_products):
            stale.append(entry)
    return stale


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Compute cosine similarity; returns 0 for zero vectors or length mismatch."""
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def suggest_near_duplicates(
    query_embedding: Sequence[float],
    candidates: Sequence[tuple[str, Sequence[float]]],
    threshold: float = 0.88,
    limit: int = 5,
) -> list[NearDuplicate]:
    """Suggest near-duplicates above threshold; never merges automatically."""
    if not query_embedding:
        return []
    scored: list[NearDuplicate] = []
    for candidate_id, embedding in candidates:
        score = cosine_similarity(query_embedding, embedding)
        if score >= threshold:
            scored.append(NearDuplicate(candidate_id=candidate_id, score=score))
    scored.sort(key=lambda item: item.score, reverse=True)
    return scored[: max(0, limit)]


def recommend_smes(
    contributions: Sequence[Contribution],
    capability_area: str,
    limit: int = 3,
) -> list[Contribution]:
    """Rank prior contributors in capability area by count then recency."""
    if not capability_area.strip():
        return []
    filtered = [c for c in contributions if c.capability_area.lower() == capability_area.lower()]
    filtered.sort(key=lambda c: (c.approved_count, c.last_approved_ms), reverse=True)
    return filtered[: max(0, limit)]
