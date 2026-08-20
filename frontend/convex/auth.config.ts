/**
 * Clerk JWT configuration for Convex.
 *
 * Convex validates the Clerk JWT issuer and application ID before
 * accepting any authenticated request. The issuer domain is read
 * from CLERK_JWT_ISSUER_DOMAIN to allow stubbed local development.
 */
import { AuthConfig } from "convex/server";

/**
 * Fallback issuer for local development without real Clerk keys.
 * Allows convex dev at http://127.0.0.1:3210 to run unauthenticated locally.
 */
const issuerDomain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://stubbable.clerk.accounts.dev";

/** Clerk as the Convex JWT provider. */
export default {
  providers: [
    {
      domain: issuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
