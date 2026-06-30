import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { makeXlsxFixture } from "./utils/xlsx-fixture.mjs";
import { createAppServer, isMainModule, resolveListenHost } from "../src/server/http-server.mjs";

async function withServer(callback, serverOptions = {}) {
  const storageDir = await mkdtemp(join(tmpdir(), "product-selection-http-"));
  const defaultDeepseekFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              advantages: ["销量强"],
              disadvantages: ["需要补市场数据"],
              risks: ["趋势需观察"],
              strategy: "先做关键词和供应链验证",
              recommendation: "观察候选"
            })
          }
        }]
      };
    }
  });
  const deepseekApiKey = Object.hasOwn(serverOptions, "deepseekApiKey") ? serverOptions.deepseekApiKey : "test-key";
  const server = createAppServer({
    storageDir,
    deepseekApiKey,
    fetch: serverOptions.fetch || defaultDeepseekFetch
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`, { storageDir });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(storageDir, { recursive: true, force: true });
  }
}

function competitorHeaderRow() {
  const row = [];
  row[8] = "商品标题";
  row[9] = "产品卖点";
  row[20] = "月销量";
  row[21] = "销量增长";
  row[26] = "价格";
  row[38] = "上架天数";
  return row;
}

function competitorDataRow({ title, bullets, monthlySales, salesTrend, price, listingAgeDays }) {
  const row = [];
  row[8] = title;
  row[9] = bullets;
  row[20] = monthlySales;
  row[21] = salesTrend;
  row[26] = price;
  row[38] = listingAgeDays;
  return row;
}

test("POST /api/analyze accepts xlsx bytes and returns analyzed candidates", async () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST01", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: workbook
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.summary.total, 1);
    assert.equal(json.items[0].asin, "B000TEST01");
    assert.equal(json.items[0].status, "strong_candidate");
  });
});

test("GET /api/rules returns default rules", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/rules`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.minMonthlySales, 3000);
  });
});

test("GET /api/deepseek-status returns whether the API key is configured", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/deepseek-status`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.provider, "deepseek");
    assert.equal(json.configured, true);
  });
});

test("GET and PUT /api/ai-config read and save the AI prompt", async () => {
  await withServer(async (baseUrl) => {
    const initialResponse = await fetch(`${baseUrl}/api/ai-config`);
    const initial = await initialResponse.json();

    assert.equal(initialResponse.status, 200);
    assert.equal(initial.isDefault, true);
    assert.match(initial.prompt, /ASIN/);

    const saveResponse = await fetch(`${baseUrl}/api/ai-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "先输出结论，再输出优缺点和打法。" })
    });
    const saved = await saveResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(saved.prompt, "先输出结论，再输出优缺点和打法。");
    assert.equal(saved.isDefault, false);

    const loadedResponse = await fetch(`${baseUrl}/api/ai-config`);
    const loaded = await loadedResponse.json();

    assert.equal(loaded.prompt, "先输出结论，再输出优缺点和打法。");
    assert.equal(loaded.isDefault, false);
  });
});

test("PUT /api/ai-config can save a DeepSeek key without returning it", async () => {
  await withServer(async (baseUrl) => {
    const saveResponse = await fetch(`${baseUrl}/api/ai-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Custom prompt", deepseekApiKey: "sk-local-test-9999" })
    });
    const saved = await saveResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(saved.deepseekKeyConfigured, true);
    assert.equal(saved.deepseekKeyPreview, "sk-****9999");
    assert.equal(Object.hasOwn(saved, "deepseekApiKey"), false);

    const loadedResponse = await fetch(`${baseUrl}/api/ai-config`);
    const loaded = await loadedResponse.json();

    assert.equal(loaded.deepseekKeyConfigured, true);
    assert.equal(loaded.deepseekKeyPreview, "sk-****9999");
    assert.equal(Object.hasOwn(loaded, "deepseekApiKey"), false);
  }, { deepseekApiKey: "" });
});

test("POST /api/deepseek-test uses the saved DeepSeek key", async () => {
  let authHeader;

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/ai-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deepseekApiKey: "sk-local-test-2222" })
    });

    const response = await fetch(`${baseUrl}/api/deepseek-test`, { method: "POST" });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.provider, "deepseek");
    assert.equal(json.configured, true);
    assert.equal(json.source, "local_config");
    assert.equal(json.ok, true);
    assert.equal(authHeader, "Bearer sk-local-test-2222");
  }, {
    deepseekApiKey: "",
    fetch: async (url, options) => {
      authHeader = options.headers.authorization;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: { content: "{\"ok\":true}" }
            }]
          };
        }
      };
    }
  });
});

test("POST /api/deepseek-test can use a per-request DeepSeek key without saving it", async () => {
  let authHeader;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/deepseek-test`, {
      method: "POST",
      headers: { "x-deepseek-api-key": "sk-browser-user-7777" }
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.provider, "deepseek");
    assert.equal(json.configured, true);
    assert.equal(json.source, "request");
    assert.equal(json.keyPreview, "sk-****7777");
    assert.equal(authHeader, "Bearer sk-browser-user-7777");

    const configResponse = await fetch(`${baseUrl}/api/ai-config`);
    const config = await configResponse.json();
    assert.equal(config.deepseekKeyConfigured, false);
  }, {
    deepseekApiKey: "",
    fetch: async (url, options) => {
      authHeader = options.headers.authorization;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: { content: "{\"ok\":true}" }
            }]
          };
        }
      };
    }
  });
});

test("latest runs are isolated by browser session id", async () => {
  const headers = ["ASIN", "Product Title", "Brand", "Subcategory", "Monthly Sales", "Price", "Review Count", "Rating", "FBA Fee", "Gross Margin", "Listing Age Days", "Seller Count"];
  const workbookA = makeXlsxFixture([
    headers,
    ["BSESSIONA1", "Session A Product", "Brand A", "Supplements", 8000, 29.99, 120, 4.5, 4, 0.65, 100, 1]
  ]);
  const workbookB = makeXlsxFixture([
    headers,
    ["BSESSIONB1", "Session B Product", "Brand B", "Supplements", 9000, 31.99, 130, 4.6, 4, 0.66, 120, 1]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-selection-session-id": "browser-a"
      },
      body: workbookA
    });
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-selection-session-id": "browser-b"
      },
      body: workbookB
    });

    const responseA = await fetch(`${baseUrl}/api/latest-run`, {
      headers: { "x-selection-session-id": "browser-a" }
    });
    const responseB = await fetch(`${baseUrl}/api/latest-run`, {
      headers: { "x-selection-session-id": "browser-b" }
    });
    const jsonA = await responseA.json();
    const jsonB = await responseB.json();

    assert.equal(jsonA.items[0].asin, "BSESSIONA1");
    assert.equal(jsonB.items[0].asin, "BSESSIONB1");
  });
});

test("POST /api/item-reviewed marks one ASIN as reviewed in the current browser session", async () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "Product Title", "Brand", "Subcategory", "Monthly Sales", "Price", "Review Count", "Rating", "FBA Fee", "Gross Margin", "Listing Age Days", "Seller Count"],
    ["BREVIEW001", "Review Toggle Product", "Review Brand", "Supplements", 8000, 29.99, 120, 4.5, 4, 0.65, 100, 1]
  ]);
  const sessionHeaders = { "x-selection-session-id": "review-session" };

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        ...sessionHeaders,
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      },
      body: workbook
    });

    const reviewedResponse = await fetch(`${baseUrl}/api/item-reviewed?asin=BREVIEW001`, {
      method: "POST",
      headers: { ...sessionHeaders, "content-type": "application/json" },
      body: JSON.stringify({ reviewed: true })
    });
    const reviewedRun = await reviewedResponse.json();

    assert.equal(reviewedResponse.status, 200);
    assert.equal(reviewedRun.items[0].reviewed, true);
    assert.match(reviewedRun.items[0].reviewedAt, /^\d{4}-\d{2}-\d{2}T/);

    const latestResponse = await fetch(`${baseUrl}/api/latest-run`, { headers: sessionHeaders });
    const latest = await latestResponse.json();
    assert.equal(latest.items[0].reviewed, true);

    const unreviewedResponse = await fetch(`${baseUrl}/api/item-reviewed?asin=BREVIEW001`, {
      method: "POST",
      headers: { ...sessionHeaders, "content-type": "application/json" },
      body: JSON.stringify({ reviewed: false })
    });
    const unreviewedRun = await unreviewedResponse.json();

    assert.equal(unreviewedResponse.status, 200);
    assert.equal(unreviewedRun.items[0].reviewed, false);
    assert.equal(unreviewedRun.items[0].reviewedAt, null);
  });
});

test("POST /api/restore-run restores a browser workspace and keeps sessions isolated", async () => {
  const restoredRun = {
    id: "browser-workspace",
    summary: { total: 1 },
    items: [{ asin: "BRESTORE01", reviewed: true, reviewedAt: "2026-06-30T08:00:00.000Z" }]
  };

  await withServer(async (baseUrl) => {
    const restoreResponse = await fetch(`${baseUrl}/api/restore-run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-selection-session-id": "restore-browser" },
      body: JSON.stringify({ run: restoredRun })
    });
    const restored = await restoreResponse.json();

    assert.equal(restoreResponse.status, 200);
    assert.equal(restored.items[0].asin, "BRESTORE01");
    assert.equal(restored.items[0].reviewed, true);

    const sameSession = await fetch(`${baseUrl}/api/latest-run`, {
      headers: { "x-selection-session-id": "restore-browser" }
    });
    assert.equal((await sameSession.json()).items[0].asin, "BRESTORE01");

    const otherSession = await fetch(`${baseUrl}/api/latest-run`, {
      headers: { "x-selection-session-id": "another-browser" }
    });
    assert.equal(otherSession.status, 204);
  });
});

test("POST /api/restore-run rejects a damaged workspace", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/restore-run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-selection-session-id": "invalid-restore" },
      body: JSON.stringify({ run: { items: "not-an-array" } })
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.match(json.error, /items array/);
  });
});

test("isMainModule recognizes Windows file URLs when launched from PowerShell", () => {
  assert.equal(
    isMainModule("file:///F:/codex1/codex6%E6%9C%881%E5%88%86%E6%9E%90%E8%9B%8B%E7%99%BD%E7%B2%89/src/server/http-server.mjs", "F:\\codex1\\codex6月1分析蛋白粉\\src\\server\\http-server.mjs"),
    true
  );
});

test("resolveListenHost uses 0.0.0.0 in production for cloud deployment", () => {
  assert.equal(resolveListenHost({ NODE_ENV: "production" }), "0.0.0.0");
  assert.equal(resolveListenHost({ HOST: "127.0.0.1", NODE_ENV: "production" }), "127.0.0.1");
  assert.equal(resolveListenHost({}), "127.0.0.1");
});

test("GET /api/latest-run returns the most recent analysis", async () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST02", "Creatine Capsules", "Test Brand", "Creatine Nutritional Supplements", 9000, 32.99, 250, 4.6, 4.3, 0.68, 120, 1]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: workbook
    });

    const response = await fetch(`${baseUrl}/api/latest-run`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.summary.total, 1);
    assert.equal(json.items[0].asin, "B000TEST02");
  });
});

test("POST /api/import-sif enriches the current candidate run", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST03", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const sifWorkbook = makeXlsxFixture([
    ["关键词", "搜索量", "CPC", "自然流量占比"],
    ["magnesium glycinate", 12000, 1.25, "18%"]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });

    const response = await fetch(`${baseUrl}/api/import-sif?asin=B000TEST03`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: sifWorkbook
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.importInfo.sif.targetAsin, "B000TEST03");
    assert.equal(json.importInfo.sif.matchedAsins, 1);
    assert.equal(json.items[0].sif.keywordCount, 1);
    assert.equal(json.items[0].missingData.some((item) => item.includes("SIF keyword export")), false);
  });
});

test("POST /api/import-keywords infers target ASIN from the uploaded filename", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST07", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const keywordWorkbook = makeXlsxFixture([
    ["关键词", "搜索量", "CPC", "自然流量占比"],
    ["magnesium glycinate", 12000, 1.25, "18%"]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });

    const response = await fetch(`${baseUrl}/api/import-keywords?filename=B000TEST07-keywords.xlsx`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: keywordWorkbook
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.importInfo.sif.targetAsin, "B000TEST07");
    assert.equal(json.importInfo.sif.matchedAsins, 1);
    assert.equal(json.items[0].sif.keywordCount, 1);
  });
});

test("POST /api/import-keywords infers target ASIN from SellerSprite metadata", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST08", "Amla Capsules", "Test Brand", "Fruit Extract Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const keywordWorkbook = makeXlsxFixture([
    ["美国站点_B000TEST08_2026-06-03 导出时间: 2026-06-03 11:06"],
    ["#", "关键词", "搜索量", "CPC", "自然流量占比"],
    ["1", "amla", 12000, 1.25, "18%"]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });

    const response = await fetch(`${baseUrl}/api/import-keywords?filename=keywords.xlsx`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: keywordWorkbook
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.importInfo.sif.targetAsin, "B000TEST08");
    assert.equal(json.importInfo.sif.matchedAsins, 1);
    assert.equal(json.items[0].sif.keywordCount, 1);
  });
});

test("POST /api/import-competitors stores competitor data and auto-runs DeepSeek analysis", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST09", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const competitorWorkbook = makeXlsxFixture([
    competitorHeaderRow(),
    competitorDataRow({
      title: "Magnesium Glycinate 120 Capsules",
      bullets: "Chelated magnesium; sleep support",
      monthlySales: "12,500",
      salesTrend: "18%",
      price: "$32.99",
      listingAgeDays: "540"
    })
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });

    const response = await fetch(`${baseUrl}/api/import-competitors?asin=B000TEST09`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: competitorWorkbook
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.items[0].competitors.records.length, 1);
    assert.equal(json.items[0].competitors.records[0].monthlySales, 12500);
    assert.equal(json.items[0].competitors.summary.growingCount, 1);
    assert.equal(json.items[0].competitors.aiStatus.status, "completed");
    assert.equal(json.items[0].competitors.aiAnalysis.recommendedPriceBand, "$29.99-$34.99");
  }, {
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                priceDifferenceReasons: ["Count and dosage explain the price gap"],
                competitorGroups: [{ name: "Chelated sleep support", formula: "Magnesium glycinate", priceBand: "$29-$36", notes: "High sales" }],
                bestSellingTypes: ["Chelated sleep support"],
                premiumTypes: ["High-count blends"],
                growingTypes: ["Sleep support"],
                oldListingTypes: ["Legacy tablets"],
                recommendedFormula: "Magnesium glycinate",
                recommendedPriceBand: "$29.99-$34.99",
                strategy: "Enter with differentiated sleep support."
              })
            }
          }]
        };
      }
    })
  });
});

test("POST /api/import-competitors saves competitor data without AI when DeepSeek key is missing", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST10", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const competitorWorkbook = makeXlsxFixture([
    competitorHeaderRow(),
    competitorDataRow({
      title: "Budget Magnesium",
      bullets: "Basic formula",
      monthlySales: "4,200",
      salesTrend: "-5%",
      price: "$19.99",
      listingAgeDays: "900"
    })
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });

    const response = await fetch(`${baseUrl}/api/import-competitors?asin=B000TEST10`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: competitorWorkbook
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.items[0].competitors.records.length, 1);
    assert.equal(json.items[0].competitors.aiAnalysis, null);
    assert.equal(json.items[0].competitors.aiStatus.status, "skipped");
    assert.match(json.items[0].competitors.aiStatus.reason, /DeepSeek API Key/);
  }, { deepseekApiKey: "" });
});

test("POST /api/competitor-ai-analysis reruns AI analysis for already imported competitor data", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST11", "Amla Capsules", "Test Brand", "Fruit Extract Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const competitorWorkbook = makeXlsxFixture([
    competitorHeaderRow(),
    competitorDataRow({
      title: "Amla Powder",
      bullets: "Pure amla; no additive",
      monthlySales: "8,000",
      salesTrend: "10%",
      price: "$24.99",
      listingAgeDays: "300"
    })
  ]);
  const calls = [];

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });
    await fetch(`${baseUrl}/api/ai-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "ASIN summary prompt",
        competitorPrompt: "竞品分析规则：先分配方，再判断建议价格带。"
      })
    });
    await fetch(`${baseUrl}/api/import-competitors?asin=B000TEST11`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: competitorWorkbook
    });

    const response = await fetch(`${baseUrl}/api/competitor-ai-analysis?asin=B000TEST11`, { method: "POST" });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.items[0].competitors.records.length, 1);
    assert.equal(json.items[0].competitors.aiStatus.status, "completed");
    assert.equal(json.items[0].competitors.aiAnalysis.strategy, "Second analysis from saved competitor records.");
    assert.equal(calls.length, 2);
    assert.match(JSON.stringify(calls[1].messages), /竞品分析规则：先分配方/);
  }, {
    fetch: async (_url, options) => {
      const call = JSON.parse(options.body);
      calls.push(call);
      const callNumber = calls.length;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  priceDifferenceReasons: [`Analysis ${callNumber}`],
                  competitorGroups: [],
                  bestSellingTypes: [],
                  premiumTypes: [],
                  growingTypes: [],
                  oldListingTypes: [],
                  recommendedFormula: "Amla powder",
                  recommendedPriceBand: "$24.99-$29.99",
                  strategy: callNumber === 1 ? "First analysis." : "Second analysis from saved competitor records."
                })
              }
            }]
          };
        }
      };
    }
  });
});

test("POST /api/import-sif rejects workbooks with no recognizable keyword rows", async () => {
  const productWorkbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST05", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const invalidSifWorkbook = makeXlsxFixture([
    ["导出说明"],
    ["不是关键词表"]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: productWorkbook
    });

    const response = await fetch(`${baseUrl}/api/import-sif?asin=B000TEST05`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: invalidSifWorkbook
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.match(json.error, /关键词列/);
  });
});

test("POST /api/ai-summary stores DeepSeek summary on the selected ASIN", async () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "商品标题", "品牌", "小类目", "月销量", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数"],
    ["B000TEST06", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: workbook
    });

    const response = await fetch(`${baseUrl}/api/ai-summary?asin=B000TEST06`, { method: "POST" });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.items[0].aiSummary.recommendation, "观察候选");
    assert.deepEqual(json.items[0].aiSummary.advantages, ["销量强"]);
  });
});

test("POST /api/ai-summary can use per-request key and prompt from the browser", async () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "Product Title", "Brand", "Subcategory", "Monthly Sales", "Price", "Review Count", "Rating", "FBA Fee", "Gross Margin", "Listing Age Days", "Seller Count"],
    ["BWEBKEY001", "Browser Key Product", "Browser Brand", "Supplements", 12000, 29.99, 430, 4.5, 4.09, 0.72, 180, 1]
  ]);
  const prompt = "Browser-only prompt: explain if this ASIN is worth doing.";
  let authHeader;
  let requestBody;

  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-selection-session-id": "browser-key-session"
      },
      body: workbook
    });

    const response = await fetch(`${baseUrl}/api/ai-summary?asin=BWEBKEY001`, {
      method: "POST",
      headers: {
        "x-selection-session-id": "browser-key-session",
        "x-deepseek-api-key": "sk-browser-only-1111",
        "x-ai-prompt-b64": Buffer.from(prompt, "utf8").toString("base64")
      }
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.items[0].aiSummary.recommendation, "Browser key works");
    assert.equal(authHeader, "Bearer sk-browser-only-1111");
    assert.match(JSON.stringify(requestBody.messages), /Browser-only prompt/);

    const configResponse = await fetch(`${baseUrl}/api/ai-config`);
    const config = await configResponse.json();
    assert.equal(config.deepseekKeyConfigured, false);
  }, {
    deepseekApiKey: "",
    fetch: async (_url, options) => {
      authHeader = options.headers.authorization;
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  advantages: ["Uses browser key"],
                  disadvantages: [],
                  risks: [],
                  strategy: "Proceed carefully.",
                  recommendation: "Browser key works"
                })
              }
            }]
          };
        }
      };
    }
  });
});
