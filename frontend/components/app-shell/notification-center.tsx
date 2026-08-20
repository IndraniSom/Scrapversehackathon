"use client";
import { useEffect, useState } from "react";

export type AlertItem = {
  id: string;
  type: string;
  urgency: "low" | "medium" | "high";
  message: string;
  createdAt: number;
  digestKey?: string;
};

type Props = {
  alerts: AlertItem[];
  onDismiss?: (id: string) => void;
  digestEnabled?: boolean;
};

/**
 * Notification center with accessible live status announcements.
 * Announces new alerts via role=status and supports digest grouping.
 */
export function NotificationCenter({ alerts, onDismiss, digestEnabled }: Props) {
  const [liveMessage, setLiveMessage] = useState("");
  const [showDigest, setShowDigest] = useState(Boolean(digestEnabled));

  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    const announceTimer = setTimeout(() => setLiveMessage(`${latest.type} alert: ${latest.message}`), 0);
    const clearTimer = setTimeout(() => setLiveMessage(""), 4000);
    return () => {
      clearTimeout(announceTimer);
      clearTimeout(clearTimer);
    };
  }, [alerts]);

  const visible = showDigest ? groupDigest(alerts) : alerts;

  return (
    <section aria-label="Notification center">
      <div className="flex items-center justify-between mb-4">
        <h2 className="m-0 text-lg font-semibold">Alerts</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showDigest} onChange={(e) => setShowDigest(e.target.checked)} className="h-4 w-4" />
          Digest view
        </label>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-[var(--muted)]">
        {alerts.length === 0 ? "No new alerts. You will be notified when saved searches match." : `${alerts.length} notifications, latest ${alerts[0]?.type}`}
      </p>
      <ul className="mt-3 grid gap-2 list-none p-0">
        {visible.length === 0 ? <li className="empty-state">No notifications</li> : null}
        {visible.map((item) => (
          <li key={item.id} className="p-3 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--surface)]">
            <div className="flex justify-between gap-2">
              <strong className="text-sm">{item.type}</strong>
              <span className={`status-badge status-${item.urgency}`}>{item.urgency}</span>
            </div>
            <p className="m-0 mt-1 text-sm">{item.message}</p>
            <time className="text-xs text-[var(--muted)]">{new Date(item.createdAt).toLocaleString()}</time>
            {onDismiss ? (
              <button type="button" onClick={() => onDismiss(item.id)} className="mt-2 btn-ghost min-h-[44px] text-sm">
                Dismiss
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function groupDigest(items: AlertItem[]): AlertItem[] {
  const map = new Map<string, AlertItem>();
  for (const item of items) {
    const day = new Date(item.createdAt).toISOString().slice(0, 10);
    const key = `${day}:${item.type}`;
    if (!map.has(key)) map.set(key, { ...item, id: key, digestKey: key, message: `${item.message} (+${countFor(items, key) - 1} more)` });
  }
  return Array.from(map.values());
}
function countFor(items: AlertItem[], key: string): number {
  const [day, type] = key.split(":");
  return items.filter((i) => new Date(i.createdAt).toISOString().slice(0, 10) === day && i.type === type).length;
}
