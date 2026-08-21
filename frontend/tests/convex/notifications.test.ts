import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { buildDeduplicationKey, groupIntoDigest, isQuietHour, shouldDeliver, shouldRetry } from "../../convex/notifications";
import { buildIdempotencyKey, escapeHtml } from "../../convex/email";
import { NotificationCenter } from "../../components/app-shell/notification-center";

describe("notifications dedup and preferences", () => {
  test("duplicate event shares same deduplication key", () => {
    const k1 = buildDeduplicationKey("org_1", "deadline", "opp_1");
    const k2 = buildDeduplicationKey("org_1", "deadline", "opp_1");
    const k3 = buildDeduplicationKey("org_1", "amendment", "opp_1");
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).toBe("org_1:deadline:opp_1");
  });
  test("channel preference filters correctly and disabled blocks all", () => {
    expect(shouldDeliver("email", ["in_app"], false)).toBe(false);
    expect(shouldDeliver("in_app", ["in_app", "email"], false)).toBe(true);
    expect(shouldDeliver("digest", null, false)).toBe(true);
    expect(shouldDeliver("email", ["email"], true)).toBe(false);
    expect(shouldDeliver("in_app", [], false)).toBe(false);
  });
  test("quiet hours respects wrap and UTC hour", () => {
    const base = Date.UTC(2026, 7, 20, 23, 0, 0);
    expect(isQuietHour(base, { startHour: 22, endHour: 7 })).toBe(true);
    expect(isQuietHour(Date.UTC(2026, 7, 20, 10, 0, 0), { startHour: 22, endHour: 7 })).toBe(false);
    expect(isQuietHour(Date.UTC(2026, 7, 20, 15, 0, 0), { startHour: 9, endHour: 17 })).toBe(true);
    expect(isQuietHour(base, null)).toBe(false);
  });
  test("digest groups by day and type", () => {
    const e = [
      { type: "deadline" as const, createdAt: Date.UTC(2026, 7, 20, 10) },
      { type: "deadline" as const, createdAt: Date.UTC(2026, 7, 20, 12) },
      { type: "amendment" as const, createdAt: Date.UTC(2026, 7, 20, 11) },
      { type: "deadline" as const, createdAt: Date.UTC(2026, 7, 21, 10) },
    ];
    const g = groupIntoDigest(e);
    expect(g.size).toBe(3);
    expect(g.get("2026-08-20:deadline")?.length).toBe(2);
  });
  test("retry allowed only for failed under attempts limit", () => {
    expect(shouldRetry(0, "failed")).toBe(true);
    expect(shouldRetry(2, "failed")).toBe(true);
    expect(shouldRetry(3, "failed")).toBe(false);
    expect(shouldRetry(0, "delivered")).toBe(false);
    expect(shouldRetry(1, "pending")).toBe(false);
  });
  test("Resend idempotency key stable per org+event+recipient", () => {
    const k1 = buildIdempotencyKey("org_1", "evt_1", "user_1");
    const k2 = buildIdempotencyKey("org_1", "evt_1", "user_1");
    const k3 = buildIdempotencyKey("org_1", "evt_2", "user_1");
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).toBe("org_1:evt_1:user_1");
  });
  test("email HTML escapes untrusted notification payload", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  test("role=status announcements render and digest toggle exists", () => {
    const alerts = [{ id: "1", type: "deadline", urgency: "high" as const, message: "closes tomorrow", createdAt: Date.now() }];
    render(React.createElement(NotificationCenter, { alerts }));
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Notification center")).toBeInTheDocument();
    expect(screen.getByText("Digest view")).toBeInTheDocument();
  });
});
