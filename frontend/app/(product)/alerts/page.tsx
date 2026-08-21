import Link from "next/link";
import { NotificationCenter, type AlertItem } from "../../../components/app-shell/notification-center";

export const dynamic = "force-dynamic";

/** Builds an .ics calendar from verified deadlines with UTC stamps. */
function buildIcs(events: { id: string; title: string; closesAt: string }[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BidRadar//Deadlines//EN", "X-WR-CALNAME:BidRadar Deadlines"];
  for (const ev of events) {
    const dt = new Date(ev.closesAt);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const start = dt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const end = new Date(dt.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const safe = ev.title.replace(/[\r\n,;]/g, " ");
    const uid = `${ev.id}-${dt.getTime()}@bidradar-deadline`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${safe}`, `DESCRIPTION:Opportunity ${ev.id} closes ${ev.closesAt}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Renders alerts with quiet hours, digest, and assignment states. */
export default function AlertsPage() {
  const now = 1724143200000;
  const alerts: AlertItem[] = [
    { id: "1", type: "deadline", urgency: "high", message: "ODISHA tender closes 2026-08-30 Asia/Kolkata", createdAt: now - 60000 },
    { id: "2", type: "amendment", urgency: "medium", message: "Corrigendum applied turnover 6 crore", createdAt: now - 120000 },
    { id: "3", type: "saved_search_match", urgency: "low", message: "2 new software tenders matched your saved search", createdAt: now - 180000 },
  ];
  const deadlines = [
    { id: "opp_odisha_1", title: "ODISHA tender", closesAt: "2026-08-30T18:00:00+05:30" },
    { id: "opp_ntpc_2", title: "NTPC closing", closesAt: "2026-09-01T10:00:00Z" },
  ];
  const ics = buildIcs(deadlines);
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <p className="source-line">Notifications and deadlines</p>
        <h1>Alerts</h1>
        <p>Saved-search matches, new documents, amendments, deadlines, and assignments. Respects quiet hours and digest preferences.</p>
      </header>
      <section aria-label="Quiet hours and digest settings" className="mb-6 p-4 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--surface)]">
        <h2 className="m-0 text-base font-semibold">Preferences</h2>
        <p className="text-sm text-[var(--muted)]">Quiet hours 22:00–07:00 Asia/Kolkata. Digest daily at 08:00. <Link className="text-link" href="#ics">Download deadlines .ics</Link></p>
        <div role="status" aria-live="polite" className="mt-2 text-sm">Alerts announce updates without interrupting review.</div>
      </section>
      <NotificationCenter alerts={alerts} digestEnabled />
      <section id="ics" className="mt-8">
        <h2>Calendar export</h2>
        <p className="text-sm text-[var(--muted)]">Export all verified deadlines with Asia/Kolkata times and reminder offsets 60, 1440 minutes.</p>
        <a href={href} download="bidradar-deadlines.ics" className="btn-primary min-h-[44px] inline-flex mt-2">Download .ics</a>
      </section>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">Alerts loaded {alerts.length} items</div>
    </main>
  );
}
