/**
 * Run one prevalidated, bounded NTPC listing input without forms or pagination.
 * The preparation CLI enforces human approval before it triggers this draft collector.
 */
function collectApprovedListing() {
  const target = new URL(input.url);
  const isApprovedListing =
    target.protocol === "https:" &&
    target.hostname === "ntpctender.ntpc.co.in" &&
    target.pathname === "/Index/Search" &&
    target.searchParams.get("Type") === "Reg" &&
    /^\d+$/.test(target.searchParams.get("Region") ?? "");
  if (!isApprovedListing) {
    throw new Error("UNAPPROVED_TARGET");
  }
  navigate(target.href);
  wait("#TenderLists tbody tr");
  const records = parse();
  for (const record of records.slice(0, 3)) {
    collect(record);
  }
}

collectApprovedListing();
