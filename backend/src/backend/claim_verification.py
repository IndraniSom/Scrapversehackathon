"""Claim verification that blocks approval for unsupported mandatory facts."""

from __future__ import annotations

import re
import unicodedata

from pydantic import BaseModel, ConfigDict, Field

SUPPORTED = "SUPPORTED"
UNSUPPORTED = "UNSUPPORTED"
STALE = "STALE"
CONTRADICTORY = "CONTRADICTORY"
OVER_STRONG = "OVER_STRONG"

_STRONG_WORDS = re.compile(r"\b(guaranteed|always|never|100%|ensure|certain)\b", re.IGNORECASE)
_NEGATION = re.compile(r"\b(not|no|false|fail)\b", re.IGNORECASE)


class ClosedClaimModel(BaseModel):
    """Reject undeclared claim fields at every boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class EvidenceRecord(ClosedClaimModel):
    """Approved evidence used to support a claim."""

    id: str = Field(min_length=1)
    organization_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=4000)
    freshness: str = Field(default="fresh", pattern=r"^(fresh|stale|expired)$")


class Claim(ClosedClaimModel):
    """One factual proposal claim requiring evidence when mandatory."""

    id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=2000)
    hardness: str = Field(default="hard", pattern=r"^(hard|soft)$")
    is_mandatory: bool = True
    evidence_ids: list[str] = Field(default_factory=list)


class ClaimResult(ClosedClaimModel):
    """Verification outcome for one claim with block decision."""

    claim_id: str
    status: str
    reason: str | None = None
    blocking: bool = False


def _normalize(value: str) -> str:
    """Normalize for claim and evidence comparison."""
    text = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", " ", text).strip().lower()


def _is_over_strong(claim_text: str, evidence_text: str) -> bool:
    """Return true when claim uses absolute language absent from evidence."""
    claim_strong = bool(_STRONG_WORDS.search(claim_text))
    evidence_strong = bool(_STRONG_WORDS.search(evidence_text))
    return claim_strong and not evidence_strong


def _is_contradictory(claim_text: str, evidence_text: str) -> bool:
    """Return true when claim and evidence contain opposite negation."""
    norm_claim = _normalize(claim_text)
    norm_evidence = _normalize(evidence_text)
    claim_neg = bool(_NEGATION.search(norm_claim))
    evidence_neg = bool(_NEGATION.search(norm_evidence))
    shared = any(word in norm_evidence for word in norm_claim.split() if len(word) > 4)
    return shared and claim_neg != evidence_neg


def verify_claim(
    claim: Claim,
    evidence_by_id: dict[str, EvidenceRecord],
    organization_id: str,
) -> ClaimResult:
    """Verify one mandatory claim has fresh entailing evidence."""
    if not claim.is_mandatory:
        return ClaimResult(claim_id=claim.id, status=SUPPORTED, blocking=False)
    if not claim.evidence_ids:
        return ClaimResult(claim_id=claim.id, status=UNSUPPORTED, reason="NO_EVIDENCE", blocking=True)
    texts: list[str] = []
    for eid in claim.evidence_ids:
        record = evidence_by_id.get(eid)
        if record is None:
            return ClaimResult(claim_id=claim.id, status=UNSUPPORTED, reason="EVIDENCE_NOT_FOUND", blocking=True)
        if record.organization_id != organization_id:
            return ClaimResult(claim_id=claim.id, status=UNSUPPORTED, reason="CROSS_TENANT", blocking=True)
        if record.freshness != "fresh":
            return ClaimResult(claim_id=claim.id, status=STALE, reason="STALE_EVIDENCE", blocking=True)
        texts.append(record.text)
    joined = " ".join(_normalize(t) for t in texts)
    norm_claim = _normalize(claim.text)
    if norm_claim not in joined:
        claim_numbers = set(re.findall(r"\d+", norm_claim))
        evidence_numbers = set(re.findall(r"\d+", joined))
        if claim_numbers - evidence_numbers:
            return ClaimResult(claim_id=claim.id, status=UNSUPPORTED, reason="FABRICATED_NUMBER", blocking=True)
        return ClaimResult(claim_id=claim.id, status=UNSUPPORTED, reason="NOT_ENTAILED", blocking=True)
    evidence_joined = " ".join(texts)
    if _is_contradictory(claim.text, evidence_joined):
        return ClaimResult(claim_id=claim.id, status=CONTRADICTORY, reason="CONTRADICTION", blocking=True)
    if _is_over_strong(claim.text, evidence_joined):
        return ClaimResult(claim_id=claim.id, status=OVER_STRONG, reason="OVER_STRONG", blocking=True)
    return ClaimResult(claim_id=claim.id, status=SUPPORTED, blocking=False)


def verify_claims(
    claims: list[Claim],
    evidence: list[EvidenceRecord],
    organization_id: str,
) -> list[ClaimResult]:
    """Verify all claims against tenant-scoped evidence in input order."""
    if not organization_id.strip():
        raise ValueError("organization_id is required")
    by_id = {item.id: item for item in evidence}
    return [verify_claim(claim, by_id, organization_id) for claim in claims]


def is_approval_blocked(results: list[ClaimResult]) -> bool:
    """Return whether approval must be blocked for mandatory failures."""
    return any(result.blocking for result in results)
