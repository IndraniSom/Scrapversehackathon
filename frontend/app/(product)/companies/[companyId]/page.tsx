export const dynamic = "force-dynamic";

import Client from "./page-client";

/** Wraps client company detail page for dynamic rendering. */
export default function PageWrapper(props: { params: Promise<{ companyId: string }> }) {
  return <Client {...props} />;
}
