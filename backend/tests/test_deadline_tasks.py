"""Tests for deadline handling, .ics export, and task planning."""

from datetime import UTC

from backend.deadline_tasks import (
    VerifiedDate,
    approve_task,
    build_ics,
    changed_deadline,
    deadline_display,
    normalize_deadline,
    reminder_offsets,
    suggest_tasks,
)


def test_duplicate_event_key_not_needed_here_but_deadline_timezone() -> None:
    """Deadline normalization converts Asia/Kolkata to UTC correctly."""
    utc = normalize_deadline("2026-08-30T18:00:00", "Asia/Kolkata")
    assert utc.tzinfo == UTC
    # Kolkata is UTC+5:30, so 18:00 IST = 12:30 UTC
    assert utc.hour == 12 and utc.minute == 30


def test_deadline_with_explicit_offset_preserves_utc() -> None:
    """An explicit Z offset is respected regardless of timezone param."""
    utc = normalize_deadline("2026-08-30T12:30:00Z", "Asia/Kolkata")
    assert utc.isoformat() == "2026-08-30T12:30:00+00:00"


def test_changed_deadline_detects_time_and_tz() -> None:
    """Changed deadline comparison flags time or tz changes."""
    old = {"closesAt": "2026-08-30T18:00:00", "timezone": "Asia/Kolkata"}
    same = {"closesAt": "2026-08-30T18:00:00", "timezone": "Asia/Kolkata"}
    shifted = {"closesAt": "2026-08-31T18:00:00", "timezone": "Asia/Kolkata"}
    tz_changed = {"closesAt": "2026-08-30T18:00:00", "timezone": "UTC"}
    assert changed_deadline(old, same) is False
    assert changed_deadline(old, shifted) is True
    assert changed_deadline(old, tz_changed) is True


def test_ics_export_contains_required_fields() -> None:
    """ICS output includes VCALENDAR, VEVENT, UID, and UTC stamps."""
    events = [
        {"id": "opp_1", "title": "ODISHA tender", "closesAt": "2026-08-30T18:00:00+05:30"},
        {"id": "opp_2", "title": "NTPC closing", "closesAt": "2026-09-01T10:00:00Z"},
    ]
    ics = build_ics(events, "Test")
    assert "BEGIN:VCALENDAR" in ics
    assert "END:VCALENDAR" in ics
    assert ics.count("BEGIN:VEVENT") == 2
    assert "UID:" in ics
    assert "DTSTART:" in ics
    assert "SUMMARY:ODISHA tender" in ics
    assert "X-WR-CALNAME:Test" in ics


def test_task_suggestions_require_verified_and_approval() -> None:
    """Only verified dates create tasks and they require explicit approval."""
    dates = [
        VerifiedDate(iso="2026-08-30T18:00:00", timezone="Asia/Kolkata", verified=True, source_hash="abc123"),
        VerifiedDate(iso="2026-08-30T18:00:00", timezone="Asia/Kolkata", verified=False, source_hash="bad"),
    ]
    deliverables = [
        {"title": "EMD submission", "dueAt": "2026-08-29T17:00:00", "timezone": "Asia/Kolkata", "verified": True, "hash": "h1"},
        {"title": "Unverified doc", "dueAt": "2026-08-29T17:00:00", "verified": False, "hash": "h2"},
    ]
    tasks = suggest_tasks(dates, deliverables)
    assert len(tasks) == 2  # one verified date + one verified deliverable
    assert all(not t.approved for t in tasks)
    approved = approve_task(tasks[0], "user_1")
    assert approved.approved is True
    assert approved.id == tasks[0].id


def test_reminder_offsets_sanitized() -> None:
    """Reminder offsets filter invalid and deduplicate."""
    assert reminder_offsets([60, 1440, 60, 2, 100000]) == [60, 1440]
    assert reminder_offsets([5, 10080, 30]) == [5, 30, 10080]


def test_deadline_display_includes_both_zones() -> None:
    """Display helper shows local and UTC."""
    text = deadline_display("2026-08-30T18:00:00", "Asia/Kolkata")
    assert "Asia/Kolkata" in text
    assert "UTC" in text
