import assert from "node:assert/strict";
import test from "node:test";
import { toCsv, toMarkdownReport } from "../src/server/export-results.mjs";

const item = {
  asin: "B000TEST01",
  title: "Magnesium Capsules",
  brand: "Test Brand",
  smallCategory: "Magnesium Mineral Supplements",
  monthlySales: 12000,
  price: 29.99,
  opportunityScore: 86,
  riskScore: 34,
  status: "strong_candidate",
  passReasons: ["Strong monthly sales: 12000"],
  rejectionReasons: [],
  retentionReasons: [],
  missingData: ["SIF keyword export is needed"],
  selectionAnalysis: {
    standardPoints: [
      { point: 1, name: "ASIN月销量", value: 12000, status: "strong", conclusion: "月销量超过3000" },
      { point: 2, name: "销量趋势", value: "12.0%", status: "strong", conclusion: "销量正增长" }
    ]
  }
};

test("toCsv exports candidate rows with escaped reason columns", () => {
  const csv = toCsv([item]);

  assert.match(csv, /^Reviewed,Reviewed At,ASIN,Title,Brand,/);
  assert.match(csv, /B000TEST01/);
  assert.match(csv, /"Strong monthly sales: 12000"/);
});

test("exports reviewed state when an ASIN has been checked", () => {
  const csv = toCsv([{ ...item, reviewed: true, reviewedAt: "2026-06-26T10:00:00.000Z" }]);
  const markdown = toMarkdownReport(
    { total: 1, strongCandidate: 1, observationCandidate: 0, manualReview: 0, rejected: 0, insufficientData: 0 },
    [{ ...item, reviewed: true, reviewedAt: "2026-06-26T10:00:00.000Z" }]
  );

  assert.match(csv, /^Yes,2026-06-26T10:00:00.000Z,B000TEST01/m);
  assert.match(markdown, /Reviewed ASINs: 1/);
  assert.match(markdown, /\| Yes \| B000TEST01 \|/);
});

test("toMarkdownReport summarizes screening results", () => {
  const markdown = toMarkdownReport({ total: 1, strongCandidate: 1, observationCandidate: 0, manualReview: 0, rejected: 0, insufficientData: 0 }, [item]);

  assert.match(markdown, /# Product Screening Report/);
  assert.match(markdown, /Strong candidates: 1/);
  assert.match(markdown, /B000TEST01/);
  assert.match(markdown, /Product Points 1-5 Analysis/);
  assert.match(markdown, /ASIN月销量: 12000/);
});

test("exports SIF keyword enrichment when present", () => {
  const enriched = {
    ...item,
    keywordScore: 56,
    sif: {
      keywordCount: 2,
      topKeywords: ["magnesium glycinate", "thorne magnesium"],
      nonBrandExactKeywords: ["magnesium glycinate"],
      totalSearchVolume: 21000,
      avgCpc: 1.525,
      maxOrganicTrafficShare: 0.18,
      analysis: {
        standardPoints: [
          { point: 6, name: "自然流占比", value: "58%", status: "strong", conclusion: "自然流量健康" },
          { point: 7, name: "前10非品牌精准流量词数量", value: 3, status: "ok", conclusion: "存在可切入精准词" }
        ]
      }
    },
    missingData: ["Market analysis export is needed"]
  };

  const csv = toCsv([enriched]);
  const markdown = toMarkdownReport({ total: 1, strongCandidate: 1, observationCandidate: 0, manualReview: 0, rejected: 0, insufficientData: 0 }, [enriched]);

  assert.match(csv, /Keyword Score/);
  assert.match(csv, /magnesium glycinate/);
  assert.match(csv, /自然流占比: 58%/);
  assert.match(markdown, /SIF keyword data imported for 1 ASIN/);
  assert.match(markdown, /自然流占比/);
  assert.doesNotMatch(markdown, /SIF keyword export is required/);
});
