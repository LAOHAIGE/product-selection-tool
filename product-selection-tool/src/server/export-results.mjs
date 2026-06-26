function csvCell(value) {
  const isList = Array.isArray(value);
  const text = isList ? value.join(" | ") : String(value ?? "");
  return isList || /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function toCsv(items) {
  const headers = ["Reviewed", "Reviewed At", "ASIN", "Title", "Brand", "Category", "Monthly Sales", "Price", "Opportunity Score", "Risk Score", "Product Standard Analysis", "Keyword Score", "SIF Keyword Count", "SIF Total Search Volume", "Top SIF Keywords", "SIF Standard Analysis", "Status", "Pass Reasons", "Rejection Reasons", "Retention Reasons", "Missing Data"];
  const rows = items.map((item) => [
    item.reviewed ? "Yes" : "No",
    item.reviewedAt || "",
    item.asin,
    item.title,
    item.brand,
    item.smallCategory,
    item.monthlySales,
    item.price,
    item.opportunityScore,
    item.riskScore,
    item.selectionAnalysis?.standardPoints?.map((point) => `${point.name}: ${point.value} (${point.conclusion})`),
    item.keywordScore,
    item.sif?.keywordCount,
    item.sif?.totalSearchVolume,
    item.sif?.topKeywords,
    item.sif?.analysis?.standardPoints?.map((point) => `${point.name}: ${point.value} (${point.conclusion})`),
    item.status,
    item.passReasons,
    item.rejectionReasons,
    item.retentionReasons,
    item.missingData
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function toMarkdownReport(summary, items) {
  const sifImportedCount = items.filter((item) => item.sif).length;
  const reviewedCount = items.filter((item) => item.reviewed).length;
  const topItems = [...items]
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
    .slice(0, 20);
  const lines = [
    "# Product Screening Report",
    "",
    `Total products: ${summary.total}`,
    `Strong candidates: ${summary.strongCandidate}`,
    `Observation candidates: ${summary.observationCandidate}`,
    `Manual review: ${summary.manualReview}`,
    `Rejected: ${summary.rejected}`,
    `Insufficient data: ${summary.insufficientData}`,
    `Reviewed ASINs: ${reviewedCount}`,
    "",
    "## Top Candidates",
    "",
    "| Reviewed | ASIN | Status | Opportunity | Risk | Main Reason |",
    "| --- | --- | --- | ---: | ---: | --- |"
  ];
  for (const item of topItems) {
    const reason = item.passReasons[0] || item.retentionReasons[0] || item.rejectionReasons[0] || "No reason recorded";
    lines.push(`| ${item.reviewed ? "Yes" : "No"} | ${item.asin} | ${item.status} | ${item.opportunityScore ?? ""} | ${item.riskScore ?? ""} | ${reason.replace(/\|/g, "/")} |`);
  }
  lines.push("", "## Missing Data Prompts", "");
  if (sifImportedCount > 0) {
    lines.push(`- SIF keyword data imported for ${sifImportedCount} ASIN(s). Continue importing missing SIF rows for unmatched candidates.`);
  } else {
  lines.push("- SIF keyword export is required for organic traffic, non-brand exact keywords, search volume, trend, and CPC.");
  }
  lines.push("- Market analysis export is required for Top 100 volume, concentration, review distribution, and new-product opportunity.");
  lines.push("- Competitor and cost sheets are required for product form, differentiation, and real net margin.");

  const productAnalyzedItems = items.filter((item) => item.selectionAnalysis?.standardPoints?.length);
  if (productAnalyzedItems.length > 0) {
    lines.push("", "## Product Points 1-5 Analysis", "");
    for (const item of productAnalyzedItems.slice(0, 20)) {
      lines.push(`### ${item.asin}`, "");
      for (const point of item.selectionAnalysis.standardPoints) {
        lines.push(`- ${point.point}. ${point.name}: ${point.value} - ${point.conclusion}`);
      }
      lines.push("");
    }
  }

  const analyzedItems = items.filter((item) => item.sif?.analysis?.standardPoints?.length);
  if (analyzedItems.length > 0) {
    lines.push("", "## SIF Points 6-10 Analysis", "");
    for (const item of analyzedItems.slice(0, 20)) {
      lines.push(`### ${item.asin}`, "");
      for (const point of item.sif.analysis.standardPoints) {
        lines.push(`- ${point.point}. ${point.name}: ${point.value} - ${point.conclusion}`);
      }
      if (item.sif.analysis.top10NonBrandExactTrafficKeywords?.length) {
        lines.push(`- Top non-brand exact keywords: ${item.sif.analysis.top10NonBrandExactTrafficKeywords.join(", ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
