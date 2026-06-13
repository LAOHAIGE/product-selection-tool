import { DEFAULT_AI_PROMPT, DEFAULT_COMPETITOR_PROMPT } from "./ai-config.mjs";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const COMPETITOR_RECORD_LIMIT = 120;
const ASIN_SUMMARY_SCHEMA = "{\"advantages\":[\"...\"],\"disadvantages\":[\"...\"],\"risks\":[\"...\"],\"strategy\":\"...\",\"recommendation\":\"可做/观察候选/暂缓\"}";
const COMPETITOR_ANALYSIS_SCHEMA = "{\"priceDifferenceReasons\":[\"...\"],\"competitorGroups\":[{\"name\":\"...\",\"formula\":\"...\",\"priceBand\":\"...\",\"notes\":\"...\"}],\"bestSellingTypes\":[\"...\"],\"premiumTypes\":[\"...\"],\"growingTypes\":[\"...\"],\"oldListingTypes\":[\"...\"],\"recommendedFormula\":\"...\",\"recommendedPriceBand\":\"...\",\"strategy\":\"...\"}";

function compactItem(item) {
  return {
    asin: item.asin,
    title: item.title,
    brand: item.brand,
    category: item.smallCategory,
    monthlySales: item.monthlySales,
    price: item.price,
    rating: item.rating,
    reviewCount: item.reviewCount,
    fbaFee: item.fbaFee,
    grossMargin: item.grossMargin,
    listingAgeDays: item.listingAgeDays,
    sellerCount: item.sellerCount,
    opportunityScore: item.opportunityScore,
    riskScore: item.riskScore,
    status: item.status,
    passReasons: item.passReasons,
    rejectionReasons: item.rejectionReasons,
    retentionReasons: item.retentionReasons,
    missingData: item.missingData,
    productStandardPoints: item.selectionAnalysis?.standardPoints,
    sif: item.sif ? {
      keywordCount: item.sif.keywordCount,
      totalSearchVolume: item.sif.totalSearchVolume,
      nonBrandExactKeywords: item.sif.nonBrandExactKeywords,
      standardPoints: item.sif.analysis?.standardPoints,
      top10NonBrandExactTrafficKeywords: item.sif.analysis?.top10NonBrandExactTrafficKeywords
    } : null
  };
}

function compactCompetitorData(competitorData) {
  const records = (competitorData.records || []).map((record) => ({
    title: record.title,
    bulletPoints: record.bulletPoints,
    monthlySales: record.monthlySales,
    salesTrend: record.salesTrend,
    growthStatus: record.growthStatus,
    price: record.price,
    listingAgeDays: record.listingAgeDays
  }));
  return {
    summary: competitorData.summary || {},
    records: records.slice(0, COMPETITOR_RECORD_LIMIT),
    truncatedRecords: Math.max(0, records.length - COMPETITOR_RECORD_LIMIT)
  };
}

export function buildAsinSummaryMessages(item, options = {}) {
  const prompt = String(options.prompt || DEFAULT_AI_PROMPT).trim();
  return [
    {
      role: "system",
      content: "你是亚马逊选品分析师。请基于给定数据谨慎判断，不要编造缺失数据。输出必须是 JSON。"
    },
    {
      role: "user",
      content: [
        prompt,
        "请只返回 JSON，格式如下：",
        ASIN_SUMMARY_SCHEMA,
        "必须是严格 JSON：不要 Markdown，不要解释文字，字符串内容不要包含原始换行；如果内容较长，请用一句话概括。",
        "ASIN 数据：",
        JSON.stringify(compactItem(item), null, 2)
      ].join("\n")
    }
  ];
}

export function buildCompetitorAnalysisMessages(item, competitorData, options = {}) {
  const prompt = String(options.prompt || DEFAULT_COMPETITOR_PROMPT).trim();
  return [
    {
      role: "system",
      content: "你是亚马逊选品竞品分析师。只能使用提供的数据。输出必须是严格 JSON。"
    },
    {
      role: "user",
      content: [
        prompt,
        "请基于目标 ASIN 和竞品表数据，分析这个 ASIN 的竞品格局。",
        "重点回答：价格差异原因、竞品大体分组、每组配方/卖点特征、每组价格带、哪类畅销、哪类高价、哪类增长、哪类是上架很久的老品，以及我们应该做什么配方和价格带。",
        "请只返回严格 JSON，不要 Markdown，不要解释 JSON 之外的文字。字段必须包含：",
        COMPETITOR_ANALYSIS_SCHEMA,
        "目标 ASIN：",
        JSON.stringify(compactItem(item), null, 2),
        "竞品数据：",
        JSON.stringify(compactCompetitorData(competitorData), null, 2)
      ].join("\n")
    }
  ];
}

function cleanJsonLikeContent(content) {
  const value = String(content || "").trim();
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonObject(content) {
  const value = String(content || "").trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return value;
  return value.slice(start, end + 1).trim();
}

function escapeRawControlCharactersInStrings(content) {
  let output = "";
  let inString = false;
  let escaping = false;
  for (const char of String(content || "")) {
    if (!inString) {
      output += char;
      if (char === "\"") inString = true;
      continue;
    }
    if (escaping) {
      output += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaping = true;
      continue;
    }
    if (char === "\"") {
      output += char;
      inString = false;
      continue;
    }
    if (char === "\n") {
      output += "\\n";
    } else if (char === "\r") {
      output += "\\r";
    } else if (char === "\t") {
      output += "\\t";
    } else {
      output += char;
    }
  }
  return output;
}

function repairJsonLikeContent(content) {
  return insertMissingJsonCommas(replaceLooseJsonSemicolons(escapeRawControlCharactersInStrings(content)))
    .replace(/,\s*([}\]])/g, "$1");
}

function replaceLooseJsonSemicolons(content) {
  let output = "";
  let inString = false;
  let escaping = false;
  for (const char of String(content || "")) {
    if (!inString) {
      output += char === ";" ? "," : char;
      if (char === "\"") inString = true;
      continue;
    }
    output += char;
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "\"") {
      inString = false;
    }
  }
  return output;
}

function insertMissingJsonCommas(content) {
  let output = "";
  let inString = false;
  let escaping = false;
  const valueEnd = new Set(["}", "]"]);
  for (let index = 0; index < String(content || "").length; index += 1) {
    const char = String(content || "")[index];
    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
        if (needsCommaBeforeNextValue(content, index)) output += ",";
      }
      continue;
    }
    output += char;
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (valueEnd.has(char) && needsCommaBeforeNextValue(content, index)) {
      output += ",";
    }
  }
  return output;
}

function needsCommaBeforeNextValue(content, index) {
  let nextIndex = index + 1;
  const source = String(content || "");
  while (nextIndex < source.length && /\s/.test(source[nextIndex])) nextIndex += 1;
  const next = source[nextIndex];
  if (!next || next === "," || next === "]" || next === "}" || next === ":") return false;
  return next === "\"" || next === "{" || next === "[";
}

function parseJsonContent(content) {
  const cleaned = cleanJsonLikeContent(content);
  const extracted = extractJsonObject(cleaned);
  const candidates = [cleaned, extracted]
    .filter(Boolean)
    .flatMap((candidate) => [candidate, repairJsonLikeContent(candidate)]);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  const preview = String(extracted || cleaned).slice(0, 260).replace(/\s+/g, " ");
  throw new Error(`DeepSeek returned invalid JSON: ${lastError?.message || "unknown parse error"}. Retry AI summary or shorten the AI rule. Preview: ${preview}`);
}

function buildJsonRepairMessages(content, schema, parseError) {
  return [
    {
      role: "system",
      content: "你是 JSON 修复器。只修复用户给出的 JSON 文本，不新增分析内容。输出必须是严格 JSON。"
    },
    {
      role: "user",
      content: [
        "下面的 JSON 解析失败，请修复为严格 JSON。",
        `解析错误：${parseError?.message || parseError}`,
        "目标 JSON schema：",
        schema,
        "要求：只返回 JSON；不要 Markdown；不要解释；不要用分号分隔数组或对象；字符串里的内容可以保留。",
        "待修复内容：",
        String(content || "")
      ].join("\n")
    }
  ];
}

async function parseJsonWithDeepSeekRepair(content, schema, options = {}) {
  try {
    return parseJsonContent(content);
  } catch (error) {
    const repair = await postDeepSeekChat(
      buildJsonRepairMessages(content, schema, error),
      { ...options, temperature: 0, maxTokens: options.repairMaxTokens ?? options.maxTokens ?? 1600 }
    );
    try {
      return parseJsonContent(repair.content);
    } catch (repairError) {
      throw new Error(`${error.message} JSON repair also failed: ${repairError.message}`);
    }
  }
}

function normalizeSummary(summary) {
  return {
    advantages: Array.isArray(summary.advantages) ? summary.advantages : [],
    disadvantages: Array.isArray(summary.disadvantages) ? summary.disadvantages : [],
    risks: Array.isArray(summary.risks) ? summary.risks : [],
    strategy: String(summary.strategy || ""),
    recommendation: String(summary.recommendation || "")
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function normalizeCompetitorAnalysis(analysis) {
  return {
    priceDifferenceReasons: normalizeArray(analysis.priceDifferenceReasons).map((value) => String(value)),
    competitorGroups: normalizeArray(analysis.competitorGroups).map((group) => {
      if (typeof group === "object" && group !== null) {
        return {
          name: String(group.name || ""),
          formula: String(group.formula || ""),
          priceBand: String(group.priceBand || ""),
          notes: String(group.notes || "")
        };
      }
      return { name: String(group), formula: "", priceBand: "", notes: "" };
    }),
    bestSellingTypes: normalizeArray(analysis.bestSellingTypes).map((value) => String(value)),
    premiumTypes: normalizeArray(analysis.premiumTypes).map((value) => String(value)),
    growingTypes: normalizeArray(analysis.growingTypes).map((value) => String(value)),
    oldListingTypes: normalizeArray(analysis.oldListingTypes).map((value) => String(value)),
    recommendedFormula: String(analysis.recommendedFormula || ""),
    recommendedPriceBand: String(analysis.recommendedPriceBand || ""),
    strategy: String(analysis.strategy || "")
  };
}

function describeNetworkCause(error) {
  const parts = [error?.cause?.code, error?.cause?.syscall, error?.cause?.hostname]
    .filter(Boolean)
    .map((part) => String(part));
  return parts.length ? ` (${parts.join(", ")})` : "";
}

async function postDeepSeekChat(messages, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("DeepSeek API Key is not configured.");
  const fetchImpl = options.fetch || fetch;
  const model = options.model || DEFAULT_MODEL;
  let response;
  try {
    response = await fetchImpl(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
        response_format: { type: "json_object" }
      })
    });
  } catch (error) {
    throw new Error(`DeepSeek 网络连接失败${describeNetworkCause(error)}：当前服务无法访问 api.deepseek.com，请确认本机外网权限、代理或防火墙设置。`);
  }
  if (!response.ok) {
    const errorText = await response.text?.().catch(() => "") || "";
    throw new Error(`DeepSeek request failed: HTTP ${response.status}${errorText ? ` ${errorText}` : ""}`);
  }
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek response did not include a message.");
  return { content, model };
}

export async function summarizeAsinWithDeepSeek(item, options = {}) {
  const result = await postDeepSeekChat(
    buildAsinSummaryMessages(item, { prompt: options.prompt }),
    { ...options, maxTokens: options.maxTokens ?? 1200 }
  );
  return normalizeSummary(await parseJsonWithDeepSeekRepair(result.content, ASIN_SUMMARY_SCHEMA, { ...options, maxTokens: options.maxTokens ?? 1200 }));
}

export async function summarizeCompetitorsWithDeepSeek(item, competitorData, options = {}) {
  const result = await postDeepSeekChat(
    buildCompetitorAnalysisMessages(item, competitorData, { prompt: options.prompt }),
    { ...options, maxTokens: options.maxTokens ?? 1600 }
  );
  return normalizeCompetitorAnalysis(await parseJsonWithDeepSeekRepair(result.content, COMPETITOR_ANALYSIS_SCHEMA, { ...options, maxTokens: options.maxTokens ?? 1600 }));
}

export async function testDeepSeekKey(apiKey, options = {}) {
  const result = await postDeepSeekChat([
    { role: "system", content: "Return compact JSON only." },
    { role: "user", content: "请只返回 JSON：{\"ok\":true}" }
  ], { ...options, apiKey, temperature: 0, maxTokens: 40 });
  const parsed = parseJsonContent(result.content);
  return { ok: parsed.ok !== false, model: result.model };
}

export function attachAiSummaryToRun(run, asin, summary) {
  return {
    ...run,
    items: run.items.map((item) => item.asin === asin
      ? { ...item, aiSummary: { provider: "deepseek", createdAt: new Date().toISOString(), ...summary } }
      : item)
  };
}
