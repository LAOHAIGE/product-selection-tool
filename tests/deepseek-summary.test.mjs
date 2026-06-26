import assert from "node:assert/strict";
import test from "node:test";
import { attachAiSummaryToRun, buildAsinSummaryMessages, buildCompetitorAnalysisMessages, summarizeAsinWithDeepSeek, summarizeCompetitorsWithDeepSeek, testDeepSeekKey } from "../src/server/deepseek-summary.mjs";

const item = {
  asin: "B000TEST01",
  title: "Magnesium Capsules",
  brand: "Test Brand",
  smallCategory: "Magnesium Mineral Supplements",
  monthlySales: 12000,
  price: 29.99,
  rating: 4.5,
  reviewCount: 430,
  fbaFee: 4.09,
  grossMargin: 0.72,
  listingAgeDays: 180,
  sellerCount: 1,
  opportunityScore: 86,
  riskScore: 34,
  status: "strong_candidate",
  passReasons: ["Strong monthly sales: 12000"],
  rejectionReasons: [],
  retentionReasons: [],
  missingData: ["Market analysis export is needed"],
  selectionAnalysis: {
    standardPoints: [
      { point: 1, name: "ASIN月销量", value: 12000, status: "strong", conclusion: "月销量超过3000" },
      { point: 2, name: "销量趋势", value: "12.0%", status: "strong", conclusion: "销量正增长" }
    ]
  },
  sif: {
    keywordCount: 10,
    totalSearchVolume: 60000,
    analysis: {
      standardPoints: [
        { point: 6, name: "自然流占比", value: "60%", status: "strong", conclusion: "自然流量健康" },
        { point: 10, name: "广告竞价", value: "$1.8", status: "ok", conclusion: "竞价压力中等" }
      ],
      top10NonBrandExactTrafficKeywords: ["magnesium glycinate", "magnesium capsules"]
    }
  }
};

test("buildAsinSummaryMessages includes product and SIF analysis context", () => {
  const messages = buildAsinSummaryMessages(item);
  const payload = messages.map((message) => message.content).join("\n");

  assert.match(payload, /B000TEST01/);
  assert.match(payload, /Magnesium Capsules/);
  assert.match(payload, /ASIN月销量/);
  assert.match(payload, /自然流占比/);
  assert.match(payload, /请只返回 JSON/);
});

test("buildAsinSummaryMessages uses a custom AI prompt when provided", () => {
  const messages = buildAsinSummaryMessages(item, { prompt: "自定义总结规则：先给结论，再给打法。" });
  const payload = messages.map((message) => message.content).join("\n");

  assert.match(payload, /自定义总结规则：先给结论，再给打法。/);
});

test("summarizeAsinWithDeepSeek calls OpenAI-compatible DeepSeek chat endpoint", async () => {
  let request;
  const summary = await summarizeAsinWithDeepSeek(item, {
    apiKey: "test-key",
    prompt: "自定义总结规则：先给结论。",
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  advantages: ["销量强"],
                  disadvantages: ["趋势需观察"],
                  risks: ["市场数据不足"],
                  strategy: "优先验证关键词和供应链",
                  recommendation: "观察候选"
                })
              }
            }]
          };
        }
      };
    }
  });

  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(JSON.parse(request.options.body).model, "deepseek-v4-flash");
  assert.match(JSON.stringify(JSON.parse(request.options.body).messages), /自定义总结规则：先给结论。/);
  assert.deepEqual(summary.advantages, ["销量强"]);
  assert.equal(summary.recommendation, "观察候选");
});

test("summarizeAsinWithDeepSeek repairs raw newlines inside JSON string values", async () => {
  const summary = await summarizeAsinWithDeepSeek(item, {
    apiKey: "test-key",
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{
            message: {
              content: `{
                "advantages": ["Strong sales"],
                "disadvantages": ["Needs supplier validation"],
                "risks": ["Ad bid may rise"],
                "strategy": "Start with non-brand exact keywords
and validate repeat purchase demand.",
                "recommendation": "observation_candidate"
              }`
            }
          }]
        };
      }
    })
  });

  assert.equal(summary.strategy, "Start with non-brand exact keywords\nand validate repeat purchase demand.");
  assert.deepEqual(summary.advantages, ["Strong sales"]);
});

test("summarizeAsinWithDeepSeek explains network-level fetch failures", async () => {
  const error = new TypeError("fetch failed");
  error.cause = { code: "EACCES" };

  await assert.rejects(
    summarizeAsinWithDeepSeek(item, {
      apiKey: "test-key",
      fetch: async () => {
        throw error;
      }
    }),
    /DeepSeek 网络连接失败.*EACCES/
  );
});

test("testDeepSeekKey sends a small JSON-mode chat request", async () => {
  let request;
  const result = await testDeepSeekKey("test-key", {
    fetch: async (url, options) => {
      request = { url, options };
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

  const body = JSON.parse(request.options.body);

  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(body.model, "deepseek-v4-flash");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(result.ok, true);
});

test("buildCompetitorAnalysisMessages includes competitor records and summary context", () => {
  const competitorData = {
    records: [{
      title: "Magnesium Glycinate",
      bulletPoints: "sleep support",
      price: 32.99,
      monthlySales: 12000,
      salesTrend: 0.18,
      listingAgeDays: 300
    }],
    summary: { totalCompetitors: 1, priceMin: 32.99, priceMax: 32.99 }
  };

  const payload = buildCompetitorAnalysisMessages(item, competitorData)
    .map((message) => message.content)
    .join("\n");

  assert.match(payload, /B000TEST01/);
  assert.match(payload, /Magnesium Glycinate/);
  assert.match(payload, /recommendedPriceBand/);
});

test("buildCompetitorAnalysisMessages includes a custom competitor prompt", () => {
  const competitorData = {
    records: [{ title: "Magnesium Glycinate", bulletPoints: "sleep support", price: 32.99 }],
    summary: { totalCompetitors: 1 }
  };

  const payload = buildCompetitorAnalysisMessages(item, competitorData, {
    prompt: "请先按配方分组，再判断哪个价格带最适合切入。"
  }).map((message) => message.content).join("\n");

  assert.match(payload, /请先按配方分组/);
  assert.match(payload, /Magnesium Glycinate/);
});

test("summarizeCompetitorsWithDeepSeek returns normalized competitor analysis", async () => {
  let request;
  const analysis = await summarizeCompetitorsWithDeepSeek(item, {
    records: [{
      title: "Magnesium Glycinate",
      bulletPoints: "sleep support",
      price: 32.99,
      monthlySales: 12000,
      salesTrend: 0.18,
      listingAgeDays: 300
    }],
    summary: { totalCompetitors: 1, priceMin: 32.99, priceMax: 32.99 }
  }, {
    apiKey: "test-key",
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  priceDifferenceReasons: ["Dosage and count drive premium pricing"],
                  competitorGroups: [{ name: "Chelated sleep support", formula: "Magnesium glycinate", priceBand: "$29-$36", notes: "High sales" }],
                  bestSellingTypes: ["Chelated sleep support"],
                  premiumTypes: ["High-count blends"],
                  growingTypes: ["Sleep support gummies"],
                  oldListingTypes: ["Legacy tablet products"],
                  recommendedFormula: "Magnesium glycinate with sleep-positioned ingredients",
                  recommendedPriceBand: "$29.99-$34.99",
                  strategy: "Enter with a clear non-brand keyword angle."
                })
              }
            }]
          };
        }
      };
    }
  });

  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(JSON.parse(request.options.body).model, "deepseek-v4-flash");
  assert.deepEqual(analysis.priceDifferenceReasons, ["Dosage and count drive premium pricing"]);
  assert.equal(analysis.competitorGroups[0].name, "Chelated sleep support");
  assert.equal(analysis.recommendedPriceBand, "$29.99-$34.99");
});

test("summarizeCompetitorsWithDeepSeek sends a custom competitor prompt", async () => {
  let request;
  await summarizeCompetitorsWithDeepSeek(item, {
    records: [{ title: "Magnesium Glycinate", bulletPoints: "sleep support", price: 32.99 }],
    summary: { totalCompetitors: 1 }
  }, {
    apiKey: "test-key",
    prompt: "竞品 prompt：先找高价竞品共同点。",
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  priceDifferenceReasons: [],
                  competitorGroups: [],
                  bestSellingTypes: [],
                  premiumTypes: [],
                  growingTypes: [],
                  oldListingTypes: [],
                  recommendedFormula: "",
                  recommendedPriceBand: "",
                  strategy: ""
                })
              }
            }]
          };
        }
      };
    }
  });

  assert.match(JSON.stringify(JSON.parse(request.options.body).messages), /竞品 prompt：先找高价竞品共同点/);
});

test("summarizeCompetitorsWithDeepSeek repairs semicolon separators outside JSON strings", async () => {
  const analysis = await summarizeCompetitorsWithDeepSeek(item, {
    records: [{ title: "Amla powder", bulletPoints: "pure amla; no additive", price: 24.99, monthlySales: 8000 }],
    summary: { totalCompetitors: 1 }
  }, {
    apiKey: "test-key",
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{
            message: {
              content: `{
                "priceDifferenceReasons": [
                  "Different count and formula positioning",
                  "Semicolon in string should stay; because it is text";
                ],
                "competitorGroups": [
                  {"name":"Basic formula","formula":"Amla powder","priceBand":"$19-$29","notes":"High volume"};
                ],
                "bestSellingTypes": ["Basic formula"],
                "premiumTypes": [],
                "growingTypes": [],
                "oldListingTypes": [],
                "recommendedFormula": "Amla powder with differentiated positioning",
                "recommendedPriceBand": "$24.99-$29.99",
                "strategy": "Avoid price-only competition."
              }`
            }
          }]
        };
      }
    })
  });

  assert.equal(analysis.priceDifferenceReasons[1], "Semicolon in string should stay; because it is text");
  assert.equal(analysis.competitorGroups[0].name, "Basic formula");
  assert.equal(analysis.recommendedPriceBand, "$24.99-$29.99");
});

test("summarizeCompetitorsWithDeepSeek repairs missing commas between JSON array elements", async () => {
  const analysis = await summarizeCompetitorsWithDeepSeek(item, {
    records: [{ title: "Amla powder", bulletPoints: "pure amla", price: 24.99, monthlySales: 8000 }],
    summary: { totalCompetitors: 1 }
  }, {
    apiKey: "test-key",
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{
            message: {
              content: `{
                "priceDifferenceReasons": [
                  "Organic certification supports a premium"
                  "Low-price competitors use simpler powder formulas"
                ],
                "competitorGroups": [
                  {"name":"Basic powder","formula":"Amla powder","priceBand":"$7-$19","notes":"Budget"}
                  {"name":"Premium extract","formula":"Amla extract blend","priceBand":"$29-$49","notes":"Higher price"}
                ],
                "bestSellingTypes": ["Basic powder"],
                "premiumTypes": ["Premium extract"],
                "growingTypes": [],
                "oldListingTypes": [],
                "recommendedFormula": "Amla powder with clear certification",
                "recommendedPriceBand": "$24.99-$29.99",
                "strategy": "Position above basic powder without matching premium blends."
              }`
            }
          }]
        };
      }
    })
  });

  assert.deepEqual(analysis.priceDifferenceReasons, [
    "Organic certification supports a premium",
    "Low-price competitors use simpler powder formulas"
  ]);
  assert.equal(analysis.competitorGroups[1].name, "Premium extract");
  assert.equal(analysis.recommendedPriceBand, "$24.99-$29.99");
});

test("summarizeCompetitorsWithDeepSeek asks DeepSeek to repair JSON when local parsing still fails", async () => {
  const calls = [];
  const analysis = await summarizeCompetitorsWithDeepSeek(item, {
    records: [{ title: "Amla powder", bulletPoints: "pure amla", price: 24.99, monthlySales: 8000 }],
    summary: { totalCompetitors: 1 }
  }, {
    apiKey: "test-key",
    fetch: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: calls.length === 1
                  ? `{priceDifferenceReasons:["bad"],"competitorGroups":[]}`
                  : JSON.stringify({
                    priceDifferenceReasons: ["Repaired JSON"],
                    competitorGroups: [],
                    bestSellingTypes: [],
                    premiumTypes: [],
                    growingTypes: [],
                    oldListingTypes: [],
                    recommendedFormula: "Amla powder",
                    recommendedPriceBand: "$24.99-$29.99",
                    strategy: "Use repaired JSON."
                  })
              }
            }]
          };
        }
      };
    }
  });

  assert.equal(calls.length, 2);
  assert.match(JSON.stringify(calls[1].messages), /修复/);
  assert.equal(analysis.priceDifferenceReasons[0], "Repaired JSON");
  assert.equal(analysis.strategy, "Use repaired JSON.");
});

test("attachAiSummaryToRun stores AI summary on the target ASIN", () => {
  const run = { summary: { total: 1 }, items: [item] };
  const summary = { advantages: ["销量强"], disadvantages: [], risks: [], strategy: "验证", recommendation: "可做" };

  const updated = attachAiSummaryToRun(run, "B000TEST01", summary);

  assert.equal(updated.items[0].aiSummary.recommendation, "可做");
  assert.equal(updated.items[0].aiSummary.provider, "deepseek");
});
