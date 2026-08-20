/**
 * Convex schema for BidRadar full platform.
 *
 * Aggregates domain table definitions and declares indexes
 * for search, vector, and tenant-isolated lists.
 */
import { defineSchema } from "convex/server";
import { aiOpsTables } from "./schema/aiOps";
import { companyTables } from "./schema/companies";
import { discoveryTables } from "./schema/discovery";
import { extractionTables } from "./schema/extraction";
import { identityTables } from "./schema/identity";
import { jobTables } from "./schema/jobs";
import { proposalTables } from "./schema/proposals";
import { sourceTables } from "./schema/sources";

/**
 * Platform schema with tenant isolation and indexed access paths.
 */
export default defineSchema({
  ...identityTables,
  ...companyTables,
  ...sourceTables,
  ...extractionTables,
  ...discoveryTables,
  ...proposalTables,
  ...aiOpsTables,
  ...jobTables,
});
