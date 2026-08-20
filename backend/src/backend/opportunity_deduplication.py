"""Deterministic opportunity deduplication and relationship classification."""

import json
import re
from hashlib import sha256
from urllib.parse import urlsplit

from backend.source_provider import ALLOWED_DOCUMENT_HOSTS

# Thresholds for semantic duplicate detection.
SIMILARITY_THRESHOLD = 0.82
MIN_TITLE_TOKENS = 3


def normalize_title(title: str) -> list[str]:
    """Tokenize and lowercase a title for Jaccard comparison."""
    tokens = re.split(r"\W+", title.lower())
    return [t for t in tokens if t]


def jaccard_similarity(a_tokens: list[str], b_tokens: list[str]) -> float:
    """Return Jaccard similarity of two token sets."""
    if not a_tokens or not b_tokens:
        return 0.0
    sa, sb = set(a_tokens), set(b_tokens)
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def is_allowlisted_url(url: str) -> bool:
    """Check that a document URL is https and host-allowlisted."""
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
            return False
        if parsed.fragment:
            return False
        return parsed.hostname in ALLOWED_DOCUMENT_HOSTS
    except ValueError:
        return False


def canonical_digest(fields: dict) -> str:
    """Compute a hex digest of canonical JSON for version comparison."""
    return sha256(json.dumps(fields, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def opportunity_digest(opportunity: dict, document_hashes: list[str] | None = None) -> str:
    """Build a version digest from canonical opportunity fields."""
    payload = {
        "authority": opportunity.get("authority", ""),
        "canonical_url": opportunity.get("canonical_url", ""),
        "category": opportunity.get("category", ""),
        "closes_at": opportunity.get("closes_at"),
        "document_hashes": sorted(document_hashes or opportunity.get("document_hashes") or []),
        "reference_number": opportunity.get("reference_number"),
        "source": opportunity.get("source"),
        "source_tender_id": opportunity.get("source_tender_id"),
        "title": opportunity.get("title", ""),
    }
    return canonical_digest(payload)


def should_create_new_version(existing_digest: str | None, new_digest: str) -> bool:
    """Return true only when digest differs; unchanged replay creates no version."""
    if not existing_digest:
        return True
    return existing_digest != new_digest


def is_exact_identity(a: dict, b: dict) -> bool:
    """Return true when source and sourceTenderId match exactly."""
    return a.get("source") == b.get("source") and a.get("source_tender_id") == b.get("source_tender_id")


def has_document_overlap(a_hashes: list[str], b_hashes: list[str]) -> bool:
    """Return true when any document hash overlaps between two opportunities."""
    return bool(set(a_hashes) & set(b_hashes))


def is_cross_portal_similar(a: dict, b: dict) -> bool:
    """Return true for cross-portal high title similarity without exact identity."""
    if a.get("source") == b.get("source") and a.get("source_tender_id") == b.get("source_tender_id"):
        return False
    sim = jaccard_similarity(normalize_title(a.get("title", "")), normalize_title(b.get("title", "")))
    return sim >= SIMILARITY_THRESHOLD


def classify_relationship(source: dict, target: dict) -> dict | None:
    """Classify a pair as duplicate, corrigendum, or candidate; reject false duplicates."""
    # Exact identity -> confirmed duplicate, never overwrite history.
    if is_exact_identity(source, target):
        return {"kind": "duplicate", "status": "confirmed", "reason": "exact_source_key"}
    # Document hash overlap -> confirmed duplicate/corrigendum.
    s_hashes = source.get("document_hashes") or []
    t_hashes = target.get("document_hashes") or []
    if has_document_overlap(s_hashes, t_hashes):
        return {"kind": "duplicate", "status": "confirmed", "reason": "document_hash_match"}
    # Title signals corrigendum or clarification with same authority.
    title = (target.get("title") or "").lower()
    if (
        ("corrigendum" in title or "clarification" in title)
        and source.get("authority") == target.get("authority")
        and jaccard_similarity(
            normalize_title(source.get("title", "")),
            normalize_title(re.sub(r"corrigendum|clarification", "", title)),
        )
        >= 0.6
    ):
        kind = "corrigendum" if "corrigendum" in title else "clarification"
        return {"kind": kind, "status": "confirmed", "reason": "authority_amendment"}
    # Cross-portal semantic similarity -> candidate for review.
    if target.get("source") != source.get("source"):
        sim = jaccard_similarity(normalize_title(source.get("title", "")), normalize_title(target.get("title", "")))
        if sim >= SIMILARITY_THRESHOLD:
            return {"kind": "duplicate", "status": "candidate", "reason": f"cross_portal_similarity:{sim:.2f}"}
    # False duplicate rejection: low similarity or mismatched critical fields.
    return None


def queue_document_fetch(url: str) -> bool:
    """Validate allowlist before queuing; raise on disallowed fetch."""
    if not is_allowlisted_url(url):
        raise ValueError("document URL is not allowlisted")
    return True
