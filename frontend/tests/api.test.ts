import { describe, expect, test, vi } from "vitest";

import {
  ApiFailure,
  getAmendmentImpact,
  getAssessment,
  getOpportunities,
  getSourceProof,
} from "../lib/api";
import { amendmentImpactEnvelopeSchema } from "../schemas/assessment";
import { sourceProofEnvelopeSchema } from "../schemas/envelopes";
import { assessmentEnvelopeSchema } from "../schemas/assessment";
import { opportunityListEnvelopeSchema } from "../schemas/opportunities";
import { arrayProperty, cloneFixture, jsonResponse, objectProperty, objectValue, readFixture } from "./fixtures";

vi.mock("next/dist/compiled/server-only", () => ({}));

const opportunities = readFixture("opportunities.manual.json");
const assessment = readFixture("assessment.manual.json");
const amendment = readFixture("amendment-impact.manual.json");
const sourceProof = readFixture("source-proof.manual.json");

/** Returns a fetch double that preserves complete frozen response structures. */
function respondingWith(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => jsonResponse(body, status));
}

describe("frozen response schemas", () => {
  test("parse all four manual fixtures", () => {
    expect(opportunityListEnvelopeSchema.parse(opportunities).data.total).toBe(6);
    expect(assessmentEnvelopeSchema.parse(assessment).data.base_assessment.recommendation).toBe("NO_BID");
    expect(amendmentImpactEnvelopeSchema.parse(amendment).data.amended_recommendation).toBe("BID");
    expect(sourceProofEnvelopeSchema.parse(sourceProof).data.status).toBe("UNAVAILABLE");

  });
});

describe("typed API boundary", () => {
  test("returns validated values from all four endpoints", async () => {
    await expect(getOpportunities({ fetcher: respondingWith(opportunities) })).resolves.toMatchObject({ data: { total: 6 } });
    await expect(getSourceProof({ fetcher: respondingWith(sourceProof) })).resolves.toMatchObject({ data: { status: "UNAVAILABLE" } });
    await expect(getAssessment("wb-hci-063", { fetcher: respondingWith(assessment) })).resolves.toMatchObject({ data: { opportunity: { id: "wb-hci-063" } } });
    await expect(getAmendmentImpact("wb-hci-063", { fetcher: respondingWith(amendment) })).resolves.toMatchObject({ data: { authority_change_applied: true } });
  });

  test("accepts a truthful empty opportunity list", async () => {
    const empty = cloneFixture(opportunities);
    const data = objectProperty(empty, "data");
    data.items = [];
    data.total = 0;
    await expect(getOpportunities({ fetcher: respondingWith(empty) })).resolves.toMatchObject({ data: { items: [], total: 0 } });
  });

  test("does not impose item-count equality absent from the frozen contract", async () => {
    const partial = cloneFixture(opportunities);
    const data = objectProperty(partial, "data");
    data.items = arrayProperty(data, "items").slice(0, 5);
    await expect(getOpportunities({ fetcher: respondingWith(partial) })).resolves.toMatchObject({ data: { total: 6 } });
  });

  test.each([
    ["missing field", (() => { const value = cloneFixture(opportunities); delete objectValue(arrayProperty(objectProperty(value, "data"), "items")[0]).authority; return value; })()],
    ["extra field", (() => { const value = cloneFixture(opportunities); objectValue(value).invented = true; return value; })()],
    ["unknown enum", (() => { const value = cloneFixture(opportunities); objectValue(arrayProperty(objectProperty(value, "data"), "items")[0]).source = "UNKNOWN_PORTAL"; return value; })()],
  ])("classifies a %s as a schema failure", async (_name, body) => {
    await expect(getOpportunities({ fetcher: respondingWith(body) })).rejects.toMatchObject({ kind: "schema" });
  });

  test("classifies invalid JSON as a schema failure", async () => {
    const fetcher: typeof fetch = vi.fn(async () => new Response("{not-json", { status: 200 }));
    await expect(getOpportunities({ fetcher })).rejects.toMatchObject({ kind: "schema" });
  });

  test("classifies 404 separately from other non-2xx responses", async () => {
    await expect(getAssessment("missing", { fetcher: respondingWith({}, 404) })).rejects.toMatchObject({ kind: "not-found", status: 404 });
    await expect(getOpportunities({ fetcher: respondingWith({}, 503) })).rejects.toMatchObject({ kind: "transport", status: 503 });
  });

  test("classifies network and timeout failures without leaking causes", async () => {
    const offline: typeof fetch = vi.fn(async () => { throw new Error("private upstream detail"); });
    const hanging: typeof fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    await expect(getOpportunities({ fetcher: offline })).rejects.toEqual(expect.any(ApiFailure));
    await expect(getOpportunities({ fetcher: hanging, timeoutMs: 1 })).rejects.toMatchObject({ kind: "transport" });
  });
});
