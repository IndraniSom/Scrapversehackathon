/**
 * Clerk and Convex providers with explicit auth states.
 *
 * Wraps ClerkProvider and ConvexProviderWithClerk, handling
 * auth-loading, auth-refresh, and local stub without keys.
 */
"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
const convexClient = new ConvexReactClient(convexUrl);

/** Inner provider that binds Convex to Clerk auth. */
function ConvexWithClerk({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
      <AuthGate>{children}</AuthGate>
    </ConvexProviderWithClerk>
  );
}

/** Shows auth loading and refresh states explicitly. */
function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth();
  if (!isLoaded) {
    return (
      <div aria-live="polite" aria-busy="true" role="status">
        Loading authentication…
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Provides Convex binding for the app.
 * Expects outer ClerkProvider from layout. Falls back when keys absent.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const hasKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!hasKey) return <>{children}</>;
  return <ConvexWithClerk>{children}</ConvexWithClerk>;
}
