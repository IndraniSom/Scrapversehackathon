"""Local evidence location and material-change review reset."""

from backend.contracts.extraction import (
    ProposedExtraction,
    VerifiedExtraction,
)
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
        if page is None or normalize_text(item.excerpt) not in normalize_text(page.text):
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


def _iter_group_evidence(group: ProposedRuleGroup) -> list[EvidenceProposal]:
    """Flatten requirement evidence from a recursive proposal without evaluation."""
    evidence: list[EvidenceProposal] = []
    for child in group.children:
        if isinstance(child, ProposedRuleLeaf):
            evidence.extend(child.evidence)
        else:
            evidence.extend(_iter_group_evidence(child))
    return evidence
