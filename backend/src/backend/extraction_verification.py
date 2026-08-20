"""Local evidence location and material-change review reset."""

import json
from hashlib import sha256

from backend.contracts.extraction import ProposedExtraction, VerifiedExtraction
from backend.contracts.rules import (
    EvidenceProposal,
    ProposedRuleGroup,
    ProposedRuleLeaf,
)
from backend.documents import ParsedDocument, normalize_text


class EvidenceVerificationError(ValueError):
    """Report a safe local evidence or revision consistency failure."""


def verify_extraction(
    document: ParsedDocument, proposed: ProposedExtraction
) -> VerifiedExtraction:
    """Locate every excerpt and prove the complete processed-page inventory."""
    if proposed.document_sha256 != document.document_sha256:
        raise EvidenceVerificationError("DOCUMENT_HASH_MISMATCH")
    expected_pages = [page.physical_page_number for page in document.pages]
    if proposed.processed_page_numbers != expected_pages:
        raise EvidenceVerificationError("INCOMPLETE_PAGE_INVENTORY")
    page_by_number = {page.physical_page_number: page for page in document.pages}
    evidence_items = list(iter_proposed_evidence(proposed))
    for item in evidence_items:
        page = page_by_number.get(item.physical_page_number)
        if page is None or _normalize_evidence_text(item.excerpt) not in (
            _normalize_evidence_text(page.text)
        ):
            raise EvidenceVerificationError("EXCERPT_NOT_FOUND")
    return VerifiedExtraction(
        proposal=proposed,
        extraction_state="EVIDENCE_VERIFIED",
        review_state=proposed.review_state,
        decision_state="UNKNOWN",
    )


def reset_review_for_material_change(
    previous: ProposedExtraction, replacement: ProposedExtraction
) -> ProposedExtraction:
    """Increment revision and clear review when document identity materially changes."""
    if previous.document_sha256 == replacement.document_sha256:
        raise EvidenceVerificationError("MATERIAL_CHANGE_REQUIRED")
    return replacement.model_copy(
        update={"revision": previous.revision + 1, "review_state": "UNREVIEWED"}
    )


def iter_proposed_evidence(proposed: ProposedExtraction) -> list[EvidenceProposal]:
    """Flatten requirement and authority evidence without evaluating rules."""
    evidence = _iter_group_evidence(proposed.requirements)
    if proposed.authority_statement is not None:
        evidence.append(proposed.authority_statement.evidence)
    return evidence


def _normalize_evidence_text(text: str) -> str:
    """Treat the selected PDF font's private-use bullet glyph as word spacing."""
    return normalize_text(text.replace("\uf0b7", " "))


def _iter_group_evidence(group: ProposedRuleGroup) -> list[EvidenceProposal]:
    """Flatten requirement evidence from a recursive proposal without evaluation."""
    evidence: list[EvidenceProposal] = []
    for child in group.children:
        if isinstance(child, ProposedRuleLeaf):
            evidence.extend(child.evidence)
        else:
            evidence.extend(_iter_group_evidence(child))
    return evidence


def is_prompt_injection_present(text: str) -> bool:
    """Detect prompt injection markers while treating page text as untrusted data."""
    lowered = text.lower()
    return any(marker in lowered for marker in ("ignore prior instructions", "call a tool", "system:"))


def excerpt_located(page_text: str, excerpt: str) -> bool:
    """Check if excerpt is locatable on normalized page text."""
    return _normalize_evidence_text(excerpt) in _normalize_evidence_text(page_text)


def needs_human_review(previous: ProposedExtraction | None, current: ProposedExtraction) -> bool:
    """Queue human review when material revision or new rule set appears."""
    if previous is None:
        return True
    if previous.document_sha256 != current.document_sha256:
        return True
    return previous.requirements != current.requirements or previous.authority_statement != current.authority_statement


def persist_verification_metadata(proposed: ProposedExtraction, document: ParsedDocument, prompt_sha256: str, schema_version: str, model: str, tokens: dict[str, object] | None) -> dict[str, object]:
    """Return persisted hashes, page inventory, and token usage for audit."""
    page_hashes = {p.physical_page_number: p.normalized_text_sha256 for p in document.pages}
    digest = sha256(json.dumps(proposed.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    return {"prompt_sha256": prompt_sha256, "schema_version": schema_version, "model": model, "document_sha256": document.document_sha256, "page_hashes": page_hashes, "processed_pages": proposed.processed_page_numbers, "tokens": tokens or {}, "output_digest": digest}
