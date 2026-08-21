/** Domain allowlist for detail URL validation. */
const ALLOWED_HOSTS = ["ntpctender.ntpc.co.in", "www.eprocure.gov.in"];
/** Collector version stamped on output. */
const COLLECTOR_VERSION = "manual-draft-1";

/** Classify only the narrow IT categories used by the BidRadar demo. */
function classify(title) {
  const value = title.toLowerCase();
  if (value.includes("cyber") || value.includes("security")) return "CYBERSECURITY";
  if (value.includes("network")) return "NETWORKING";
  if (value.includes("erp")) return "ERP";
  if (value.includes("cloud")) return "CLOUD";
  if (value.includes("data center")) return "DATA_CENTER";
  if (value.includes("software")) return "SOFTWARE";
  return "OTHER";
}

/** Resolve a detail URL for validation before the row becomes provider output. */
function validateDetailUrl(value) {
  let url;
  try {
    url = new URL(value, "https://ntpctender.ntpc.co.in");
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  const supported =
    url.protocol === "https:" &&
    ALLOWED_HOSTS.includes(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    /^\/NITDetails\/NITs\/[1-9]\d*$/.test(url.pathname);
  return supported ? url.href : null;
}

/** Validates record has required fields (malformed record check). */
function isValidRecord(r) {
  return !!(r && r.source_tender_id && r.canonical_url && r.title && r.authority);
}

/** Convert one server-rendered NTPC row to the bounded collector output schema. */
function parseRow(element) {
  const cells = $(element).find("td");
  const reference = cells.eq(1).text_sane();
  const title = cells.eq(3).text_sane();
  const detailPath = cells.eq(6).find("a").attr("href");
  const canonicalUrl = detailPath ? validateDetailUrl(detailPath) : null;
  const stableId = canonicalUrl?.split("/").filter(Boolean).at(-1);
  if (!stableId || !reference || !title || !canonicalUrl) return null;
  const rec = {
    source: "NTPC",
    source_tender_id: stableId,
    reference_number: reference,
    authority: "NTPC Limited",
    title,
    category: classify(title),
    published_at: null,
    closes_at: null,
    canonical_url: canonicalUrl,
    collectorVersion: COLLECTOR_VERSION,
  };
  if (!isValidRecord(rec)) return null;
  return rec;
}

/** Parse all bounded tender rows from the current listing page. */
function parseRows() {
  const rows = $("#TenderLists tbody tr").toArray().map(parseRow).filter(Boolean);
  // rate limit simulation: if too many rows, truncate
  if (rows.length > 3) return rows.slice(0, 3);
  return rows;
}

if (typeof module !== "undefined") module.exports = {validateDetailUrl, isValidRecord, parseRow};
else return parseRows();
