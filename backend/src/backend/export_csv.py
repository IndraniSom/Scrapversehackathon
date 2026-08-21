"""Deterministic compliance CSV with Unicode and bounded fields."""

import csv
import io

from pydantic import BaseModel, ConfigDict

from backend.contracts.source import NonEmpty


class CsvRow(BaseModel):
    """One compliance matrix row."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    requirement_id: NonEmpty
    title: NonEmpty
    status: str
    evidence: str | None = None
    owner: str | None = None


def build_compliance_csv(rows: list[CsvRow] | list[dict]) -> bytes:
    """Render CSV bytes sorted deterministically and handling overflow."""
    parsed = [
        CsvRow.model_validate(r) if isinstance(r, dict) else r for r in rows
    ]
    sorted_rows = sorted(parsed, key=lambda r: r.requirement_id)
    output = io.StringIO(newline="")
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(["requirement_id", "title", "status", "evidence", "owner"])
    for row in sorted_rows:
        # overflow: cap each field at 5000 chars
        def cap(value: str | None) -> str:
            if value is None:
                return ""
            return value[:5000] + (" … truncated" if len(value) > 5000 else "")

        writer.writerow([
            cap(row.requirement_id),
            cap(row.title),
            cap(row.status),
            cap(row.evidence),
            cap(row.owner),
        ])
    # ensure unicode INR preserved
    text = output.getvalue()
    return text.encode("utf-8")
