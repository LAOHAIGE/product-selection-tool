import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProducts } from "../src/server/analyze-products.mjs";
import { DEFAULT_RULES } from "../src/shared/default-rules.mjs";

const baseProduct = {
  asin: "B000TEST01",
  title: "Magnesium Capsules",
  brand: "Test Brand",
  smallCategory: "Magnesium Mineral Supplements",
  monthlySales: 12000,
  salesGrowthRate: 0.12,
  monthlyRevenue: 360000,
  price: 29.99,
  reviewCount: 430,
  rating: 4.5,
  fbaFee: 4.09,
  grossMargin: 0.72,
  listingAgeDays: 180,
  sellerCount: 1,
  variantCount: 2,
  amazonChoice: true
};

test("analyzeProducts marks strong candidates with reasons", () => {
  const result = analyzeProducts([baseProduct], DEFAULT_RULES);
  const analyzed = result.items[0];

  assert.equal(analyzed.status, "strong_candidate");
  assert.ok(analyzed.opportunityScore >= 75);
  assert.ok(analyzed.passReasons.some((reason) => reason.includes("monthly sales")));
  assert.equal(analyzed.selectionAnalysis.standardPoints.length, 5);
  assert.deepEqual(analyzed.selectionAnalysis.standardPoints.map((point) => point.point), [1, 2, 3, 4, 5]);
  assert.ok(analyzed.missingData.includes("SIF keyword export is needed for organic traffic, non-brand exact keywords, search volume, trend, and CPC"));
});

test("analyzeProducts hard rejects low price products", () => {
  const result = analyzeProducts([{ ...baseProduct, asin: "B000TEST02", price: 19.99 }], DEFAULT_RULES);

  assert.equal(result.items[0].status, "rejected");
  assert.ok(result.items[0].rejectionReasons.some((reason) => reason.includes("price")));
});

test("analyzeProducts hard rejects negative sales growth products", () => {
  const result = analyzeProducts([{ ...baseProduct, asin: "B000TEST05", salesGrowthRate: -0.01 }], DEFAULT_RULES);

  assert.equal(result.items[0].status, "rejected");
  assert.ok(result.items[0].rejectionReasons.some((reason) => reason.includes("Sales growth is negative")));
});

test("analyzeProducts hard rejects high FBA fee and old listings using first-part thresholds", () => {
  const result = analyzeProducts([{ ...baseProduct, asin: "B000TEST06", fbaFee: 6.5, listingAgeDays: 721 }], DEFAULT_RULES);

  assert.equal(result.items[0].status, "rejected");
  assert.ok(result.items[0].rejectionReasons.some((reason) => reason.includes("FBA fee above threshold")));
  assert.ok(result.items[0].rejectionReasons.some((reason) => reason.includes("older than target")));
});

test("analyzeProducts preserves high-review recent products for manual review", () => {
  const result = analyzeProducts([{ ...baseProduct, asin: "B000TEST03", reviewCount: 9000, listingAgeDays: 90, salesGrowthRate: 0.45 }], DEFAULT_RULES);

  assert.equal(result.items[0].status, "manual_review");
  assert.ok(result.items[0].retentionReasons.some((reason) => reason.includes("recent listing")));
});

test("analyzeProducts marks missing critical values as insufficient data", () => {
  const result = analyzeProducts([{ ...baseProduct, asin: "B000TEST04", monthlySales: null }], DEFAULT_RULES);

  assert.equal(result.items[0].status, "insufficient_data");
  assert.ok(result.items[0].missingData.some((item) => item.includes("monthlySales")));
});
