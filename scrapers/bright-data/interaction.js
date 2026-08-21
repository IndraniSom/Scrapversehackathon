/**
 * Run one prevalidated, bounded NTPC listing input without forms or pagination.
 * Domain allowlist enforced; disabled connector throws.
 */
const ALLOWLIST = ["ntpctender.ntpc.co.in", "www.eprocure.gov.in", "wbtenders.gov.in"];
const COLLECTOR_VERSION = "manual-draft-1";

/**
 * Validates target against domain allowlist and schedule policy.
 */
function isAllowedTarget(url) {
  try {
    const u = new URL(url);
    return ALLOWLIST.includes(u.hostname) && u.protocol === "https:";
  } catch { return false; }
}

function collectApprovedListing() {
  if (!input || !input.url) throw new Error("MALFORMED_RECORD");
  if (!isAllowedTarget(input.url)) throw new Error("DISABLED_CONNECTOR");
  // collector version check
  if (input.collectorVersion && input.collectorVersion !== COLLECTOR_VERSION) throw new Error("VERSION_MISMATCH");
  const target = new URL(input.url);
  const isApprovedListing =
    target.protocol === "https:" &&
    ALLOWLIST.includes(target.hostname) &&
    (target.pathname === "/Index/Search" || target.pathname === "/epublish/app") &&
    (target.searchParams.get("Type") === "Reg" ? /^\d+$/.test(target.searchParams.get("Region") ?? "") : true);
  if (!isApprovedListing) throw new Error("UNAPPROVED_TARGET");
  navigate(target.href);
  wait("#TenderLists tbody tr");
  const records = parse();
  // malformed record filtering
  const valid = records.filter((r) => r && r.source_tender_id && r.canonical_url);
  for (const record of valid.slice(0, 3)) {
    collect({ ...record, collectorVersion: COLLECTOR_VERSION });
  }
}

collectApprovedListing();
