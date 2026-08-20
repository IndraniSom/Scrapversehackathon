import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BidRadar · Procurement evidence review",
  description: "Evidence-backed opportunity, eligibility, and amendment review.",
};

/** Provides the shared BidRadar identity, skip link, and application landmarks. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="BidRadar opportunity register"><span aria-hidden="true">BR</span><strong>BidRadar</strong></Link>
          <p>Procurement evidence review</p>
        </header>
        {children}
        <footer className="site-footer">Decision support only. Not legal advice or automated bid submission.</footer>
      </body>
    </html>
  );
}
