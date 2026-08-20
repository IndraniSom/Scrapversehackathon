/**
 * Header auth states for BidRadar.
 *
 * Shows signed-out sign-in link, signed-in user button, and refresh status.
 */
"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthHeader() {
  const hasKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!hasKey) {
    return <p>Procurement evidence review — offline demo</p>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <p>Procurement evidence review</p>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="primary-action">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link href="/dashboard" className="text-link">
          Dashboard
        </Link>
        <UserButton />
      </SignedIn>
    </div>
  );
}
