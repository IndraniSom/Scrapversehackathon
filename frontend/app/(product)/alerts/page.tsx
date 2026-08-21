/** Persistent alerts, delivery preferences, and verified-deadline calendar. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { NotificationCenter, type AlertItem } from "../../../components/app-shell/notification-center";
import { api } from "../../../convex/_generated/api";

type Preferences = { quietStartHour: number; quietEndHour: number; timezone: string; digestCadence: "instant" | "daily" | "weekly"; channels: Array<"in_app" | "email" | "digest"> };

/** Extracts bounded user-facing text from a stored notification payload. */
function eventMessage(event: { type: string; sourceEntityId: string; payload?: string }): string {
  if (event.payload) {
    try {
      const value: unknown = JSON.parse(event.payload);
      if (value && typeof value === "object") {
        for (const key of ["message", "narrative", "title"] as const) {
          const text = (value as Record<string, unknown>)[key];
          if (typeof text === "string" && text.trim()) return text.slice(0, 500);
        }
      }
    } catch (error) {
      void error;
    }
  }
  return `${event.type.replaceAll("_", " ")} update for ${event.sourceEntityId}`;
}

/** Builds an RFC 5545 calendar from persisted tender deadlines. */
function buildIcs(events: Array<{ id: string; title: string; closesAt: number }>): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BidRadar//Deadlines//EN", "X-WR-CALNAME:BidRadar Deadlines"];
  for (const event of events) {
    const start = new Date(event.closesAt).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const title = event.title.replace(/[\r\n,;]/g, " ");
    lines.push("BEGIN:VEVENT", `UID:${event.id}-${event.closesAt}@bidradar`, `DTSTAMP:${timestamp}`, `DTSTART:${start}`, `SUMMARY:${title}`, `DESCRIPTION:Verified tender deadline`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** Renders editable notification preferences and persists changes. */
function PreferencesForm({ initial }: { initial: Preferences }) {
  const save = useMutation(api.notifications.updatePreferences);
  const [value, setValue] = useState(initial);
  const [notice, setNotice] = useState("");
  /** Persists current bounded preference fields. */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save(value);
    setNotice("Notification preferences saved.");
  }
  return (
    <form onSubmit={submit} aria-label="Notification preferences" className="filter-rail">
      <h2>Preferences</h2>
      <label>Timezone<input value={value.timezone} onChange={(event) => setValue({ ...value, timezone: event.target.value })} required /></label>
      <label>Quiet hours start<input type="number" min={0} max={23} value={value.quietStartHour} onChange={(event) => setValue({ ...value, quietStartHour: Number(event.target.value) })} /></label>
      <label>Quiet hours end<input type="number" min={0} max={23} value={value.quietEndHour} onChange={(event) => setValue({ ...value, quietEndHour: Number(event.target.value) })} /></label>
      <label>Digest cadence<select value={value.digestCadence} onChange={(event) => setValue({ ...value, digestCadence: event.target.value as Preferences["digestCadence"] })}><option value="instant">Instant</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      <button type="submit" className="primary-action">Save preferences</button>
      {notice ? <p role="status">{notice}</p> : null}
    </form>
  );
}

/** Loads tenant alerts, preferences, and deadlines from Convex. */
export default function AlertsPage() {
  const events = useQuery(api.notifications.listEvents, { limit: 50 });
  const preferences = useQuery(api.notifications.getPreferences, {});
  const opportunities = useQuery(api.opportunities.listOpportunities, {});
  const alerts = useMemo<AlertItem[]>(() => (events ?? []).map((event) => ({ id: String(event._id), type: event.type, urgency: event.urgency, message: eventMessage(event), createdAt: event.createdAt })), [events]);
  const deadlines = useMemo(() => (opportunities ?? []).filter((item) => item.closesAt !== undefined).map((item) => ({ id: String(item._id), title: item.title, closesAt: item.closesAt as number })), [opportunities]);
  const calendarHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(deadlines))}`;
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><p className="source-line">Notifications and deadlines</p><h1>Alerts</h1><p>Saved-search matches, documents, amendments, deadlines, assignments, and delivery status.</p></header>
      {preferences === undefined ? <p role="status">Loading notification preferences…</p> : <PreferencesForm initial={preferences} />}
      {events === undefined ? <p role="status">Loading alerts…</p> : <NotificationCenter alerts={alerts} digestEnabled={preferences?.digestCadence !== "instant"} />}
      <section className="mt-8"><h2>Calendar export</h2><p>{deadlines.length} verified deadlines available.</p><a href={calendarHref} download="bidradar-deadlines.ics" className="btn-primary min-h-[44px] inline-flex mt-2">Download .ics</a></section>
    </main>
  );
}
