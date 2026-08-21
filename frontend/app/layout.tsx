import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ConvexClientProvider } from "../lib/convex-client-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthHeader } from "../components/auth-header";

export const metadata: Metadata = {
  title: "BidRadar · Procurement evidence review",
  description: "Evidence-backed opportunity, eligibility, and amendment review.",
};

/** Provides shared BidRadar identity, auth, and application landmarks. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  const clerkKey = process.env.BIDRADAR_E2E_MODE === "1" ? undefined : process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ConvexClientProvider clerkConfigured={Boolean(clerkKey)}>
          <header className="site-header">
            <Link className="brand" href="/" aria-label="BidRadar opportunity register">
              <span aria-hidden="true">BR</span>
              <strong>BidRadar</strong>
            </Link>
            <AuthHeader configured={Boolean(clerkKey)} />
          </header>
          {children}
          <footer className="site-footer">
            Decision support only. Not legal advice or automated bid submission.
          </footer>
        </ConvexClientProvider>
      </body>
    </html>
  );
  if (clerkKey) {
    return <ClerkProvider publishableKey={clerkKey}>{content}</ClerkProvider>;
  }
  return content;
}
