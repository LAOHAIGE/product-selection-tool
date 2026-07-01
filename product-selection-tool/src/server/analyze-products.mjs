const CORE_FIELDS = ["monthlySales", "price", "rating", "reviewCount", "fbaFee", "grossMargin", "listingAgeDays", "sellerCount"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scorePositive(value, floor, strong) {
  if (value === null || value === undefined) return 0;
  return clamp(((value - floor) / (strong - floor)) * 100, 0, 100);
}

function scoreInverse(value, best, worst) {
  if (value === null || value === undefined) return 0;
  return clamp(((worst - value) / (worst - best)) * 100, 0, 100);
}

function standardPoint(point, name, value, passed, conclusion) {
  return { point, name, value, status: passed ? "strong" : "weak", conclusion };
}

function missingCoreFields(product) {
  return CORE_FIELDS.filter((field) => product[field] === null || product[field] === undefined || product[field] === "");
}

function classify(product, scores, hardRejections, retentionReasons, rules) {
  if (missingCoreFields(product).length > 0) return "insufficient_data";
  if (retentionReasons.length > 0) return "manual_review";
  if (hardRejections.length > 0 && retentionReasons.length > 0) return "manual_review";
  if (hardRejections.length > 0) return "rejected";
  if (scores.opportunityScore >= rules.strongOpportunityScore && scores.riskScore < rules.highRiskScore) return "strong_candidate";
  if (scores.opportunityScore >= rules.observationOpportunityScore) return "observation_candidate";
  return "manual_review";
}

function analyzeOne(product, rules) {
  const passReasons = [];
  const rejectionReasons = [];
  const retentionReasons = [];
  const missingData = missingCoreFields(product).map((field) => `Missing required product field: ${field}`);

  if (product.monthlySales >= rules.minMonthlySales) passReasons.push(`Strong monthly sales: ${product.monthlySales}`);
  else if (product.monthlySales !== null && product.monthlySales !== undefined) rejectionReasons.push(`Monthly sales below floor: ${product.monthlySales} < ${rules.minMonthlySales}`);

  if (product.salesGrowthRate > rules.minSalesGrowthRate) passReasons.push(`Sales growth is positive: ${(product.salesGrowthRate * 100).toFixed(1)}%`);
  else if (product.salesGrowthRate !== null && product.salesGrowthRate !== undefined) rejectionReasons.push(`Sales growth is negative or flat: ${(product.salesGrowthRate * 100).toFixed(1)}%`);

  if (product.price >= rules.minPrice) passReasons.push(`Price meets target: $${product.price}`);
  else if (product.price !== null && product.price !== undefined) rejectionReasons.push(`Product price below target: $${product.price} < $${rules.minPrice}`);

  if (product.rating >= rules.minRating) passReasons.push(`Rating is acceptable: ${product.rating}`);
  else if (product.rating !== null && product.rating !== undefined) rejectionReasons.push(`Rating below threshold: ${product.rating} < ${rules.minRating}`);

  if (product.price && product.fbaFee !== null && product.fbaFee !== undefined) {
    const ratio = product.fbaFee / product.price;
    if (product.fbaFee <= rules.maxFbaFee) passReasons.push(`FBA fee is within target: $${product.fbaFee}`);
    else rejectionReasons.push(`FBA fee above threshold: $${product.fbaFee} > $${rules.maxFbaFee}`);
    if (ratio <= rules.maxFbaToPriceRatio) passReasons.push(`FBA-to-price ratio is within target: ${(ratio * 100).toFixed(1)}%`);
    else rejectionReasons.push(`FBA-to-price ratio above threshold: ${(ratio * 100).toFixed(1)}% > ${(rules.maxFbaToPriceRatio * 100).toFixed(1)}%`);
  }

  if (product.grossMargin >= rules.minGrossMargin) passReasons.push(`Gross margin meets floor: ${(product.grossMargin * 100).toFixed(1)}%`);
  else if (product.grossMargin !== null && product.grossMargin !== undefined) rejectionReasons.push(`Gross margin below floor: ${(product.grossMargin * 100).toFixed(1)}%`);

  if (product.sellerCount <= rules.maxSellerCount) passReasons.push(`Seller count is manageable: ${product.sellerCount}`);
  else if (product.sellerCount !== null && product.sellerCount !== undefined) rejectionReasons.push(`Seller count above threshold: ${product.sellerCount} > ${rules.maxSellerCount}`);

  if (product.listingAgeDays <= rules.maxListingAgeDays) passReasons.push(`Listing age is within target: ${product.listingAgeDays} days`);
  else if (product.listingAgeDays !== null && product.listingAgeDays !== undefined) rejectionReasons.push(`Listing age is older than target: ${product.listingAgeDays} days`);

  if (product.reviewCount > rules.maxReviewCountForStrongCandidate && product.listingAgeDays <= 180 && product.salesGrowthRate >= 0.2) {
    retentionReasons.push("High reviews but recent listing and strong growth justify manual review");
  }

  const demandScore = scorePositive(product.monthlySales, rules.minMonthlySales, 12000);
  const growthScore = scorePositive(product.salesGrowthRate ?? 0, 0, 0.5);
  const competitionScore = scoreInverse(product.reviewCount, 0, 10000);
  const profitScore = scorePositive(product.grossMargin, rules.minGrossMargin, 0.8);
  const riskScore = clamp((100 - competitionScore) * 0.45 + scorePositive(product.sellerCount, 1, 10) * 0.25 + scorePositive(product.reviewCount, 1000, 10000) * 0.3, 0, 100);
  const opportunityScore = clamp(demandScore * 0.4 + growthScore * 0.15 + competitionScore * 0.2 + profitScore * 0.25 + (product.amazonChoice ? 5 : 0), 0, 100);

  missingData.push("SIF keyword export is needed for organic traffic, non-brand exact keywords, search volume, trend, and CPC");
  missingData.push("Market analysis export is needed for Top 100 volume, concentration, review distribution, and new-product opportunity");
  missingData.push("Competitor and cost sheets are needed for product-type choice, differentiation, and real net margin");

  const scores = {
    demandScore: Math.round(demandScore),
    growthScore: Math.round(growthScore),
    competitionScore: Math.round(competitionScore),
    profitScore: Math.round(profitScore),
    keywordScore: null,
    complianceScore: null,
    opportunityScore: Math.round(opportunityScore),
    riskScore: Math.round(riskScore)
  };
  const hasMonthlySales = product.monthlySales !== null && product.monthlySales !== undefined;
  const hasSalesGrowthRate = product.salesGrowthRate !== null && product.salesGrowthRate !== undefined;
  const hasPrice = product.price !== null && product.price !== undefined;
  const hasFbaFee = product.fbaFee !== null && product.fbaFee !== undefined;
  const hasListingAgeDays = product.listingAgeDays !== null && product.listingAgeDays !== undefined;

  return {
    ...product,
    ...scores,
    selectionAnalysis: {
      standardPoints: [
        standardPoint(1, "ASIN月销量", product.monthlySales ?? "", hasMonthlySales && product.monthlySales >= rules.minMonthlySales, hasMonthlySales && product.monthlySales >= rules.minMonthlySales ? `月销量超过${rules.minMonthlySales}，有继续分析必要` : `月销量低于${rules.minMonthlySales}，需求不足`),
        standardPoint(2, "销量趋势", hasSalesGrowthRate ? `${(product.salesGrowthRate * 100).toFixed(1)}%` : "", hasSalesGrowthRate && product.salesGrowthRate > rules.minSalesGrowthRate, hasSalesGrowthRate && product.salesGrowthRate > rules.minSalesGrowthRate ? "销量正增长，进入方向顺势" : "销量非正增长，进入可能逆势"),
        standardPoint(3, "ASIN价格", hasPrice ? `$${product.price}` : "", hasPrice && product.price >= rules.minPrice, hasPrice && product.price >= rules.minPrice ? `价格高于${rules.minPrice}，存在利润空间` : `价格低于${rules.minPrice}，利润空间偏弱`),
        standardPoint(4, "ASIN物流成本", hasFbaFee ? `$${product.fbaFee}` : "", hasFbaFee && product.fbaFee <= rules.maxFbaFee, hasFbaFee && product.fbaFee <= rules.maxFbaFee ? `FBA费用不超过${rules.maxFbaFee}，物流成本可控` : `FBA费用超过${rules.maxFbaFee}，需谨慎核算利润`),
        standardPoint(5, "上架时间", hasListingAgeDays ? `${product.listingAgeDays}天` : "", hasListingAgeDays && product.listingAgeDays <= rules.maxListingAgeDays, hasListingAgeDays && product.listingAgeDays <= rules.maxListingAgeDays ? `上架天数不超过${rules.maxListingAgeDays}天，相对较新` : `上架天数超过${rules.maxListingAgeDays}天，追赶难度较高`)
      ]
    },
    status: classify(product, scores, rejectionReasons, retentionReasons, rules),
    passReasons,
    rejectionReasons,
    retentionReasons,
    missingData
  };
}

export function analyzeProducts(products, rules) {
  const items = products.map((product) => analyzeOne(product, rules));
  const summary = {
    total: items.length,
    strongCandidate: items.filter((item) => item.status === "strong_candidate").length,
    observationCandidate: items.filter((item) => item.status === "observation_candidate").length,
    manualReview: items.filter((item) => item.status === "manual_review").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    insufficientData: items.filter((item) => item.status === "insufficient_data").length
  };
  return { summary, items };
}
