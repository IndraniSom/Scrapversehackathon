import "next/dist/compiled/server-only";

import type { ZodType } from "zod";

import { amendmentImpactEnvelopeSchema, assessmentEnvelopeSchema, type AmendmentImpactEnvelope, type AssessmentEnvelope } from "../schemas/assessment";
import { sourceProofEnvelopeSchema, type SourceProofEnvelope } from "../schemas/envelopes";
import { opportunityListEnvelopeSchema, type OpportunityListEnvelope } from "../schemas/opportunities";

export type ApiFailureKind = "transport" | "schema" | "not-found";
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  fetcher?: Fetcher;
  timeoutMs?: number;
}

/** Represents a safe, typed failure at the backend boundary. */
export class ApiFailure extends Error {
  readonly kind: ApiFailureKind;
  readonly status?: number;

  constructor(kind: ApiFailureKind, status?: number) {
    super(kind === "schema" ? "Backend response failed validation" : "Backend request failed");
    this.name = "ApiFailure";
    this.kind = kind;
    this.status = status;
  }
}

const apiBaseUrl = process.env.BIDRADAR_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

/** Fetches one endpoint and rejects every unvalidated or unsuccessful response. */
async function request<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(`${apiBaseUrl}${path}`, { cache: "no-store", signal: controller.signal });
  } catch {
    throw new ApiFailure("transport");
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 404) throw new ApiFailure("not-found", 404);
  if (!response.ok) throw new ApiFailure("transport", response.status);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiFailure("schema", response.status);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiFailure("schema", response.status);
  return parsed.data;
}

/** Returns the validated opportunity list from the runtime backend. */
export function getOpportunities(options?: RequestOptions): Promise<OpportunityListEnvelope> {
  return request("/api/v1/opportunities", opportunityListEnvelopeSchema, options);
}

/** Returns validated source-proof provenance from the runtime backend. */
export function getSourceProof(options?: RequestOptions): Promise<SourceProofEnvelope> {
  return request("/api/v1/source-proof", sourceProofEnvelopeSchema, options);
}

/** Returns a validated opportunity assessment by its wire identifier. */
export function getAssessment(opportunityId: string, options?: RequestOptions): Promise<AssessmentEnvelope> {
  return request(`/api/v1/opportunities/${encodeURIComponent(opportunityId)}`, assessmentEnvelopeSchema, options);
}

/** Returns validated amendment impact by its wire opportunity identifier. */
export function getAmendmentImpact(opportunityId: string, options?: RequestOptions): Promise<AmendmentImpactEnvelope> {
  return request(`/api/v1/opportunities/${encodeURIComponent(opportunityId)}/amendment-impact`, amendmentImpactEnvelopeSchema, options);
}
