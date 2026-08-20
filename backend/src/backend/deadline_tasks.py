"""Deadline handling, task planning, and .ics export for procurement."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

ICS_DATE_FMT = "%Y%m%dT%H%M%SZ"
UID_NS = "bidradar-deadline"


@dataclass(frozen=True)
class VerifiedDate:
    """A verified closing date with explicit timezone and source."""

    iso: str
    timezone: str
    verified: bool
    source_hash: str


@dataclass(frozen=True)
class TaskSuggestion:
    """A task proposed only from verified dates/deliverables."""

    id: str
    title: str
    due_at: datetime
    source_hash: str
    approved: bool = False


def normalize_deadline(iso: str, tz: str) -> datetime:
    """Parse an ISO deadline and normalize to UTC, requiring aware zone."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid deadline iso") from exc
    if dt.tzinfo is None:
        try:
            zone = ZoneInfo(tz)
        except Exception as exc:
            raise ValueError("invalid timezone") from exc
        dt = dt.replace(tzinfo=zone)
    return dt.astimezone(UTC)


def changed_deadline(old: dict, new: dict) -> bool:
    """Return True when closesAt or timezone materially changed."""
    return old.get("closesAt") != new.get("closesAt") or old.get("timezone") != new.get(
        "timezone"
    )


def build_ics(events: list[dict], calendar_name: str = "BidRadar Deadlines") -> str:
    """Generate an .ics calendar from verified events with UTC stamps."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BidRadar//Deadlines//EN",
        f"X-WR-CALNAME:{calendar_name}",
    ]
    for ev in events:
        uid = hashlib.sha256(f"{ev['id']}{ev['closesAt']}".encode()).hexdigest()[:16]
        try:
            dt = datetime.fromisoformat(ev["closesAt"].replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            dt_utc = dt.astimezone(UTC)
        except Exception as exc:
            raise ValueError("invalid event closesAt") from exc
        dtstamp = datetime.now(UTC).strftime(ICS_DATE_FMT)
        dtstart = dt_utc.strftime(ICS_DATE_FMT)
        dtend = (dt_utc + timedelta(hours=1)).strftime(ICS_DATE_FMT)
        safe_title = re.sub(r"[\r\n,;]", " ", ev.get("title", "Deadline"))
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}@{UID_NS}",
                f"DTSTAMP:{dtstamp}",
                f"DTSTART:{dtstart}",
                f"DTEND:{dtend}",
                f"SUMMARY:{safe_title}",
                f"DESCRIPTION:Opportunity {ev['id']} closes {ev['closesAt']}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def suggest_tasks(
    dates: list[VerifiedDate], deliverables: list[dict]
) -> list[TaskSuggestion]:
    """Propose tasks only from verified dates/deliverables; unapproved."""
    tasks: list[TaskSuggestion] = []
    for d in dates:
        if not d.verified:
            continue
        due = normalize_deadline(d.iso, d.timezone)
        tid = hashlib.sha256(f"{d.source_hash}{d.iso}".encode()).hexdigest()[:12]
        tasks.append(
            TaskSuggestion(
                id=tid, title=f"Prepare submission before {d.iso}", due_at=due, source_hash=d.source_hash
            )
        )
    for item in deliverables:
        if not item.get("verified"):
            continue
        due = normalize_deadline(item["dueAt"], item.get("timezone", "Asia/Kolkata"))
        tid = hashlib.sha256(f"{item['hash']}{item['title']}".encode()).hexdigest()[:12]
        tasks.append(
            TaskSuggestion(
                id=tid, title=item["title"], due_at=due, source_hash=item["hash"]
            )
        )
    return tasks


def approve_task(suggestion: TaskSuggestion, approved_by: str) -> TaskSuggestion:
    """Require explicit human approval before a task becomes assigned."""
    if not approved_by:
        raise ValueError("approver required")
    return TaskSuggestion(
        id=suggestion.id,
        title=suggestion.title,
        due_at=suggestion.due_at,
        source_hash=suggestion.source_hash,
        approved=True,
    )


def reminder_offsets(minutes_before: list[int]) -> list[int]:
    """Return sanitized per-user reminder offsets in minutes."""
    clean = [m for m in minutes_before if isinstance(m, int) and 5 <= m <= 7 * 24 * 60]
    return sorted(set(clean))


def deadline_display(iso: str, tz: str) -> str:
    """Format a deadline for display with explicit timezone."""
    dt = normalize_deadline(iso, tz)
    try:
        local = dt.astimezone(ZoneInfo(tz))
        return f"{local.isoformat()} ({tz}) / {dt.isoformat()} UTC"
    except Exception:
        return f"{dt.isoformat()} UTC"
