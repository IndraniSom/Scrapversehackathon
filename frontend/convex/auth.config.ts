/** Clerk JWT configuration with an isolated E2E exception. */
import type { AuthConfig } from "convex/server";

const isE2eMode = process.env.BIDRADAR_E2E_MODE === "1";
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!isE2eMode && !issuerDomain) throw new Error("CLERK_JWT_ISSUER_DOMAIN is required.");

/** Configures Clerk only when a production issuer is available. */
const authConfig: AuthConfig = { providers: issuerDomain ? [{ domain: issuerDomain, applicationID: "convex" }] : [] };

export default authConfig;
