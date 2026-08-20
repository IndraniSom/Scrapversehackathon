"""Map reviewed extraction caches into frozen assessment inputs."""

from datetime import datetime

from backend.contracts.cache import CachedExtraction
from backend.contracts.evaluation import (
    CompanyProfile,
    EvidenceSpan,
    RuleGroup,
    RuleLeaf,
)
from backend.contracts.rules import (
    EvidenceProposal,
    ProposedRuleGroup,
    ProposedRuleLeaf,
)
from backend.contracts.source import OpportunitySummary
from backend.contracts.views import AssessmentInput, AuthorityStatement, DocumentVersion


def assessment_input_from_caches(
    opportunity: OpportunitySummary,
    company: CompanyProfile,
    base: CachedExtraction,
    amendment: CachedExtraction,
    as_of: datetime,
) -> AssessmentInput:
    """Build stable-ID base/amendment rules while carrying certifications unchanged."""
    base_leaves = [_rule_leaf(base, leaf) for leaf in _proposed_leaves(base.verified.proposal.requirements)]
    amendment_source = _proposed_leaves(amendment.verified.proposal.requirements)
    amendment_turnover = next(
        (leaf for leaf in amendment_source if leaf.kind == "TURNOVER_AVERAGE"), None
    )
    if amendment_turnover is None:
        raise ValueError("amendment turnover replacement is missing")
    base_turnover = next((leaf for leaf in base_leaves if leaf.kind == "TURNOVER_AVERAGE"), None)
    certifications = [leaf for leaf in base_leaves if leaf.kind == "CERTIFICATION"]
    if base_turnover is None or len(certifications) != 3:
        raise ValueError("base must contain turnover and three certifications")
    amended_turnover = _rule_leaf(amendment, amendment_turnover)
    base_turnover = base_turnover.model_copy(
        update={"id": "turnover-average", "title": "Average audited IT/ITeS/ESDM turnover"}
    )
    amended_turnover = amended_turnover.model_copy(
        update={"id": "turnover-average", "title": base_turnover.title}
    )
    base_group = _root([base_turnover, *certifications])
    amendment_group = _root([amended_turnover, *certifications])
    authority = amendment.verified.proposal.authority_statement
    if authority is None:
        raise ValueError("reviewed amendment authority statement is missing")
    return AssessmentInput(
        opportunity=opportunity,
        company_profile=company,
        base_document=_document(base),
        amendment_document=_document(amendment),
        base_requirements=base_group,
        amendment_requirements=amendment_group,
        authority_statement=AuthorityStatement(
            actor=authority.actor,
            disposition=authority.disposition,
            effective_change=authority.effective_change,
            replaces_document_id=authority.replaces_document_id,
            evidence=_evidence(amendment, authority.evidence),
        ),
        changed_rule_id="turnover-average",
        as_of=as_of,
        lifecycle="OPEN",
        data_mode=opportunity.data_mode,
        base_revision=base.verified.proposal.revision,
        amendment_revision=amendment.verified.proposal.revision,
        base_extraction_state=base.verified.extraction_state,
        amendment_extraction_state=amendment.verified.extraction_state,
        base_review_state=base.review_state,
        amendment_review_state=amendment.review_state,
    )


def _document(cached: CachedExtraction) -> DocumentVersion:
    """Map one supported reviewed cache into a frozen document view."""
    return DocumentVersion(
        id=cached.document.document_version_id,
        role=cached.document.role,
        source_url=cached.document.source_url,
        sha256=cached.document_sha256,
        physical_page_count=cached.physical_page_count,
        text_quality="SUPPORTED",
    )


def _proposed_leaves(group: ProposedRuleGroup) -> list[ProposedRuleLeaf]:
    """Flatten proposed leaves while preserving source order."""
    leaves: list[ProposedRuleLeaf] = []
    for child in group.children:
        if isinstance(child, ProposedRuleLeaf):
            leaves.append(child)
        else:
            leaves.extend(_proposed_leaves(child))
    return leaves


def _rule_leaf(cached: CachedExtraction, proposed: ProposedRuleLeaf) -> RuleLeaf:
    """Map one supported proposal into a public hard-rule leaf."""
    if proposed.kind not in {"TURNOVER_AVERAGE", "CERTIFICATION"}:
        raise ValueError("unsupported extraction leaf cannot enter demo assessment")
    return RuleLeaf(
        node_type="LEAF",
        id=proposed.id,
        kind=proposed.kind,
        title=proposed.title,
        hardness="HARD",
        predicate=proposed.predicate,
        applicability=None,
        evidence=[_evidence(cached, item) for item in proposed.evidence],
    )


def _evidence(cached: CachedExtraction, proposed: EvidenceProposal) -> EvidenceSpan:
    """Expand one bounded excerpt with immutable page/document provenance."""
    page_hash = next(
        (
            page.normalized_text_sha256
            for page in cached.page_inventory
            if page.physical_page_number == proposed.physical_page_number
        ),
        None,
    )
    if page_hash is None:
        raise ValueError("evidence page is absent from cache inventory")
    return EvidenceSpan(
        source_url=cached.document.source_url,
        source_snapshot_sha256=cached.document_sha256,
        document_sha256=cached.document_sha256,
        document_version_id=cached.document.document_version_id,
        physical_page_number=proposed.physical_page_number,
        printed_page_label=proposed.printed_page_label,
        section_heading=proposed.section_heading,
        excerpt=proposed.excerpt,
        normalized_page_text_sha256=page_hash,
        extraction_model=cached.model,
        extraction_prompt_version=cached.prompt_version,
        extraction_schema_version=cached.schema_version,
        extraction_state=cached.verified.extraction_state,
        review_state=cached.review_state,
    )


def _root(children: list[RuleLeaf]) -> RuleGroup:
    """Build the stable all-hard-rules root used for both versions."""
    return RuleGroup(
        node_type="GROUP",
        id="hard-eligibility",
        operator="ALL",
        minimum_matches=None,
        children=children,
    )
