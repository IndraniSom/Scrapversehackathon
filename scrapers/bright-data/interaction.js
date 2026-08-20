/**
 * Run one explicitly approved, bounded NTPC listing input without forms or pagination.
 * The human review decision is required in every input so a draft cannot run by accident.
 */
function collectApprovedListing() {
  if (input.legal_decision !== "ALLOW") {
    throw new Error("LEGAL_VERIFY_REQUIRED");
  }
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
