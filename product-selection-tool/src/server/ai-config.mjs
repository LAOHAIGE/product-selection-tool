import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_AI_PROMPT = [
  "请根据第一部分第1-10点分析这个 ASIN 的优缺点、风险、打法建议和最终结论。",
  "请先判断这个品能不能做，再说明怎么做才有胜算。",
  "结论必须落到：可做 / 观察候选 / 暂缓。"
].join("\n");

export const DEFAULT_COMPETITOR_PROMPT = [
  "请根据竞品表分析目标 ASIN 的竞争格局。",
  "请说明价格差异原因、竞品大体分类、每类配方/卖点特征、每类价格带、畅销类型、高价类型、增长类型、老品类型。",
  "最后给出建议：我们应该做哪种配方、哪个价格带，以及具体打法。"
].join("\n");

function configPath(rootDir) {
  return join(rootDir, "ai-config.json");
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizePrompt(prompt) {
  const value = String(prompt || "").trim();
  return value || DEFAULT_AI_PROMPT;
}

function normalizeCompetitorPrompt(prompt) {
  const value = String(prompt || "").trim();
  return value || DEFAULT_COMPETITOR_PROMPT;
}

function normalizeDeepSeekKey(key) {
  return String(key || "").trim();
}

export function maskDeepSeekKey(key) {
  const value = normalizeDeepSeekKey(key);
  if (!value) return "";
  const prefix = value.startsWith("sk-") ? "sk-" : "";
  return `${prefix}****${value.slice(-4)}`;
}

export function normalizeAiConfig(config = {}) {
  const prompt = normalizePrompt(config.prompt);
  const competitorPrompt = normalizeCompetitorPrompt(config.competitorPrompt);
  return {
    prompt,
    competitorPrompt,
    isDefault: prompt === DEFAULT_AI_PROMPT,
    competitorPromptIsDefault: competitorPrompt === DEFAULT_COMPETITOR_PROMPT,
    updatedAt: config.updatedAt || null,
    deepseekApiKey: normalizeDeepSeekKey(config.deepseekApiKey)
  };
}

export function publicAiConfig(config = {}) {
  const normalized = normalizeAiConfig(config);
  return {
    prompt: normalized.prompt,
    competitorPrompt: normalized.competitorPrompt,
    isDefault: normalized.isDefault,
    competitorPromptIsDefault: normalized.competitorPromptIsDefault,
    updatedAt: normalized.updatedAt,
    deepseekKeyConfigured: Boolean(normalized.deepseekApiKey),
    deepseekKeyPreview: maskDeepSeekKey(normalized.deepseekApiKey)
  };
}

export async function loadAiConfig(rootDir = "data") {
  try {
    const text = await readFile(configPath(rootDir), "utf8");
    return normalizeAiConfig(JSON.parse(text));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return normalizeAiConfig();
  }
}

export async function saveAiConfig(rootDir = "data", config = {}) {
  await mkdir(rootDir, { recursive: true });
  const current = await loadAiConfig(rootDir);
  const saved = normalizeAiConfig({
    prompt: hasOwn(config, "prompt") ? config.prompt : current.prompt,
    competitorPrompt: hasOwn(config, "competitorPrompt") ? config.competitorPrompt : current.competitorPrompt,
    deepseekApiKey: hasOwn(config, "deepseekApiKey") ? config.deepseekApiKey : current.deepseekApiKey,
    updatedAt: new Date().toISOString()
  });
  await writeFile(configPath(rootDir), JSON.stringify(saved, null, 2), "utf8");
  return saved;
}
