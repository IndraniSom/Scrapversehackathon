/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as amendments from "../amendments.js";
import type * as analytics from "../analytics.js";
import type * as assessments from "../assessments.js";
import type * as brightDataWebhook from "../brightDataWebhook.js";
import type * as companies from "../companies.js";
import type * as companyDocuments from "../companyDocuments.js";
import type * as compliance from "../compliance.js";
import type * as contentLibrary from "../contentLibrary.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as exportKeys from "../exportKeys.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as jobs from "../jobs.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_contentLibraryHelpers from "../lib/contentLibraryHelpers.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_keyComparison from "../lib/keyComparison.js";
import type * as lib_observability from "../lib/observability.js";
import type * as notifications from "../notifications.js";
import type * as opportunities from "../opportunities.js";
import type * as opportunitySearch from "../opportunitySearch.js";
import type * as organizations from "../organizations.js";
import type * as proposals from "../proposals.js";
import type * as retention from "../retention.js";
import type * as reviews from "../reviews.js";
import type * as savedSearches from "../savedSearches.js";
import type * as schema_aiOps from "../schema/aiOps.js";
import type * as schema_companies from "../schema/companies.js";
import type * as schema_discovery from "../schema/discovery.js";
import type * as schema_extraction from "../schema/extraction.js";
import type * as schema_identity from "../schema/identity.js";
import type * as schema_jobs from "../schema/jobs.js";
import type * as schema_proposals from "../schema/proposals.js";
import type * as schema_sources from "../schema/sources.js";
import type * as semanticSearch from "../semanticSearch.js";
import type * as sourceProvider from "../sourceProvider.js";
import type * as sourceRuns from "../sourceRuns.js";
import type * as sources from "../sources.js";
import type * as submissions from "../submissions.js";
import type * as tenderIntelligence from "../tenderIntelligence.js";
import type * as users from "../users.js";
import type * as watchlists from "../watchlists.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  amendments: typeof amendments;
  analytics: typeof analytics;
  assessments: typeof assessments;
  brightDataWebhook: typeof brightDataWebhook;
  companies: typeof companies;
  companyDocuments: typeof companyDocuments;
  compliance: typeof compliance;
  contentLibrary: typeof contentLibrary;
  crons: typeof crons;
  documents: typeof documents;
  email: typeof email;
  exportKeys: typeof exportKeys;
  http: typeof http;
  integrations: typeof integrations;
  jobs: typeof jobs;
  "lib/audit": typeof lib_audit;
  "lib/authorization": typeof lib_authorization;
  "lib/contentLibraryHelpers": typeof lib_contentLibraryHelpers;
  "lib/errors": typeof lib_errors;
  "lib/idempotency": typeof lib_idempotency;
  "lib/keyComparison": typeof lib_keyComparison;
  "lib/observability": typeof lib_observability;
  notifications: typeof notifications;
  opportunities: typeof opportunities;
  opportunitySearch: typeof opportunitySearch;
  organizations: typeof organizations;
  proposals: typeof proposals;
  retention: typeof retention;
  reviews: typeof reviews;
  savedSearches: typeof savedSearches;
  "schema/aiOps": typeof schema_aiOps;
  "schema/companies": typeof schema_companies;
  "schema/discovery": typeof schema_discovery;
  "schema/extraction": typeof schema_extraction;
  "schema/identity": typeof schema_identity;
  "schema/jobs": typeof schema_jobs;
  "schema/proposals": typeof schema_proposals;
  "schema/sources": typeof schema_sources;
  semanticSearch: typeof semanticSearch;
  sourceProvider: typeof sourceProvider;
  sourceRuns: typeof sourceRuns;
  sources: typeof sources;
  submissions: typeof submissions;
  tenderIntelligence: typeof tenderIntelligence;
  users: typeof users;
  watchlists: typeof watchlists;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
