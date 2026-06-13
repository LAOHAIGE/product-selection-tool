import { parseFlag, parseNumber } from "../shared/fields.mjs";

export const SIF_MISSING_PROMPT = "SIF keyword export is needed for organic traffic, non-brand exact keywords, search volume, trend, and CPC";

const SIF_FIELD_ALIASES = Object.freeze({
  asin: ["ASIN", "商品ASIN", "产品ASIN", "asin"],
  keyword: ["关键词", "关键字", "搜索词", "流量词", "Keyword", "Search Term"],
  keywordEffectType: ["关键词效果类型", "Keyword Type", "Keyword Effect Type"],
  allTrafficShare: ["全部流量占比", "流量占比", "All Traffic Share", "Total Traffic Share"],
  trafficChange: ["全部流量变化", "自然流量变化", "Traffic Change", "Organic Traffic Change"],
  searchVolume: ["搜索量", "月搜索量", "周搜索趋势", "Search Volume", "Monthly Searches"],
  cpc: ["CPC", "cpc", "PPC价格", "建议竞价", "竞价", "Bid", "关键词建议竞价（固定·精准)推荐", "关键词建议竞价（固定·精准）推荐"],
  organicTrafficShare: ["自然流量占比", "自然流量比例", "Organic Traffic Share", "Organic Share"],
  adTrafficShare: ["广告流量占比", "Ad Traffic Share", "Advertising Traffic Share"],
  organicRank: ["自然排名", "Organic Rank", "Organic Position"],
  trend: ["趋势", "搜索趋势", "Trend"],
  brandKeyword: ["是否品牌词", "品牌词", "Brand Keyword", "Branded"]
});

const NUMERIC_SIF_FIELDS = new Set(["searchVolume", "cpc", "organicRank", "trafficChange"]);

function parsePercent(value) {
  const number = parseNumber(value);
  if (number === null) return null;
  return String(value).trim().endsWith("%") || number > 1 ? number / 100 : number;
}

function roundNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#xa;/gi, "\n")
    .trim();
}

function buildHeaderMap(headers) {
  const headerToIndex = new Map(Array.from(headers, (header, index) => [decodeEntities(header), index]));
  const canonicalToIndex = new Map();
  for (const [canonical, aliases] of Object.entries(SIF_FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (headerToIndex.has(alias)) {
        canonicalToIndex.set(canonical, headerToIndex.get(alias));
        break;
      }
    }
  }
  return canonicalToIndex;
}

function resolveHeader(sheet) {
  const candidates = [sheet.headers, ...sheet.rows.slice(0, 10)];
  let best = { headers: sheet.headers, dataRows: sheet.rows, map: buildHeaderMap(sheet.headers), score: 0 };

  candidates.forEach((headers, index) => {
    const map = buildHeaderMap(headers);
    const score = map.size + (map.has("keyword") ? 10 : 0);
    if (score > best.score) {
      best = {
        headers,
        dataRows: index === 0 ? sheet.rows : sheet.rows.slice(index),
        map,
        score
      };
    }
  });

  return best;
}

function convertValue(field, value) {
  if (field === "organicTrafficShare" || field === "allTrafficShare" || field === "adTrafficShare") return parsePercent(value);
  if (field === "brandKeyword") return parseFlag(value) || ["是", "品牌", "品牌词"].includes(String(value ?? "").trim());
  if (NUMERIC_SIF_FIELDS.has(field)) return parseNumber(value);
  return value === null || value === undefined ? "" : decodeEntities(value);
}

function applySparseSellerSpriteDefaults(record) {
  if (!record.keywordEffectType && record.keyword) record.keywordEffectType = "精准流量词";
  if (record.allTrafficShare === null && record.organicTrafficShare !== null) record.allTrafficShare = record.organicTrafficShare;
  if (record.trafficChange === null && record.keyword) record.trafficChange = 0;
  return record;
}

export function normalizeSifKeywords(sheet, options = {}) {
  const targetAsin = options.targetAsin ? String(options.targetAsin).trim() : "";
  const header = resolveHeader(sheet);
  const canonicalToIndex = header.map;
  const records = header.dataRows
    .filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""))
    .map((row) => {
      const record = {};
      for (const field of Object.keys(SIF_FIELD_ALIASES)) {
        const index = canonicalToIndex.get(field);
        record[field] = index === undefined ? null : convertValue(field, row[index]);
      }
      if (!record.asin && targetAsin) record.asin = targetAsin;
      return applySparseSellerSpriteDefaults(record);
    })
    .filter((record) => record.asin && record.keyword)
    .filter((record) => !targetAsin || record.asin === targetAsin);

  return {
    records,
    missingRequiredFields: ["asin", "keyword"].filter((field) => field !== "asin" || !targetAsin).filter((field) => !canonicalToIndex.has(field)),
    mappedFields: Object.fromEntries(canonicalToIndex)
  };
}

function average(values) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function includesExactTrafficType(row) {
  return String(row.keywordEffectType || "").includes("精准流量词");
}

function isBrandKeyword(row, product) {
  const keyword = String(row.keyword || "").toLowerCase();
  const brand = String(product?.brand || "").toLowerCase().trim();
  return Boolean(row.brandKeyword) || (brand && keyword.includes(brand));
}

function statusFromThreshold(value, strong, ok) {
  if (value >= strong) return "strong";
  if (value >= ok) return "ok";
  return "weak";
}

function analyzeStandardPoints(rows, product) {
  const first20Rows = rows.slice(0, 20);
  const hasAdTrafficShare = first20Rows.some((row) => row.adTrafficShare !== null && row.adTrafficShare !== undefined);
  const naturalWeightedNumerator = first20Rows.reduce((sum, row) => sum + ((row.allTrafficShare ?? 1) * (row.organicTrafficShare ?? 0)), 0);
  const naturalWeightedDenominator = first20Rows.reduce((sum, row) => sum + ((row.allTrafficShare ?? 1) * ((row.organicTrafficShare ?? 0) + (row.adTrafficShare ?? 0))), 0);
  const naturalTrafficShare = roundNumber(
    hasAdTrafficShare && naturalWeightedDenominator > 0
      ? naturalWeightedNumerator / naturalWeightedDenominator
      : first20Rows.reduce((sum, row) => sum + (row.organicTrafficShare ?? 0), 0),
    4
  ) ?? 0;
  const top10Rows = rows.slice(0, 10);
  const top10BrandRows = top10Rows.filter((row) => isBrandKeyword(row, product));
  const top10NonBrandRows = top10Rows.filter((row) => !isBrandKeyword(row, product));
  const searchVolumes = first20Rows.map((row) => row.searchVolume ?? 0);
  const hasOneKeywordOver100kSearches = searchVolumes.some((value) => value >= 100000);
  const keywordCountOver50kSearches = searchVolumes.filter((value) => value >= 50000).length;
  const searchDemandMeetsRule = hasOneKeywordOver100kSearches && keywordCountOver50kSearches >= 3;
  const estimatedAdBid = roundNumber(average(first20Rows.map((row) => row.cpc)), 2);

  return {
    naturalTrafficShare,
    top10BrandKeywordCount: top10BrandRows.length,
    top10BrandKeywords: top10BrandRows.map((row) => row.keyword),
    top10NonBrandExactTrafficKeywordCount: top10NonBrandRows.length,
    top10NonBrandExactTrafficKeywords: top10NonBrandRows.map((row) => row.keyword),
    hasOneKeywordOver100kSearches,
    keywordCountOver50kSearches,
    searchDemandMeetsRule,
    exactKeywordSearchVolume: first20Rows.reduce((sum, row) => sum + (row.searchVolume ?? 0), 0),
    exactKeywordTrafficTrend: null,
    exactKeywordAverageCpc: estimatedAdBid,
    keywordTrendRequiresManualReview: true,
    estimatedAdBid,
    standardPoints: [
      {
        point: 6,
        name: "自然流占比",
        value: `${roundNumber(naturalTrafficShare * 100, 1)}%`,
        status: naturalTrafficShare >= 0.6 ? "strong" : naturalTrafficShare >= 0.4 ? "ok" : "weak",
        conclusion: naturalTrafficShare >= 0.6 ? "前20关键词整体自然流量占比达到60%，流量健康、广告依赖相对低" : naturalTrafficShare >= 0.4 ? "自然流量有基础，但未达到60%，需继续观察广告依赖" : "自然流占比偏低，可能较依赖广告"
      },
      {
        point: 7,
        name: "前10非品牌精准流量词数量",
        value: top10NonBrandRows.length,
        status: statusFromThreshold(top10NonBrandRows.length, 7, 4),
        conclusion: `前10流量词中品牌词${top10BrandRows.length}个，非品牌词${top10NonBrandRows.length}个。${top10NonBrandRows.length >= 7 ? "非品牌需求词丰富，新品可切入空间较好" : top10NonBrandRows.length >= 4 ? "有一定非品牌词基础，但需继续扩展关键词打法" : "品牌词占比偏高，流量可能更依赖品牌"}`
      },
      {
        point: 8,
        name: "精准流量词搜索量",
        value: `>=10万词${hasOneKeywordOver100kSearches ? "有" : "无"}，>=5万词${keywordCountOver50kSearches}个`,
        status: searchDemandMeetsRule ? "strong" : keywordCountOver50kSearches >= 1 ? "ok" : "weak",
        conclusion: searchDemandMeetsRule ? "前20词满足至少1个10万+且至少3个5万+，需求量达标" : "前20词未完全满足搜索量门槛，需求规模需谨慎"
      },
      {
        point: 9,
        name: "精准流量词趋势",
        value: "人工判断",
        status: "manual",
        conclusion: "该点按你的新标准保留人工判断，用于判断关键词和类目的生命周期"
      },
      {
        point: 10,
        name: "广告竞价",
        value: estimatedAdBid === null ? "" : `$${estimatedAdBid}`,
        status: estimatedAdBid === null ? "unknown" : estimatedAdBid <= 1.5 ? "strong" : estimatedAdBid <= 3 ? "ok" : "weak",
        conclusion: estimatedAdBid === null ? "缺少广告竞价数据" : estimatedAdBid <= 1.5 ? "广告竞价较低" : estimatedAdBid <= 3 ? "广告竞价中等" : "广告竞价偏高，需要谨慎核算广告成本"
      }
    ]
  };
}

function aggregateRecords(records, product) {
  const byAsin = new Map();
  for (const record of records) {
    const list = byAsin.get(record.asin) || [];
    list.push(record);
    byAsin.set(record.asin, list);
  }

  const aggregated = new Map();
  for (const [asin, rows] of byAsin) {
    const sortedBySearch = [...rows].sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
    const nonBrandExactKeywords = sortedBySearch
      .filter((row) => !isBrandKeyword(row, product))
      .map((row) => row.keyword)
      .slice(0, 10);
    aggregated.set(asin, {
      keywordCount: rows.length,
      topKeywords: sortedBySearch.map((row) => row.keyword).slice(0, 10),
      nonBrandExactKeywords,
      totalSearchVolume: rows.reduce((sum, row) => sum + (row.searchVolume ?? 0), 0),
      avgCpc: average(rows.map((row) => row.cpc)),
      maxOrganicTrafficShare: Math.max(0, ...rows.map((row) => row.organicTrafficShare ?? 0)),
      bestOrganicRank: Math.min(...rows.map((row) => row.organicRank ?? Number.POSITIVE_INFINITY)),
      trends: [...new Set(rows.map((row) => row.trend).filter(Boolean))],
      analysis: analyzeStandardPoints(rows, product)
    });
  }
  return aggregated;
}

function keywordScore(sif) {
  const volumeScore = Math.min((sif.totalSearchVolume / 50000) * 50, 50);
  const nonBrandScore = Math.min(sif.nonBrandExactKeywords.length * 5, 25);
  const trafficScore = Math.min(sif.maxOrganicTrafficShare * 100, 25);
  return Math.round(volumeScore + nonBrandScore + trafficScore);
}

export function mergeSifIntoRun(run, sifResult, options = {}) {
  const targetAsin = options.targetAsin ? String(options.targetAsin).trim() : "";
  let matchedAsins = 0;

  const items = run.items.map((item) => {
    const aggregated = aggregateRecords(sifResult.records, item);
    const sif = aggregated.get(item.asin);
    if (!sif) return item;
    matchedAsins += 1;
    const score = keywordScore(sif);
    const missingData = (item.missingData || []).filter((entry) => entry !== SIF_MISSING_PROMPT);
    const passReasons = [
      ...(item.passReasons || []),
      `SIF keyword data imported: ${sif.keywordCount} keywords, ${sif.nonBrandExactKeywords.length} non-brand keywords`
    ];
    return { ...item, sif, keywordScore: score, missingData, passReasons };
  });

  const matchedSet = new Set(items.filter((item) => item.sif).map((item) => item.asin));
  const importedAsins = new Set(sifResult.records.map((record) => record.asin));
  const unmatchedAsins = [...importedAsins].filter((asin) => !matchedSet.has(asin)).length;

  return {
    ...run,
    items,
    importInfo: {
      ...(run.importInfo || {}),
      sif: {
        importedAt: new Date().toISOString(),
        targetAsin: targetAsin || null,
        keywordRows: sifResult.records.length,
        matchedAsins,
        unmatchedAsins,
        missingRequiredFields: sifResult.missingRequiredFields
      }
    }
  };
}
