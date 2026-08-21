/**
 * Header auth states for BidRadar.
 *
 * Shows signed-out sign-in link, signed-in user button, and refresh status.
 */
"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";

/** Renders loaded Clerk session controls inside configured provider. */
function AuthControls() {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status">Loading account…</p>;
  if (userId) return <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><p>Procurement evidence review</p><Link href="/opportunities" className="text-link">Workspace</Link><UserButton /></div>;
  return <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}><p>Procurement evidence review</p><SignInButton mode="modal"><button type="button" className="primary-action">Sign in</button></SignInButton></div>;
}

/** Renders Clerk session controls only when server configuration is present. */
export function AuthHeader({ configured }: { configured: boolean }) {
  if (!configured) {
    return <p>Authentication unavailable</p>;
  }
  return <AuthControls />;
}
