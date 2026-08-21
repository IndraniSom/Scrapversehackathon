"""Grounded proposal drafting with citation and entailment checks; factual blocks require source IDs and verification, else AUTHOR_INPUT_REQUIRED."""

from __future__ import annotations

import hashlib
import re
import unicodedata

from pydantic import BaseModel, ConfigDict, Field

AUTHOR_INPUT_REQUIRED = "AUTHOR_INPUT_REQUIRED"
GROUNDED = "GROUNDED"

_INJECTION = re.compile(r"ignore previous|system:|call a tool|override", re.IGNORECASE)
_NUMBER = re.compile(r"\b\d+(?:[.,]\d+)*\b")


class ClosedDraftModel(BaseModel):
    """Reject undeclared draft fields at every boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class SourceRecord(ClosedDraftModel):
    """Approved chunk or evidence record used as grounding source."""

    id: str = Field(min_length=1)
    organization_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=4000)
    freshness: str = Field(default="fresh", pattern=r"^(fresh|stale|expired)$")


class DraftBlock(ClosedDraftModel):
    """One generated proposal block requiring citations when factual."""

    id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=2000)
    source_ids: list[str] = Field(default_factory=list)
    is_factual: bool = True


class DraftBlockResult(ClosedDraftModel):
    """Verification outcome for one block with blocking status."""

    block_id: str
    status: str
    reason: str | None = None
    verified_source_ids: list[str] = Field(default_factory=list)


def _normalize(value: str) -> str:
    """Collapse whitespace and normalize unicode for entailment."""
    text = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", " ", text).strip().lower()


def _hash(value: str) -> str:
    """Return sha256 hex for model or prompt version."""
    return hashlib.sha256(value.encode()).hexdigest()


def verify_entailment(block_text: str, source_texts: list[str]) -> bool:
    """Return whether normalized block is contained in joined sources."""
    if not block_text.strip():
        return False
    norm_block = _normalize(block_text)
    joined = " ".join(_normalize(text) for text in source_texts)
    if not joined:
        return False
    if norm_block in joined:
        return True
    block_numbers = set(_NUMBER.findall(norm_block))
    source_numbers = set(_NUMBER.findall(joined))
    if block_numbers and not block_numbers.issubset(source_numbers):
        return False
    sentences = [s.strip() for s in norm_block.split(".") if s.strip()]
    return all(sentence in joined for sentence in sentences if len(sentence) > 10)


def verify_block(
    block: DraftBlock,
    sources_by_id: dict[str, SourceRecord],
    organization_id: str,
) -> DraftBlockResult:
    """Verify one block cites authorized, fresh, entailing sources."""
    if not block.is_factual:
        return DraftBlockResult(block_id=block.id, status=GROUNDED, verified_source_ids=[])
    if not block.source_ids:
        return DraftBlockResult(block_id=block.id, status=AUTHOR_INPUT_REQUIRED, reason="MISSING_CITATION")
    if _INJECTION.search(block.text):
        return DraftBlockResult(block_id=block.id, status=AUTHOR_INPUT_REQUIRED, reason="PROMPT_INJECTION")
    texts: list[str] = []
    for sid in block.source_ids:
        src = sources_by_id.get(sid)
        if src is None:
            return DraftBlockResult(block_id=block.id, status=AUTHOR_INPUT_REQUIRED, reason="SOURCE_NOT_FOUND")
        if src.organization_id != organization_id:
            return DraftBlockResult(block_id=block.id, status=AUTHOR_INPUT_REQUIRED, reason="CROSS_TENANT")
        if src.freshness != "fresh":
            return DraftBlockResult(block_id=block.id, status=AUTHOR_INPUT_REQUIRED, reason="STALE_EVIDENCE")
        texts.append(src.text)
    if not verify_entailment(block.text, texts):
        numbers = set(_NUMBER.findall(_normalize(block.text)))
        source_numbers = set(_NUMBER.findall(" ".join(_normalize(t) for t in texts)))
        reason = "FABRICATED_NUMBER" if numbers - source_numbers else "NOT_ENTAILED"
        return DraftBlockResult(block_id=block.id, status=AUTHOR_INPUT_REQUIRED, reason=reason)
    return DraftBlockResult(block_id=block.id, status=GROUNDED, verified_source_ids=list(block.source_ids))


def verify_draft(
    blocks: list[DraftBlock],
    sources: list[SourceRecord],
    organization_id: str,
) -> list[DraftBlockResult]:
    """Verify every block against tenant-scoped sources in deterministic order."""
    if not organization_id.strip():
        raise ValueError("organization_id is required")
    by_id = {src.id: src for src in sources}
    return [verify_block(block, by_id, organization_id) for block in blocks]


def needs_author_input(results: list[DraftBlockResult]) -> bool:
    """Return whether any block requires author input."""
    return any(result.status == AUTHOR_INPUT_REQUIRED for result in results)


def prompt_hash(prompt_version: str, model: str) -> str:
    """Return deterministic hash for prompt and model pairing."""
    return _hash(f"{prompt_version}:{model}")


def model_hash(model: str, prompt_version: str) -> str:
    """Return hash identifying the model and prompt version."""
    return _hash(f"{model}::{prompt_version}")
