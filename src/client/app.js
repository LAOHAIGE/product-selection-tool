const state = {
  sessionId: getOrCreateSessionId(),
  run: null,
  selected: null,
  filter: "all",
  pendingSifAsin: null,
  pendingCompetitorAsin: null,
  deepseek: null,
  aiConfig: null,
  activeAnalysisTab: "detail"
};

const SESSION_STORAGE_KEY = "product-selection-session-id";
const AI_CONFIG_STORAGE_KEY = "product-selection-ai-config";

function getOrCreateSessionId() {
  try {
    const existing = localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function sessionHeaders() {
  return { "x-selection-session-id": state.sessionId };
}

function maskDeepSeekKey(key) {
  const value = String(key || "").trim();
  if (!value) return "";
  const prefix = value.startsWith("sk-") ? "sk-" : "";
  return `${prefix}****${value.slice(-4)}`;
}

function readLocalAiConfig() {
  try {
    return JSON.parse(localStorage.getItem(AI_CONFIG_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalAiConfig(config) {
  localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function mergeAiConfig(serverConfig = {}, localConfig = {}) {
  const prompt = localConfig.prompt || serverConfig.prompt || "";
  const competitorPrompt = localConfig.competitorPrompt || serverConfig.competitorPrompt || "";
  const deepseekApiKey = localConfig.deepseekApiKey || "";
  return {
    ...serverConfig,
    prompt,
    competitorPrompt,
    isDefault: prompt === serverConfig.prompt ? Boolean(serverConfig.isDefault) : false,
    competitorPromptIsDefault: competitorPrompt === serverConfig.competitorPrompt ? Boolean(serverConfig.competitorPromptIsDefault) : false,
    deepseekKeyConfigured: Boolean(deepseekApiKey || serverConfig.deepseekKeyConfigured),
    deepseekKeyPreview: deepseekApiKey ? maskDeepSeekKey(deepseekApiKey) : serverConfig.deepseekKeyPreview,
    deepseekKeySource: deepseekApiKey ? "browser" : serverConfig.deepseekKeySource
  };
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function deepseekRequestHeaders(kind = "") {
  const localConfig = readLocalAiConfig();
  const config = state.aiConfig || {};
  const headers = sessionHeaders();
  if (localConfig.deepseekApiKey) {
    headers["x-deepseek-api-key"] = localConfig.deepseekApiKey;
  }
  if (kind === "asin" && config.prompt) {
    headers["x-ai-prompt-b64"] = base64Utf8(config.prompt);
  }
  if (kind === "competitor" && config.competitorPrompt) {
    headers["x-competitor-prompt-b64"] = base64Utf8(config.competitorPrompt);
  }
  return headers;
}

const statusLabels = {
  strong_candidate: "强候选",
  observation_candidate: "观察候选",
  manual_review: "人工复核",
  rejected: "淘汰",
  insufficient_data: "数据不足"
};

function metric(label, value) {
  return `<div class="metric"><div class="label">${label}</div><div class="value">${value ?? 0}</div></div>`;
}

function amazonProductUrl(asin) {
  return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
}

function renderSummary(summary = {}) {
  document.querySelector("#summary").innerHTML = [
    metric("导入 ASIN", summary.total),
    metric("强候选", summary.strongCandidate),
    metric("观察候选", summary.observationCandidate),
    metric("人工复核", summary.manualReview),
    metric("数据不足", summary.insufficientData)
  ].join("");
}

function renderNextSteps(summary = {}) {
  const message = document.querySelector("#nextStepMessage");
  const sifStatus = document.querySelector("#sifStatus");
  const hasRun = Boolean(state.run);
  const sif = state.run?.importInfo?.sif;
  const enrichedCount = state.run?.items?.filter((item) => item.sif).length ?? 0;
  const strong = summary.strongCandidate ?? 0;
  const manual = summary.manualReview ?? 0;
  const missing = summary.insufficientData ?? 0;

  message.textContent = hasRun
    ? `二轮目标：先复核 ${strong} 个强候选，再处理 ${manual} 个人工复核；${missing} 个数据不足产品进入补数清单。`
    : "导入产品表后，这里会生成下一轮动作。";
  const sifText = sif
    ? `最近关键词数据导入：${sif.targetAsin || "未指定 ASIN"}，${sif.keywordRows} 行关键词；当前已补关键词数据的 ASIN：${enrichedCount} 个。`
    : "关键词数据未导入。";
  const deepseekText = state.deepseek
    ? `DeepSeek：${state.deepseek.configured ? "已接入" : "未配置 API Key"}`
    : "DeepSeek：检测中";
  sifStatus.textContent = `${sifText} ${deepseekText}`;

  document.querySelectorAll("[data-step-action], [data-run-required]").forEach((button) => {
    button.disabled = !hasRun;
    button.classList.toggle("disabled", !hasRun);
  });
}

function filteredItems() {
  const items = state.run?.items ?? [];
  const filtered = state.filter === "all" ? items : items.filter((item) => item.status === state.filter);
  return [...filtered].sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1));
}

function syncFilterControls() {
  const filter = document.querySelector("#statusFilter");
  if (filter) filter.value = state.filter;
}

function syncAnalysisTabs() {
  document.querySelectorAll("[data-analysis-tab]").forEach((button) => {
    const active = button.dataset.analysisTab === state.activeAnalysisTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-analysis-panel]").forEach((panel) => {
    const active = panel.dataset.analysisPanel === state.activeAnalysisTab;
    panel.classList.toggle("active", active);
  });
}

function setAnalysisTab(tab) {
  const allowed = new Set(["detail", "ai", "competitor"]);
  state.activeAnalysisTab = allowed.has(tab) ? tab : "detail";
  syncAnalysisTabs();
}

function renderCandidates() {
  const aiReady = Boolean(state.deepseek?.configured || state.aiConfig?.deepseekKeyConfigured);
  const rows = filteredItems().map((item) => `
    <tr data-asin="${item.asin}" class="${state.selected?.asin === item.asin ? "selected" : ""}">
      <td>
        <div class="asin-cell">
          <a class="asin-link" href="${amazonProductUrl(item.asin)}" target="_blank" rel="noopener noreferrer">${item.asin}</a>
          <button class="row-action ${item.sif ? "done" : ""}" type="button" data-sif-asin="${item.asin}">${item.sif ? "更新关键词数据" : "导入关键词数据"}</button>
          <button class="row-action ${item.competitors ? "done" : ""}" type="button" data-competitor-asin="${item.asin}">${item.competitors ? "更新竞品数据" : "导入竞品数据"}</button>
          <button class="row-action ${item.aiSummary ? "done" : ""}" type="button" data-ai-asin="${item.asin}" ${aiReady ? "" : "disabled"} title="${aiReady ? "用 DeepSeek 分析该 ASIN" : "DeepSeek API Key 未配置"}">${item.aiSummary ? "更新总结" : "AI 总结"}</button>
        </div>
      </td>
      <td>
        <strong>${item.title || ""}</strong><br>
        <span class="muted">${item.brand || ""} · ${item.smallCategory || ""}</span>
      </td>
      <td>${item.monthlySales ?? ""}</td>
      <td>${item.price === null || item.price === undefined ? "" : `$${item.price}`}</td>
      <td class="score">${item.opportunityScore ?? ""}</td>
      <td class="risk">${item.riskScore ?? ""}</td>
      <td class="status ${item.status}">${statusLabels[item.status] ?? item.status}</td>
    </tr>
  `);
  document.querySelector("#candidateTable").innerHTML = rows.join("");
}

function applyStatusFilter(filter) {
  state.filter = filter;
  refreshFilteredSelection({ scroll: true, preferSelected: false });
}

function refreshFilteredSelection(options = {}) {
  const items = filteredItems();
  if (!options.preferSelected || !items.some((item) => item.asin === state.selected?.asin)) {
    state.selected = items[0] ?? null;
  }
  syncFilterControls();
  renderCandidates();
  renderDetail(state.selected);
  renderAiPanel(state.selected);
  renderCompetitorAiPanel(state.selected);
  if (options.scroll) {
    document.querySelector(".workspace").scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function renderList(title, values) {
  if (!values || values.length === 0) return "";
  return `<h3>${title}</h3><ul class="reason-list">${values.map((value) => `<li>${value}</li>`).join("")}</ul>`;
}

function formatPlainNumber(value) {
  return value === null || value === undefined ? "未知" : String(value);
}

function formatMoney(value) {
  return value === null || value === undefined ? "未知" : `$${value}`;
}

function formatRange(min, max, formatter = formatPlainNumber) {
  if (min === null || min === undefined) return "未知";
  if (max === null || max === undefined || max === min) return formatter(min);
  return `${formatter(min)} - ${formatter(max)}`;
}

function renderCompetitorSummary(item) {
  const competitors = item?.competitors;
  if (!competitors) return "";
  const summary = competitors.summary || {};
  const status = competitors.aiStatus;
  const statusText = status?.status === "completed"
    ? "AI 竞品分析已完成。"
    : status?.status === "skipped"
      ? "AI 分析未执行：DeepSeek Key 未配置。"
      : status?.status === "failed"
        ? `AI 竞品分析失败：${status.error || "未知错误"}`
        : "";
  return `
    <h3>竞品数据概览</h3>
    <p>竞品数量：<strong>${summary.totalCompetitors ?? competitors.records?.length ?? 0}</strong></p>
    <p>价格区间：<strong>${formatRange(summary.priceMin, summary.priceMax, formatMoney)}</strong></p>
    <p>销量区间：<strong>${formatRange(summary.monthlySalesMin, summary.monthlySalesMax)}</strong></p>
    <p>增长竞品：<strong>${summary.growingCount ?? 0}</strong> 个 · 老品：<strong>${summary.oldListingCount ?? 0}</strong> 个</p>
    ${statusText ? `<p class="muted">${statusText}</p>` : ""}
  `;
}

function renderSifStandardPoints(item) {
  const points = item?.sif?.analysis?.standardPoints;
  if (!points || points.length === 0) return "";
  const rows = points.map((point) => `
    <li class="sif-point ${point.status}">
      <span class="sif-point-name">${point.point}. ${point.name}</span>
      <strong>${point.value}</strong>
      <span>${point.conclusion}</span>
    </li>
  `).join("");
  const keywords = item.sif.analysis.top10NonBrandExactTrafficKeywords || [];
  return `
    <h3>关键词数据第 6-10 点分析</h3>
    <ul class="sif-points">${rows}</ul>
    ${keywords.length ? `<p class="muted">前10非品牌精准词：${keywords.join("、")}</p>` : ""}
  `;
}

function renderProductStandardPoints(item) {
  const points = item?.selectionAnalysis?.standardPoints;
  if (!points || points.length === 0) return "";
  const rows = points.map((point) => `
    <li class="sif-point ${point.status}">
      <span class="sif-point-name">${point.point}. ${point.name}</span>
      <strong>${point.value}</strong>
      <span>${point.conclusion}</span>
    </li>
  `).join("");
  return `
    <h3>第一部分第 1-5 点分析</h3>
    <ul class="sif-points">${rows}</ul>
  `;
}

function renderAiSummary(item) {
  const summary = item?.aiSummary;
  if (!summary) return "";
  return `
    ${renderList("优点", summary.advantages)}
    ${renderList("缺点", summary.disadvantages)}
    ${renderList("风险", summary.risks)}
    ${summary.strategy ? `<p><strong>打法建议：</strong>${summary.strategy}</p>` : ""}
    ${summary.recommendation ? `<p><strong>结论：</strong>${summary.recommendation}</p>` : ""}
  `;
}

function renderCompetitorGroups(groups) {
  if (!groups || groups.length === 0) return "";
  return `
    <h3>竞品分类</h3>
    <ul class="reason-list">
      ${groups.map((group) => `<li><strong>${group.name || "未命名分类"}</strong>：${group.formula || "配方未说明"} · ${group.priceBand || "价格带未说明"}${group.notes ? ` · ${group.notes}` : ""}</li>`).join("")}
    </ul>
  `;
}

function renderCompetitorAiAnalysis(item) {
  const competitors = item?.competitors;
  if (!competitors) return "";
  const analysis = competitors.aiAnalysis;
  const status = competitors.aiStatus;
  const isRunning = status?.status === "running";
  const action = `<button class="row-action" type="button" data-competitor-ai-asin="${item.asin}" ${isRunning ? "disabled" : ""}>${isRunning ? "正在分析竞品" : "重新分析竞品"}</button>`;
  if (!analysis) {
    const message = status?.status === "running"
      ? "正在调用 DeepSeek 重新分析竞品，请稍候..."
      : status?.status === "skipped"
      ? "竞品数据已导入，DeepSeek Key 未配置，未执行 AI 竞品分析。"
      : status?.status === "failed"
        ? `竞品数据已导入，但 AI 竞品分析失败：${status.error || "未知错误"}`
        : "竞品数据已导入，尚未生成 AI 竞品分析。";
    return `<h3>竞品 AI 分析</h3><p class="muted">${message}</p>${action}`;
  }
  return `
    <h3>竞品 AI 分析</h3>
    ${action}
    ${renderList("价格差异原因", analysis.priceDifferenceReasons)}
    ${renderCompetitorGroups(analysis.competitorGroups)}
    ${renderList("畅销类型", analysis.bestSellingTypes)}
    ${renderList("高价类型", analysis.premiumTypes)}
    ${renderList("增长类型", analysis.growingTypes)}
    ${renderList("老品类型", analysis.oldListingTypes)}
    ${analysis.recommendedFormula ? `<p><strong>建议配方：</strong>${analysis.recommendedFormula}</p>` : ""}
    ${analysis.recommendedPriceBand ? `<p><strong>建议价格带：</strong>${analysis.recommendedPriceBand}</p>` : ""}
    ${analysis.strategy ? `<p><strong>竞品打法建议：</strong>${analysis.strategy}</p>` : ""}
  `;
}

function renderAiPanel(item) {
  const panel = document.querySelector("#aiPanel");
  if (!panel) return;
  if (!item) {
    panel.innerHTML = `<h2>AI 分析</h2><p class="muted">选择 ASIN 后点击 AI 总结，这里会显示 DeepSeek 的结论和打法。</p>`;
    return;
  }
  const promptHint = state.aiConfig?.isDefault === false ? "当前使用你保存的 AI 规则。" : "当前使用默认 AI 规则。";
  panel.innerHTML = `
    <h2>AI 分析</h2>
    <p><strong>${item.asin}</strong></p>
    <p class="muted">${promptHint}</p>
    ${item.aiSummary ? renderAiSummary(item) : `<p class="muted">还没有 AI 总结。点击候选池里的 AI 总结按钮生成。</p>`}
  `;
}

function renderDetail(item) {
  const panel = document.querySelector("#detailPanel");
  if (!item) {
    panel.innerHTML = `<h2>ASIN 详情</h2><p class="muted">选择一条候选记录查看原因。</p>`;
    return;
  }
  panel.innerHTML = `
    <h2><a class="asin-link" href="${amazonProductUrl(item.asin)}" target="_blank" rel="noopener noreferrer">${item.asin}</a></h2>
    <p><strong>${item.title || ""}</strong></p>
    <p class="muted">${item.brand || ""} · ${item.smallCategory || ""}</p>
    <p>机会分：<strong>${item.opportunityScore ?? ""}</strong> · 风险分：<strong>${item.riskScore ?? ""}</strong></p>
    ${item.sif ? `<p>关键词数据：<strong>${item.sif.keywordCount}</strong> 个关键词 · 非品牌词 <strong>${item.sif.nonBrandExactKeywords.length}</strong> 个 · 搜索量 <strong>${item.sif.totalSearchVolume}</strong></p>` : ""}
    <p>结论：<strong class="${item.status}">${statusLabels[item.status] ?? item.status}</strong></p>
    ${renderProductStandardPoints(item)}
    ${renderSifStandardPoints(item)}
    ${renderList("通过原因", item.passReasons)}
    ${renderList("淘汰原因", item.rejectionReasons)}
    ${renderList("保留原因", item.retentionReasons)}
    ${renderList("缺失数据", item.missingData)}
  `;
}

function renderCompetitorAiPanel(item) {
  const panel = document.querySelector("#competitorAiPanel");
  if (!panel) return;
  if (!item) {
    panel.innerHTML = `<h2>竞品分析</h2><p class="muted">选择 ASIN 后导入竞品数据，这里会显示竞品概览和 DeepSeek 分析。</p>`;
    return;
  }
  const promptHint = state.aiConfig?.competitorPromptIsDefault === false
    ? "当前使用你保存的竞品分析规则。"
    : "当前使用默认竞品分析规则。";
  if (!item.competitors) {
    panel.innerHTML = `
      <h2>竞品分析</h2>
      <p><strong>${item.asin}</strong></p>
      <p class="muted">${promptHint}</p>
      <p class="muted">还没有导入竞品数据。点击候选池该 ASIN 后面的“导入竞品数据”按钮上传表格。</p>
    `;
    return;
  }
  panel.innerHTML = `
    <h2>竞品分析</h2>
    <p><strong>${item.asin}</strong></p>
    <p class="muted">${promptHint}</p>
    ${renderCompetitorSummary(item)}
    ${renderCompetitorAiAnalysis(item)}
  `;
}

async function analyzeFile(file) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { ...sessionHeaders(), "content-type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: await file.arrayBuffer()
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  hydrateRun(await response.json());
}

async function importKeywordFile(file, asin = "", options = {}) {
  const params = new URLSearchParams();
  if (asin) params.set("asin", asin);
  if (file.name) params.set("filename", file.name);
  const response = await fetch(`/api/import-keywords?${params.toString()}`, {
    method: "POST",
    headers: { ...sessionHeaders(), "content-type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: await file.arrayBuffer()
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  const run = await response.json();
  const selectedAsin = asin || run.importInfo?.sif?.targetAsin || state.selected?.asin || "";
  hydrateRun(run, selectedAsin, { resetFilters: false, ...options });
  return run;
}

async function importKeywordFiles(files) {
  if (!state.run) throw new Error("请先导入产品表。");
  const fileList = Array.from(files || []);
  if (fileList.length === 0) return;
  const status = document.querySelector("#sifStatus");
  let success = 0;
  const failures = [];
  for (const file of fileList) {
    if (status) status.textContent = `正在导入关键词数据：${success + failures.length + 1}/${fileList.length}（${file.name}）`;
    try {
      await importKeywordFile(file, "", { resetFilters: false });
      success += 1;
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }
  renderNextSteps(state.run?.summary);
  if (status) {
    status.textContent = failures.length
      ? `关键词数据批量导入完成：成功 ${success} 个，失败 ${failures.length} 个。${failures.slice(0, 2).join("；")}`
      : `关键词数据批量导入完成：成功 ${success} 个文件。`;
  }
  if (failures.length) {
    document.querySelector("#detailPanel").innerHTML = `<h2>关键词数据导入结果</h2><p class="muted">成功 ${success} 个，失败 ${failures.length} 个。</p><ul class="reason-list">${failures.map((failure) => `<li>${failure}</li>`).join("")}</ul>`;
  }
}

async function importCompetitorFile(file, asin) {
  if (!state.run) throw new Error("请先导入产品表。");
  if (!asin) throw new Error("请先从某个 ASIN 行点击导入竞品数据。");
  const params = new URLSearchParams({ asin });
  const response = await fetch(`/api/import-competitors?${params.toString()}`, {
    method: "POST",
    headers: { ...deepseekRequestHeaders("competitor"), "content-type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: await file.arrayBuffer()
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  const run = await response.json();
  hydrateRun(run, asin, { resetFilters: false });
  return run;
}

async function rerunCompetitorAi(asin) {
  if (!state.run) throw new Error("请先导入产品表。");
  if (!asin) throw new Error("请先选择一个 ASIN。");
  const response = await fetch(`/api/competitor-ai-analysis?asin=${encodeURIComponent(asin)}`, { method: "POST", headers: deepseekRequestHeaders("competitor") });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  hydrateRun(await response.json(), asin, { resetFilters: false });
}

async function summarizeAsin(asin) {
  const response = await fetch(`/api/ai-summary?asin=${encodeURIComponent(asin)}`, { method: "POST", headers: deepseekRequestHeaders("asin") });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  hydrateRun(await response.json(), asin);
}

function renderDeepSeekKeyStatus(message = "") {
  const status = document.querySelector("#deepseekKeyStatus");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  const deepseek = state.deepseek;
  const config = state.aiConfig;
  const configured = Boolean(deepseek?.configured || config?.deepseekKeyConfigured);
  if (!configured) {
    status.textContent = "DeepSeek Key：未配置。";
    return;
  }
  const preview = deepseek?.keyPreview || config?.deepseekKeyPreview || "";
  const source = deepseek?.source === "environment" ? "环境变量" : "页面配置";
  status.textContent = `DeepSeek Key：已配置${preview ? `（${preview}）` : ""}，来源：${source}。`;
}

async function loadAiConfig() {
  const response = await fetch("/api/ai-config");
  if (!response.ok) return;
  state.aiConfig = mergeAiConfig(await response.json(), readLocalAiConfig());
  const input = document.querySelector("#aiPromptInput");
  const competitorInput = document.querySelector("#competitorPromptInput");
  const keyInput = document.querySelector("#deepseekKeyInput");
  const status = document.querySelector("#aiConfigStatus");
  if (input) input.value = state.aiConfig.prompt || "";
  if (competitorInput) competitorInput.value = state.aiConfig.competitorPrompt || "";
  if (keyInput) keyInput.value = "";
  if (status) {
    const asinRule = state.aiConfig.isDefault ? "ASIN 总结使用默认规则" : "ASIN 总结使用已保存规则";
    const competitorRule = state.aiConfig.competitorPromptIsDefault ? "竞品分析使用默认规则" : "竞品分析使用已保存规则";
    status.textContent = `${asinRule}；${competitorRule}。`;
  }
  renderDeepSeekKeyStatus();
  renderAiPanel(state.selected);
  renderCompetitorAiPanel(state.selected);
  renderCandidates();
}

async function saveAiConfig(options = {}) {
  const input = document.querySelector("#aiPromptInput");
  const competitorInput = document.querySelector("#competitorPromptInput");
  const keyInput = document.querySelector("#deepseekKeyInput");
  const status = document.querySelector("#aiConfigStatus");
  const prompt = input?.value || "";
  const competitorPrompt = competitorInput?.value || "";
  const deepseekApiKey = keyInput?.value.trim() || "";
  const existing = readLocalAiConfig();
  const savedLocalConfig = {
    ...existing,
    prompt,
    competitorPrompt,
    deepseekApiKey: deepseekApiKey || existing.deepseekApiKey || "",
    updatedAt: new Date().toISOString()
  };
  if (status && options.reportStatus !== false) status.textContent = "正在保存 AI 配置...";
  writeLocalAiConfig(savedLocalConfig);
  state.aiConfig = mergeAiConfig(state.aiConfig || {}, savedLocalConfig);
  if (state.aiConfig.deepseekKeyConfigured) {
    state.deepseek = {
      provider: "deepseek",
      configured: true,
      source: "browser",
      keyPreview: state.aiConfig.deepseekKeyPreview
    };
  }
  if (input) input.value = state.aiConfig.prompt || "";
  if (competitorInput) competitorInput.value = state.aiConfig.competitorPrompt || "";
  if (keyInput) keyInput.value = "";
  if (status && options.reportStatus !== false) status.textContent = "AI 配置已保存，之后的 ASIN 总结和竞品分析会按新规则执行。";
  renderDeepSeekKeyStatus();
  renderNextSteps(state.run?.summary);
  renderAiPanel(state.selected);
  renderCompetitorAiPanel(state.selected);
  renderCandidates();
  return state.aiConfig;
}

async function testDeepSeekKey() {
  const keyInput = document.querySelector("#deepseekKeyInput");
  const pendingKey = keyInput?.value.trim() || "";
  renderDeepSeekKeyStatus("正在测试 DeepSeek Key...");
  if (pendingKey) {
    await saveAiConfig({ reportStatus: false });
  }
  const response = await fetch("/api/deepseek-test", { method: "POST", headers: deepseekRequestHeaders() });
  const json = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) throw new Error(json.error || response.statusText);
  state.deepseek = json;
  renderDeepSeekKeyStatus("DeepSeek Key 测试成功，可以用于 AI 总结。");
  renderNextSteps(state.run?.summary);
  renderCandidates();
}

async function loadDeepSeekStatus() {
  const response = await fetch("/api/deepseek-status", { headers: sessionHeaders() });
  if (!response.ok) return;
  const serverStatus = await response.json();
  const localConfig = readLocalAiConfig();
  state.deepseek = localConfig.deepseekApiKey
    ? { ...serverStatus, configured: true, source: "browser", keyPreview: maskDeepSeekKey(localConfig.deepseekApiKey) }
    : serverStatus;
  renderDeepSeekKeyStatus();
  renderNextSteps(state.run?.summary);
  renderCandidates();
}

function hydrateRun(run, selectedAsin = null, options = {}) {
  state.run = run;
  const resetFilters = options.resetFilters ?? !selectedAsin;
  if (resetFilters) {
    state.filter = "all";
  }
  const selectedItem = selectedAsin ? state.run.items.find((item) => item.asin === selectedAsin) : null;
  state.selected = selectedItem ?? filteredItems()[0] ?? state.run.items[0] ?? null;
  syncFilterControls();
  renderSummary(state.run.summary);
  renderNextSteps(state.run.summary);
  renderCandidates();
  renderDetail(state.selected);
  renderAiPanel(state.selected);
  renderCompetitorAiPanel(state.selected);
}

async function loadLatestRun() {
  const response = await fetch("/api/latest-run", { headers: sessionHeaders() });
  if (response.status === 204) return;
  if (!response.ok) return;
  hydrateRun(await response.json());
}

async function downloadFromApi(path, filename) {
  const response = await fetch(path, { headers: sessionHeaders() });
  if (!response.ok) throw new Error(response.statusText);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.querySelector("#fileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await analyzeFile(file);
  } catch (error) {
    document.querySelector("#detailPanel").innerHTML = `<h2>导入失败</h2><p class="muted">${error.message}</p>`;
  }
});

document.querySelector("#sifFileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  const asin = state.pendingSifAsin;
  event.target.value = "";
  if (!file) return;
  try {
    if (!asin) throw new Error("请先从某个 ASIN 行点击导入关键词数据。");
    await importKeywordFile(file, asin);
  } catch (error) {
    document.querySelector("#detailPanel").innerHTML = `<h2>关键词数据导入失败</h2><p class="muted">${asin || ""} ${error.message}</p>`;
  }
});

document.querySelector("#keywordFilesInput").addEventListener("change", async (event) => {
  const files = event.target.files;
  event.target.value = "";
  try {
    await importKeywordFiles(files);
  } catch (error) {
    document.querySelector("#detailPanel").innerHTML = `<h2>关键词数据导入失败</h2><p class="muted">${error.message}</p>`;
  }
});

document.querySelector("#competitorFileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  const asin = state.pendingCompetitorAsin;
  event.target.value = "";
  if (!file) return;
  try {
    await importCompetitorFile(file, asin);
  } catch (error) {
    document.querySelector("#detailPanel").innerHTML = `<h2>竞品数据导入失败</h2><p class="muted">${asin || ""} ${error.message}</p>`;
  }
});

document.querySelector("#statusFilter").addEventListener("change", (event) => {
  applyStatusFilter(event.target.value);
});

document.querySelector("#aiConfigSave").addEventListener("click", () => {
  saveAiConfig().catch((error) => {
    document.querySelector("#aiConfigStatus").textContent = `保存失败：${error.message}`;
  });
});

document.querySelector("#deepseekKeyTest").addEventListener("click", () => {
  testDeepSeekKey().catch((error) => {
    renderDeepSeekKeyStatus(`DeepSeek Key 测试失败：${error.message}`);
  });
});

document.querySelector("#keywordBatchImport").addEventListener("click", () => {
  if (!state.run) return;
  document.querySelector("#keywordFilesInput").click();
});

document.querySelector(".analysis-tabs").addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-analysis-tab]");
  if (!tabButton) return;
  setAnalysisTab(tabButton.dataset.analysisTab);
});

document.querySelector("#candidateTable").addEventListener("click", (event) => {
  if (event.target.closest(".asin-link")) return;
  const sifButton = event.target.closest("[data-sif-asin]");
  if (sifButton) {
    state.pendingSifAsin = sifButton.dataset.sifAsin;
    state.selected = state.run.items.find((item) => item.asin === state.pendingSifAsin) ?? state.selected;
    setAnalysisTab("detail");
    renderCandidates();
    renderDetail(state.selected);
    renderAiPanel(state.selected);
    renderCompetitorAiPanel(state.selected);
    document.querySelector("#sifFileInput").click();
    return;
  }
  const competitorButton = event.target.closest("[data-competitor-asin]");
  if (competitorButton) {
    state.pendingCompetitorAsin = competitorButton.dataset.competitorAsin;
    state.selected = state.run.items.find((item) => item.asin === state.pendingCompetitorAsin) ?? state.selected;
    setAnalysisTab("competitor");
    renderCandidates();
    renderDetail(state.selected);
    renderAiPanel(state.selected);
    renderCompetitorAiPanel(state.selected);
    document.querySelector("#competitorFileInput").click();
    return;
  }
  const aiButton = event.target.closest("[data-ai-asin]");
  if (aiButton) {
    const asin = aiButton.dataset.aiAsin;
    state.selected = state.run.items.find((item) => item.asin === asin) ?? state.selected;
    setAnalysisTab("ai");
    renderCandidates();
    renderDetail(state.selected);
    renderAiPanel({ ...state.selected, aiSummary: state.selected?.aiSummary || { advantages: ["正在生成，请稍候..."], disadvantages: [], risks: [], strategy: "", recommendation: "" } });
    renderCompetitorAiPanel(state.selected);
    summarizeAsin(asin).catch((error) => {
      document.querySelector("#aiPanel").innerHTML = `<h2>AI 总结失败</h2><p class="muted">${error.message}</p>`;
    });
    return;
  }
  const row = event.target.closest("tr[data-asin]");
  if (!row) return;
  state.selected = state.run.items.find((item) => item.asin === row.dataset.asin);
  renderCandidates();
  renderDetail(state.selected);
  renderAiPanel(state.selected);
  renderCompetitorAiPanel(state.selected);
});

document.querySelector("#competitorAiPanel").addEventListener("click", (event) => {
  const competitorAiButton = event.target.closest("[data-competitor-ai-asin]");
  if (!competitorAiButton) return;
  const asin = competitorAiButton.dataset.competitorAiAsin;
  state.selected = state.run?.items?.find((item) => item.asin === asin) ?? state.selected;
  setAnalysisTab("competitor");
  renderCompetitorAiPanel({
    ...state.selected,
    competitors: {
      ...(state.selected?.competitors || {}),
      aiAnalysis: null,
      aiStatus: { status: "running" }
    }
  });
  rerunCompetitorAi(asin).catch((error) => {
    document.querySelector("#competitorAiPanel").innerHTML = `<h2>竞品 AI 分析失败</h2><p class="muted">${error.message}</p>`;
  });
});

document.querySelector("#nextStepWorkspace").addEventListener("click", (event) => {
  const action = event.target.closest("[data-step-action]")?.dataset.stepAction;
  if (!action || !state.run) return;
  const filters = {
    strong: "strong_candidate",
    manual: "manual_review",
    missing: "insufficient_data"
  };
  applyStatusFilter(filters[action]);
});

document.querySelectorAll('a[href="/api/export.csv"], a[href="/api/report.md"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const path = link.getAttribute("href");
    const filename = path.endsWith(".csv") ? "screening-results.csv" : "screening-report.md";
    downloadFromApi(path, filename).catch((error) => {
      document.querySelector("#detailPanel").innerHTML = `<h2>导出失败</h2><p class="muted">${error.message}</p>`;
    });
  });
});

renderSummary();
renderNextSteps();
syncFilterControls();
syncAnalysisTabs();
renderCandidates();
renderAiPanel();
renderCompetitorAiPanel();
loadLatestRun().catch(() => {});
loadAiConfig().catch((error) => {
  document.querySelector("#aiConfigStatus").textContent = `读取失败：${error.message}`;
});
loadDeepSeekStatus().catch(() => {});
