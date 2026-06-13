import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAiConfig, maskDeepSeekKey, publicAiConfig, saveAiConfig } from "./ai-config.mjs";
import { analyzeProducts } from "./analyze-products.mjs";
import { attachAiSummaryToRun, summarizeAsinWithDeepSeek, summarizeCompetitorsWithDeepSeek, testDeepSeekKey } from "./deepseek-summary.mjs";
import { toCsv, toMarkdownReport } from "./export-results.mjs";
import { normalizeProducts } from "./normalize-products.mjs";
import { mergeCompetitorsIntoRun, normalizeCompetitors } from "./competitor-import.mjs";
import { mergeSifIntoRun, normalizeSifKeywords } from "./sif-import.mjs";
import { createStorage } from "./storage.mjs";
import { readWorkbook } from "./xlsx/workbook-reader.mjs";
import { DEFAULT_RULES } from "../shared/default-rules.mjs";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

const DEFAULT_SESSION_ID = "default";
const SESSION_HEADER = "x-selection-session-id";
const DEEPSEEK_KEY_HEADER = "x-deepseek-api-key";
const AI_PROMPT_HEADER = "x-ai-prompt-b64";
const COMPETITOR_PROMPT_HEADER = "x-competitor-prompt-b64";

function openBrowser(url) {
  if (typeof process === "undefined") return;
  const platform = process.platform;
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function normalizeAsin(value) {
  return String(value || "").trim().toUpperCase();
}

function requestHeader(request, name) {
  return String(request.headers[name] || "").trim();
}

function sanitizeSessionId(value) {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return normalized || DEFAULT_SESSION_ID;
}

function sessionIdFromRequest(request) {
  return sanitizeSessionId(requestHeader(request, SESSION_HEADER));
}

function decodeBase64Header(request, name) {
  const value = requestHeader(request, name);
  if (!value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

function sheetSearchText(sheet) {
  return [
    sheet.name,
    ...(sheet.headers || []),
    ...(sheet.rows || []).slice(0, 10).flat()
  ].filter((value) => value !== null && value !== undefined).map((value) => String(value)).join(" ");
}

function inferKeywordTargetAsin(run, sheet, filename = "") {
  const knownAsins = (run.items || []).map((item) => normalizeAsin(item.asin)).filter(Boolean);
  const candidates = [
    filename,
    sheetSearchText(sheet)
  ].map((value) => normalizeAsin(value));

  for (const text of candidates) {
    const matched = knownAsins.find((asin) => text.includes(asin));
    if (matched) return matched;
  }
  return "";
}

async function serveStatic(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join("src/client", relative));
  const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    })
    .pipe(response);
}

export function createAppServer(options = {}) {
  const storageDir = options.storageDir || "data";
  const storages = new Map();
  const latestRuns = new Map();
  const configuredDeepseekApiKey = Object.prototype.hasOwnProperty.call(options, "deepseekApiKey")
    ? String(options.deepseekApiKey || "").trim()
    : String(typeof process !== "undefined" ? process.env.DEEPSEEK_API_KEY || "" : "").trim();
  const fetchImpl = options.fetch || fetch;

  function storageForSession(sessionId) {
    if (!storages.has(sessionId)) {
      const sessionStorageDir = sessionId === DEFAULT_SESSION_ID ? storageDir : join(storageDir, "sessions", sessionId);
      storages.set(sessionId, createStorage(sessionStorageDir));
    }
    return storages.get(sessionId);
  }

  async function getCurrentRun(request) {
    const sessionId = sessionIdFromRequest(request);
    if (!latestRuns.has(sessionId)) {
      latestRuns.set(sessionId, await storageForSession(sessionId).getLatestRun());
    }
    return latestRuns.get(sessionId);
  }

  async function saveCurrentRun(request, run) {
    const sessionId = sessionIdFromRequest(request);
    const saved = await storageForSession(sessionId).saveRun(run);
    latestRuns.set(sessionId, saved);
    return saved;
  }

  async function getDeepSeekCredential(request) {
    const aiConfig = await loadAiConfig(storageDir);
    const requestApiKey = requestHeader(request, DEEPSEEK_KEY_HEADER);
    const requestPrompt = decodeBase64Header(request, AI_PROMPT_HEADER);
    const requestCompetitorPrompt = decodeBase64Header(request, COMPETITOR_PROMPT_HEADER);
    const requestAiConfig = {
      ...aiConfig,
      prompt: requestPrompt || aiConfig.prompt,
      competitorPrompt: requestCompetitorPrompt || aiConfig.competitorPrompt
    };
    if (requestApiKey) {
      return { apiKey: requestApiKey, source: "request", aiConfig: requestAiConfig };
    }
    if (configuredDeepseekApiKey) {
      return { apiKey: configuredDeepseekApiKey, source: "environment", aiConfig: requestAiConfig };
    }
    if (aiConfig.deepseekApiKey) {
      return { apiKey: aiConfig.deepseekApiKey, source: "local_config", aiConfig: requestAiConfig };
    }
    return { apiKey: "", source: "none", aiConfig: requestAiConfig };
  }

  async function importKeywordWorkbook(request, url, response, options = {}) {
    const currentRun = await getCurrentRun(request);
    if (!currentRun) {
      sendJson(response, 400, { error: "Please import a product workbook before importing keyword data." });
      return;
    }
    const body = await readBody(request);
    const workbook = readWorkbook(body);
    const sheet = workbook.sheets[0];
    const explicitTargetAsin = url.searchParams.get("asin") || options.targetAsin || "";
    const filename = url.searchParams.get("filename") || "";
    const targetAsin = normalizeAsin(explicitTargetAsin) || inferKeywordTargetAsin(currentRun, sheet, filename);
    const sifResult = normalizeSifKeywords(sheet, { targetAsin });
    if (sifResult.records.length === 0) {
      const error = targetAsin
        ? "关键词数据导入失败：没有识别到关键词行，请确认文件包含关键词列。"
        : "关键词数据导入失败：无法从文件名或表格内容识别 ASIN。请把 ASIN 放在文件名里，或使用单个 ASIN 行后的“导入关键词数据”。";
      sendJson(response, 400, { error });
      return;
    }
    const latestRun = await saveCurrentRun(request, mergeSifIntoRun(currentRun, sifResult, { targetAsin }));
    sendJson(response, 200, latestRun);
  }

  async function analyzeCompetitors(request, item, competitorResult) {
    const credential = await getDeepSeekCredential(request);
    let aiAnalysis = null;
    let aiStatus;
    if (!credential.apiKey) {
      aiStatus = {
        status: "skipped",
        reason: "DeepSeek API Key is not configured.",
        createdAt: new Date().toISOString()
      };
    } else {
      try {
        aiAnalysis = await summarizeCompetitorsWithDeepSeek(item, competitorResult, {
          apiKey: credential.apiKey,
          fetch: fetchImpl,
          prompt: credential.aiConfig.competitorPrompt
        });
        aiStatus = {
          status: "completed",
          provider: "deepseek",
          source: credential.source,
          createdAt: new Date().toISOString()
        };
      } catch (error) {
        aiStatus = {
          status: "failed",
          provider: "deepseek",
          source: credential.source,
          error: error.message,
          createdAt: new Date().toISOString()
        };
      }
    }
    return { aiAnalysis, aiStatus };
  }

  async function importCompetitorWorkbook(request, url, response) {
    const currentRun = await getCurrentRun(request);
    if (!currentRun) {
      sendJson(response, 400, { error: "Please import a product workbook before importing competitor data." });
      return;
    }
    const targetAsin = normalizeAsin(url.searchParams.get("asin") || "");
    if (!targetAsin) {
      sendJson(response, 400, { error: "ASIN is required for competitor import." });
      return;
    }
    const item = (currentRun.items || []).find((entry) => normalizeAsin(entry.asin) === targetAsin);
    if (!item) {
      sendJson(response, 404, { error: `ASIN not found: ${targetAsin}` });
      return;
    }

    const body = await readBody(request);
    const workbook = readWorkbook(body);
    const sheet = workbook.sheets[0];
    const competitorResult = normalizeCompetitors(sheet);
    if (competitorResult.records.length === 0) {
      sendJson(response, 400, { error: "竞品数据导入失败：没有识别到竞品行，请确认表格包含 I/J/U/V/AA/AM 列数据。" });
      return;
    }

    const { aiAnalysis, aiStatus } = await analyzeCompetitors(request, item, competitorResult);

    const latestRun = await saveCurrentRun(request, mergeCompetitorsIntoRun(currentRun, targetAsin, competitorResult, { aiAnalysis, aiStatus }));
    sendJson(response, 200, latestRun);
  }

  async function rerunCompetitorAi(request, url, response) {
    const currentRun = await getCurrentRun(request);
    if (!currentRun) {
      sendJson(response, 400, { error: "Please import a product workbook before requesting competitor AI analysis." });
      return;
    }
    const targetAsin = normalizeAsin(url.searchParams.get("asin") || "");
    if (!targetAsin) {
      sendJson(response, 400, { error: "ASIN is required for competitor AI analysis." });
      return;
    }
    const item = (currentRun.items || []).find((entry) => normalizeAsin(entry.asin) === targetAsin);
    if (!item) {
      sendJson(response, 404, { error: `ASIN not found: ${targetAsin}` });
      return;
    }
    if (!item.competitors?.records?.length) {
      sendJson(response, 400, { error: "Please import competitor data for this ASIN before requesting competitor AI analysis." });
      return;
    }
    const competitorResult = {
      records: item.competitors.records,
      summary: item.competitors.summary || {}
    };
    const { aiAnalysis, aiStatus } = await analyzeCompetitors(request, item, competitorResult);
    const latestRun = await saveCurrentRun(request, mergeCompetitorsIntoRun(currentRun, targetAsin, competitorResult, { aiAnalysis, aiStatus }));
    sendJson(response, 200, latestRun);
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/api/rules") {
        sendJson(response, 200, DEFAULT_RULES);
        return;
      }

      if (request.method === "GET" && pathname === "/api/deepseek-status") {
        const credential = await getDeepSeekCredential(request);
        sendJson(response, 200, {
          provider: "deepseek",
          configured: Boolean(credential.apiKey),
          source: credential.source,
          keyPreview: maskDeepSeekKey(credential.apiKey)
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/ai-config") {
        sendJson(response, 200, publicAiConfig(await loadAiConfig(storageDir)));
        return;
      }

      if (request.method === "PUT" && pathname === "/api/ai-config") {
        const body = await readBody(request);
        const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
        sendJson(response, 200, publicAiConfig(await saveAiConfig(storageDir, payload)));
        return;
      }

      if (request.method === "POST" && pathname === "/api/deepseek-test") {
        const credential = await getDeepSeekCredential(request);
        if (!credential.apiKey) {
          sendJson(response, 400, { error: "DeepSeek API Key is not configured. Save a key in AI config first." });
          return;
        }
        const result = await testDeepSeekKey(credential.apiKey, { fetch: fetchImpl });
        sendJson(response, 200, {
          provider: "deepseek",
          configured: true,
          source: credential.source,
          keyPreview: maskDeepSeekKey(credential.apiKey),
          ...result
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/analyze") {
        const body = await readBody(request);
        const workbook = readWorkbook(body);
        const sheet = workbook.sheets[0];
        const normalized = normalizeProducts(sheet);
        const analysis = analyzeProducts(normalized.products, DEFAULT_RULES);
        const latestRun = await saveCurrentRun(request, { ...analysis, importInfo: { sheetName: sheet.name, missingRequiredFields: normalized.missingRequiredFields } });
        sendJson(response, 200, latestRun);
        return;
      }

      if (request.method === "POST" && pathname === "/api/import-sif") {
        await importKeywordWorkbook(request, url, response, { targetAsin: url.searchParams.get("asin") || "" });
        return;
      }

      if (request.method === "POST" && pathname === "/api/import-keywords") {
        await importKeywordWorkbook(request, url, response);
        return;
      }

      if (request.method === "POST" && pathname === "/api/import-competitors") {
        await importCompetitorWorkbook(request, url, response);
        return;
      }

      if (request.method === "POST" && pathname === "/api/competitor-ai-analysis") {
        await rerunCompetitorAi(request, url, response);
        return;
      }

      if (request.method === "POST" && pathname === "/api/ai-summary") {
        const currentRun = await getCurrentRun(request);
        if (!currentRun) {
          sendJson(response, 400, { error: "Please import a product workbook before requesting an AI summary." });
          return;
        }
        const asin = url.searchParams.get("asin") || "";
        const item = currentRun.items.find((entry) => entry.asin === asin);
        if (!item) {
          sendJson(response, 404, { error: `ASIN not found: ${asin}` });
          return;
        }
        const credential = await getDeepSeekCredential(request);
        if (!credential.apiKey) {
          sendJson(response, 400, { error: "DeepSeek API Key is not configured. Save a key in AI config or set DEEPSEEK_API_KEY before starting the server." });
          return;
        }
        const summary = await summarizeAsinWithDeepSeek(item, { apiKey: credential.apiKey, fetch: fetchImpl, prompt: credential.aiConfig.prompt });
        const latestRun = await saveCurrentRun(request, attachAiSummaryToRun(currentRun, asin, summary));
        sendJson(response, 200, latestRun);
        return;
      }

      if (request.method === "GET" && pathname === "/api/latest-run") {
        const run = await getCurrentRun(request);
        if (!run) {
          response.writeHead(204);
          response.end();
          return;
        }
        sendJson(response, 200, run);
        return;
      }

      if (request.method === "GET" && pathname === "/api/export.csv") {
        const run = await getCurrentRun(request) || { items: [] };
        response.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=screening-results.csv" });
        response.end(toCsv(run.items));
        return;
      }

      if (request.method === "GET" && pathname === "/api/report.md") {
        const run = await getCurrentRun(request) || { summary: {}, items: [] };
        response.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "content-disposition": "attachment; filename=screening-report.md" });
        response.end(toMarkdownReport(run.summary, run.items));
        return;
      }

      await serveStatic(request, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

export function isMainModule(metaUrl, argvPath) {
  if (!argvPath) return false;
  return normalize(fileURLToPath(metaUrl)) === normalize(resolve(argvPath));
}

export function resolveListenHost(env = {}) {
  if (env.HOST) return env.HOST;
  return env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
}

if (typeof process !== "undefined" && isMainModule(import.meta.url, process.argv[1])) {
  const port = Number(process.env.PORT || 4173);
  const host = resolveListenHost(process.env);
  createAppServer().listen(port, host, () => {
    const browserHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    const url = `http://${browserHost}:${port}`;
    console.log(`Server running at ${url}`);
    if (process.env.OPEN_BROWSER === "1") openBrowser(url);
  });
}
