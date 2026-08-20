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

/** Convert one server-rendered NTPC row to the bounded collector output schema. */
function parseRow(element) {
  const cells = $(element).find("td");
  const reference = cells.eq(1).text_sane();
  const title = cells.eq(3).text_sane();
  const detailPath = cells.eq(6).find("a").attr("href");
  const stableId = detailPath?.split("/").filter(Boolean).at(-1);
  if (!stableId || !reference || !title || !detailPath) return null;
  return {
    source: "NTPC",
    source_tender_id: stableId,
    reference_number: reference,
    authority: "NTPC Limited",
    title,
    category: classify(title),
    published_at: null,
    closes_at: null,
    canonical_url: new URL(detailPath, "https://ntpctender.ntpc.co.in").href,
  };
}

return $("#TenderLists tbody tr").toArray().map(parseRow).filter(Boolean);
