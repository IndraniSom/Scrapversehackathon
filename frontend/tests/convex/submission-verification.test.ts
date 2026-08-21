/** Clerk step-up claim validation for submission actions. */
import { expect, test } from "vitest";

import { actorFromClaims } from "../../convex/submissionVerification";

test("accepts recent compact Clerk organization claims", () => {
  expect(actorFromClaims({ sub: "user_a", sid: "session_a", fva: [2, -1], o: { id: "org_a", rol: "bid_manager" } })).toEqual({ organizationId: "org_a", userId: "user_a", role: "org:bid_manager" });
});

test("rejects stale, agent, and organization-free sessions", () => {
  expect(() => actorFromClaims({ sub: "user_a", sid: "session_a", fva: [11, -1], o: { id: "org_a", rol: "admin" } })).toThrow();
  expect(() => actorFromClaims({ sub: "ai_worker", sid: "session_a", fva: [0, -1], o: { id: "org_a", rol: "admin" } })).toThrow();
  expect(() => actorFromClaims({ sub: "user_a", sid: "session_a", fva: [0, -1] })).toThrow();
});
