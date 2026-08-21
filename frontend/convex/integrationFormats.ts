/** Deterministic generic export format helpers. */

/** Exports rows to quoted CSV text. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
}

/** Exports data to indented JSON text. */
export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Exports verified events to an RFC 5545 calendar. */
export function toIcs(events: Array<{ title: string; start: string; end?: string; description?: string }>): string {
  const escape = (value: string) => value.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,");
  const format = (value: string) => new Date(value).toISOString().replace(/[-:]/g,"").split(".")[0]+"Z";
  const body = events.map((event,index)=>`BEGIN:VEVENT\nUID:${index}@bidradar\nDTSTAMP:${format(new Date().toISOString())}\nDTSTART:${format(event.start)}\n${event.end?`DTEND:${format(event.end)}\n`:""}SUMMARY:${escape(event.title)}\n${event.description?`DESCRIPTION:${escape(event.description)}\n`:""}END:VEVENT`).join("\n");
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//BidRadar//EN\n${body}\nEND:VCALENDAR`;
}
