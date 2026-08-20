export const dynamic = "force-dynamic";

import Client from "./page-client";

/** Wraps new-company client page for dynamic rendering. */
export default function PageWrapper() {
  return <Client />;
}
