import assert from "node:assert/strict";
import test from "node:test";
import { mergeCompetitorsIntoRun, normalizeCompetitors } from "../src/server/competitor-import.mjs";

function rowWithCompetitorData({ title, bullets, monthlySales, salesTrend, price, listingAgeDays }) {
  const row = [];
  row[8] = title;
  row[9] = bullets;
  row[20] = monthlySales;
  row[21] = salesTrend;
  row[26] = price;
  row[38] = listingAgeDays;
  return row;
}

test("normalizeCompetitors reads title, bullets, sales, trend, price, and listing age from fixed columns", () => {
  const result = normalizeCompetitors({
    headers: [],
    rows: [
      rowWithCompetitorData({
        title: "Magnesium Glycinate 120 Capsules",
        bullets: "Chelated magnesium; sleep support; vegan capsules",
        monthlySales: "12,500",
        salesTrend: "18%",
        price: "$32.99",
        listingAgeDays: "540"
      }),
      rowWithCompetitorData({
        title: "High Potency Magnesium Complex",
        bullets: "Magnesium blend; muscle support; 240 tablets",
        monthlySales: "7,200",
        salesTrend: "-5%",
        price: "$45.50",
        listingAgeDays: "960"
      })
    ]
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].title, "Magnesium Glycinate 120 Capsules");
  assert.equal(result.records[0].bulletPoints, "Chelated magnesium; sleep support; vegan capsules");
  assert.equal(result.records[0].monthlySales, 12500);
  assert.equal(result.records[0].salesTrend, 0.18);
  assert.equal(result.records[0].growthStatus, "growing");
  assert.equal(result.records[0].price, 32.99);
  assert.equal(result.records[0].listingAgeDays, 540);
  assert.equal(result.records[1].growthStatus, "declining");
});

test("normalizeCompetitors summarizes price, sales, growth, and old listing counts", () => {
  const result = normalizeCompetitors({
    headers: [],
    rows: [
      rowWithCompetitorData({ title: "Fast Grower", bullets: "new formula", monthlySales: 15000, salesTrend: "20%", price: 29.99, listingAgeDays: 180 }),
      rowWithCompetitorData({ title: "Old Premium", bullets: "large count", monthlySales: 9000, salesTrend: "0%", price: 49.99, listingAgeDays: 1200 }),
      rowWithCompetitorData({ title: "Declining Budget", bullets: "basic formula", monthlySales: 4000, salesTrend: "-8%", price: 19.99, listingAgeDays: 850 })
    ]
  });

  assert.equal(result.summary.totalCompetitors, 3);
  assert.equal(result.summary.priceMin, 19.99);
  assert.equal(result.summary.priceMax, 49.99);
  assert.equal(result.summary.monthlySalesMin, 4000);
  assert.equal(result.summary.monthlySalesMax, 15000);
  assert.equal(result.summary.growingCount, 1);
  assert.equal(result.summary.decliningCount, 1);
  assert.equal(result.summary.oldListingCount, 2);
});

test("mergeCompetitorsIntoRun stores competitor records and AI status on the target ASIN", () => {
  const run = {
    summary: { total: 1 },
    items: [{ asin: "B000TEST01", title: "Target ASIN" }]
  };
  const competitors = normalizeCompetitors({
    headers: [],
    rows: [
      rowWithCompetitorData({ title: "Competitor", bullets: "sleep support", monthlySales: 12000, salesTrend: "10%", price: 31.99, listingAgeDays: 300 })
    ]
  });

  const merged = mergeCompetitorsIntoRun(run, "B000TEST01", competitors, {
    aiStatus: { status: "skipped", reason: "DeepSeek API Key is not configured." }
  });

  assert.equal(merged.items[0].competitors.records.length, 1);
  assert.equal(merged.items[0].competitors.summary.totalCompetitors, 1);
  assert.equal(merged.items[0].competitors.aiAnalysis, null);
  assert.equal(merged.items[0].competitors.aiStatus.status, "skipped");
  assert.equal(merged.importInfo.competitors.targetAsin, "B000TEST01");
});
