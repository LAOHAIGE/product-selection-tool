import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const expectedFiles = [
  "package.json",
  "src/shared/fields.mjs",
  "src/shared/default-rules.mjs",
  "src/server/http-server.mjs",
  "src/client/index.html",
  "src/client/styles.css",
  "src/client/app.js",
  "WEB_DEPLOY.md",
  "render.yaml",
  ".gitignore",
  "scripts/build-web-deploy.ps1"
];

test("project scaffold exists", () => {
  for (const file of expectedFiles) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }
});

test("client app contains required dashboard anchors", () => {
  const html = readFileSync("src/client/index.html", "utf8");
  const js = readFileSync("src/client/app.js", "utf8");

  assert.match(html, /id="fileInput"/);
  assert.match(html, /id="sifFileInput"/);
  assert.match(html, /id="candidateTable"/);
  assert.match(html, /id="detailPanel"/);
  assert.match(html, /id="nextStepWorkspace"/);
  assert.match(js, /async function analyzeFile/);
  assert.match(js, /async function summarizeAsin/);
  assert.match(js, /async function importKeywordFile/);
  assert.match(js, /async function importCompetitorFile/);
  assert.match(js, /pendingSifAsin/);
  assert.match(js, /pendingCompetitorAsin/);
  assert.match(js, /data-ai-asin/);
  assert.match(js, /data-sif-asin/);
  assert.match(js, /data-competitor-asin/);
  assert.match(js, /function amazonProductUrl/);
  assert.match(js, /function renderCandidates/);
  assert.match(js, /function renderAiSummary/);
  assert.match(js, /function renderProductStandardPoints/);
  assert.match(js, /function renderSifStandardPoints/);
  assert.match(js, /function renderSummary/);
  assert.match(js, /function renderNextSteps/);
  assert.match(js, /async function loadLatestRun/);
  assert.match(js, /data-step-action/);
  assert.match(js, /api\/import-keywords/);
  assert.match(js, /api\/import-competitors/);
  assert.match(js, /api\/ai-summary\?asin=/);
  assert.match(js, /amazon\.com\/dp/);
});

test("package and docs describe hosted web deployment", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const docs = readFileSync("WEB_DEPLOY.md", "utf8");
  const renderConfig = readFileSync("render.yaml", "utf8");
  const gitignore = readFileSync(".gitignore", "utf8");
  const buildScript = readFileSync("scripts/build-web-deploy.ps1", "utf8");

  assert.equal(pkg.engines.node, ">=20");
  assert.match(docs, /per-user DeepSeek keys/);
  assert.match(docs, /NODE_ENV=production/);
  assert.match(docs, /node src\/server\/http-server\.mjs/);
  assert.match(renderConfig, /type:\s*web/);
  assert.match(renderConfig, /startCommand:\s*node src\/server\/http-server\.mjs/);
  assert.match(gitignore, /^data\//m);
  assert.match(gitignore, /^dist\//m);
  assert.match(buildScript, /web-deploy-source\.zip/);
  assert.match(buildScript, /render\.yaml/);
});
