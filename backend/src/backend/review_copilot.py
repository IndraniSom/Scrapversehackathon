"""Review copilot that summarizes comments into a checklist without resolving, dismissing, or mutating states."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ClosedReviewModel(BaseModel):
    """Reject undeclared review fields at every boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class ProposalComment(ClosedReviewModel):
    """One reviewer comment anchored to a section."""

    id: str = Field(min_length=1)
    proposal_id: str = Field(min_length=1)
    section_id: str | None = None
    anchor: str | None = None
    author_id: str = Field(min_length=1)
    body: str = Field(min_length=1, max_length=2000)
    resolution_state: str = Field(default="open", pattern=r"^(open|resolved)$")


class ChecklistItem(ClosedReviewModel):
    """One unresolved checklist entry derived from comments."""

    id: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    comment_ids: list[str] = Field(min_length=1)
    section_id: str | None = None
    anchor: str | None = None


def _summarize_body(body: str) -> str:
    """Truncate body to a concise checklist summary without resolving intent."""
    text = " ".join(body.strip().split())
    if len(text) <= 80:
        return text
    return text[:77].rstrip() + "..."


def summarize_comments(comments: list[ProposalComment]) -> list[ChecklistItem]:
    """Group open comments by section and anchor into a checklist without resolving or mutating states."""
    grouped: dict[tuple[str | None, str | None], list[ProposalComment]] = {}
    for comment in comments:
        key = (comment.section_id, comment.anchor)
        grouped.setdefault(key, []).append(comment)
    items: list[ChecklistItem] = []
    for (section_id, anchor), group in sorted(grouped.items(), key=lambda item: (item[0][0] or "", item[0][1] or "")):
        open_comments = [c for c in group if c.resolution_state == "open"]
        if not open_comments:
            continue
        first = open_comments[0]
        summaries = [_summarize_body(c.body) for c in open_comments]
        summary = "; ".join(summaries) if len(summaries) > 1 else summaries[0]
        item_id = f"checklist-{(section_id or 'general')}-{anchor or 'all'}"
        item_id = item_id.replace(" ", "-").lower()
        items.append(
            ChecklistItem(
                id=item_id,
                summary=summary,
                comment_ids=[c.id for c in open_comments],
                section_id=section_id,
                anchor=anchor,
            )
        )
        _ = first
    return items


def checklist_markdown(items: list[ChecklistItem]) -> str:
    """Render checklist items as markdown without changing comment states."""
    if not items:
        return "No unresolved comments."
    lines: list[str] = []
    for item in items:
        anchor = f" ({item.anchor})" if item.anchor else ""
        section = item.section_id or "general"
        lines.append(f"- [ ] {section}{anchor}: {item.summary} [{', '.join(item.comment_ids)}]")
    return "\n".join(lines)
