import { parseNumber } from "../shared/fields.mjs";

const TITLE_COLUMN = 8;
const BULLET_POINTS_COLUMN = 9;
const MONTHLY_SALES_COLUMN = 20;
const SALES_TREND_COLUMN = 21;
const PRICE_COLUMN = 26;
const LISTING_AGE_DAYS_COLUMN = 38;
const OLD_LISTING_DAYS = 720;

function textValue(value) {
  return String(value ?? "").trim();
}

function parseTrend(value) {
  const number = parseNumber(value);
  if (number === null) return null;
  return textValue(value).endsWith("%") ? number / 100 : number;
}

function growthStatus(value) {
  if (value === null || value === undefined) return "unknown";
  if (value > 0) return "growing";
  if (value < 0) return "declining";
  return "flat";
}

function minValue(values) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  return valid.length ? Math.min(...valid) : null;
}

function maxValue(values) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  return valid.length ? Math.max(...valid) : null;
}

function averageValue(values) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  if (valid.length === 0) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

function summarizeCompetitors(records) {
  const prices = records.map((record) => record.price);
  const monthlySales = records.map((record) => record.monthlySales);
  return {
    totalCompetitors: records.length,
    priceMin: minValue(prices),
    priceMax: maxValue(prices),
    averagePrice: averageValue(prices),
    monthlySalesMin: minValue(monthlySales),
    monthlySalesMax: maxValue(monthlySales),
    averageMonthlySales: averageValue(monthlySales),
    growingCount: records.filter((record) => record.growthStatus === "growing").length,
    decliningCount: records.filter((record) => record.growthStatus === "declining").length,
    flatCount: records.filter((record) => record.growthStatus === "flat").length,
    unknownGrowthCount: records.filter((record) => record.growthStatus === "unknown").length,
    oldListingCount: records.filter((record) => (record.listingAgeDays ?? 0) > OLD_LISTING_DAYS).length
  };
}

export function normalizeCompetitors(sheet) {
  const rows = sheet?.rows || [];
  const records = rows
    .map((row, index) => {
      const title = textValue(row[TITLE_COLUMN]);
      const bulletPoints = textValue(row[BULLET_POINTS_COLUMN]);
      const trend = parseTrend(row[SALES_TREND_COLUMN]);
      return {
        rowNumber: index + 2,
        title,
        bulletPoints,
        monthlySales: parseNumber(row[MONTHLY_SALES_COLUMN]),
        salesTrend: trend,
        growthStatus: growthStatus(trend),
        price: parseNumber(row[PRICE_COLUMN]),
        listingAgeDays: parseNumber(row[LISTING_AGE_DAYS_COLUMN])
      };
    })
    .filter((record) => record.title || record.bulletPoints);

  return {
    records,
    summary: summarizeCompetitors(records),
    mappedColumns: {
      title: "I",
      bulletPoints: "J",
      monthlySales: "U",
      salesTrend: "V",
      price: "AA",
      listingAgeDays: "AM"
    }
  };
}

export function mergeCompetitorsIntoRun(run, asin, competitorResult, options = {}) {
  const targetAsin = String(asin || "").trim().toUpperCase();
  let matchedAsins = 0;
  const items = (run.items || []).map((item) => {
    if (String(item.asin || "").trim().toUpperCase() !== targetAsin) return item;
    matchedAsins += 1;
    return {
      ...item,
      competitors: {
        records: competitorResult.records || [],
        summary: competitorResult.summary || summarizeCompetitors(competitorResult.records || []),
        aiAnalysis: options.aiAnalysis || null,
        aiStatus: options.aiStatus || null
      }
    };
  });

  return {
    ...run,
    items,
    importInfo: {
      ...(run.importInfo || {}),
      competitors: {
        importedAt: new Date().toISOString(),
        targetAsin,
        competitorRows: competitorResult.records?.length || 0,
        matchedAsins,
        aiStatus: options.aiStatus || null
      }
    }
  };
}
