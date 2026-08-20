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
    const parsedOpportunities = opportunityListEnvelopeSchema.parse(opportunities);
    expect(parsedOpportunities.data.total).toBe(7);
    expect(parsedOpportunities.data.items.map((item) => item.source)).toEqual([
      "CPPP", "CPPP", "WEST_BENGAL", "WEST_BENGAL", "NTPC", "NTPC", "ODISHA",
    ]);
    expect(assessmentEnvelopeSchema.parse(assessment).data.base_assessment.recommendation).toBe("NO_BID");
    expect(amendmentImpactEnvelopeSchema.parse(amendment).data.amended_recommendation).toBe("REVIEW");
    expect(sourceProofEnvelopeSchema.parse(sourceProof).data.status).toBe("UNAVAILABLE");

  });
});

describe("typed API boundary", () => {
  test("returns validated values from all four endpoints", async () => {
    await expect(getOpportunities({ fetcher: respondingWith(opportunities) })).resolves.toMatchObject({ data: { total: 7 } });
    await expect(getSourceProof({ fetcher: respondingWith(sourceProof) })).resolves.toMatchObject({ data: { status: "UNAVAILABLE" } });
    await expect(getAssessment("ocac-pond-monitoring-26001", { fetcher: respondingWith(assessment) })).resolves.toMatchObject({ data: { opportunity: { id: "ocac-pond-monitoring-26001" } } });
    await expect(getAmendmentImpact("ocac-pond-monitoring-26001", { fetcher: respondingWith(amendment) })).resolves.toMatchObject({ data: { amended_recommendation: "REVIEW", authority_change_applied: true } });
  });

  test.each([".", ".."])("rejects literal dot segment %s in opportunity summary responses", async (opportunityId) => {
    const invalid = cloneFixture(opportunities);
    objectValue(arrayProperty(objectProperty(invalid, "data"), "items")[0]).id = opportunityId;
    await expect(getOpportunities({ fetcher: respondingWith(invalid) })).rejects.toMatchObject({ kind: "schema" });
  });

  test.each([".", ".."])("rejects literal dot segment %s in amendment impact responses", async (opportunityId) => {
    const invalid = cloneFixture(amendment);
    objectProperty(invalid, "data").opportunity_id = opportunityId;
    await expect(getAmendmentImpact("wb-hci-063", { fetcher: respondingWith(invalid) })).rejects.toMatchObject({ kind: "schema" });
  });

  test.each([".", ".."])("rejects literal dot segment %s before dynamic API requests", async (opportunityId) => {
    await expect(getAssessment(opportunityId, { fetcher: respondingWith(assessment) })).rejects.toMatchObject({ kind: "schema" });
    await expect(getAmendmentImpact(opportunityId, { fetcher: respondingWith(amendment) })).rejects.toMatchObject({ kind: "schema" });
  });

  test.each([
    ["BID", "REVIEW"], ["BID", "NO_BID"], ["REVIEW", "BID"],
    ["REVIEW", "NO_BID"], ["NO_BID", "BID"], ["NO_BID", "REVIEW"],
  ])("rejects an unequal %s to %s recommendation when authority change is not applied", async (base, amended) => {
    const invalid = cloneFixture(amendment);
    const data = objectProperty(invalid, "data");
    data.base_recommendation = base;
    data.amended_recommendation = amended;
    data.authority_change_applied = false;
    await expect(getAmendmentImpact("wb-hci-063", { fetcher: respondingWith(invalid) })).rejects.toMatchObject({ kind: "schema" });
  });

  test("rejects duplicate turnover financial years required uniquely by OpenAPI", async () => {
    const invalid = cloneFixture(assessment);
    const base = objectProperty(objectProperty(invalid, "data"), "base_assessment");
    const requirements = objectProperty(base, "requirements");
    const turnover = objectValue(arrayProperty(requirements, "children")[0]);
    objectProperty(turnover, "predicate").required_financial_years = ["2025-26", "2025-26"];
    await expect(getAssessment("wb-hci-063", { fetcher: respondingWith(invalid) })).rejects.toMatchObject({ kind: "schema" });
  });

  test("accepts a truthful empty opportunity list", async () => {
    const empty = cloneFixture(opportunities);
    const data = objectProperty(empty, "data");
    data.items = [];
    data.total = 0;
    await expect(getOpportunities({ fetcher: respondingWith(empty) })).resolves.toMatchObject({ data: { items: [], total: 0 } });
  });

  test.each([6, 8])("rejects declared total %s when seven items are returned", async (declaredTotal) => {
    const inconsistent = cloneFixture(opportunities);
    objectProperty(inconsistent, "data").total = declaredTotal;
    await expect(getOpportunities({ fetcher: respondingWith(inconsistent) })).rejects.toMatchObject({ kind: "schema" });
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

  test("keeps the timeout active while consuming a post-header response body", async () => {
    const fetcher: typeof fetch = vi.fn(async (_input, init) => new Response(new ReadableStream<Uint8Array>({
      /** Emits incomplete JSON and fails only when the request signal aborts. */
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"request_id":'));
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      },
    }), { status: 200 }));
    await expect(getOpportunities({ fetcher, timeoutMs: 5 })).rejects.toMatchObject({ kind: "transport" });
  }, 250);
});
