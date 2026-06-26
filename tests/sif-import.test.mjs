import assert from "node:assert/strict";
import test from "node:test";
import { mergeSifIntoRun, normalizeSifKeywords } from "../src/server/sif-import.mjs";

const sifPrompt = "SIF keyword export is needed for organic traffic, non-brand exact keywords, search volume, trend, and CPC";

test("normalizeSifKeywords maps common SIF keyword export columns", () => {
  const sheet = {
    headers: ["ASIN", "关键词", "搜索量", "CPC", "自然流量占比", "趋势", "是否品牌词"],
    rows: [
      ["B000TEST01", "magnesium glycinate", "12000", "1.25", "18%", "up", ""],
      ["B000TEST01", "thorne magnesium", "9000", "1.8", "12%", "flat", "是"]
    ]
  };

  const result = normalizeSifKeywords(sheet);

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].asin, "B000TEST01");
  assert.equal(result.records[0].keyword, "magnesium glycinate");
  assert.equal(result.records[0].searchVolume, 12000);
  assert.equal(result.records[0].cpc, 1.25);
  assert.equal(result.records[0].organicTrafficShare, 0.18);
  assert.equal(result.records[1].brandKeyword, true);
});

test("normalizeSifKeywords assigns rows to the target ASIN when the SIF export has no ASIN column", () => {
  const sheet = {
    headers: ["关键词", "搜索量", "CPC", "自然流量占比"],
    rows: [
      ["magnesium glycinate", "12000", "1.25", "18%"],
      ["magnesium capsules", "7000", "1.1", "9%"]
    ]
  };

  const result = normalizeSifKeywords(sheet, { targetAsin: "B000TEST01" });

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].asin, "B000TEST01");
  assert.equal(result.missingRequiredFields.includes("asin"), false);
});

test("normalizeSifKeywords maps sparse SellerSprite keyword headers", () => {
  const headers = [];
  headers[0] = "流量词";
  headers[8] = "自然流量占比";
  headers[9] = "广告流量占比";
  headers[17] = "月搜索量";
  headers[29] = "PPC价格";

  const row = [];
  row[0] = "amla";
  row[8] = "0.5457";
  row[9] = "0.4543";
  row[17] = "100414";
  row[29] = "$2.83";

  const result = normalizeSifKeywords({ headers, rows: [row] }, { targetAsin: "B0GBVSBHTY" });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].keyword, "amla");
  assert.equal(result.records[0].organicTrafficShare, 0.5457);
  assert.equal(result.records[0].adTrafficShare, 0.4543);
  assert.equal(result.records[0].searchVolume, 100414);
  assert.equal(result.records[0].cpc, 2.83);
});

test("normalizeSifKeywords detects encoded SellerSprite SIF headers after an export metadata row", () => {
  const sheet = {
    headers: ["&#32654;&#22269;&#31449;&#28857;_B0GBVSBHTY_2026-06-02 &#23548;&#20986;&#26102;&#38388;: 2026-06-02 11:06"],
    rows: [
      ["#", "&#20851;&#38190;&#35789;", "&#33258;&#28982;&#27969;&#37327;&#21344;&#27604;", "&#33258;&#28982;&#25490;&#21517;", "&#21608;&#25628;&#32034;&#36235;&#21183;", "&#20851;&#38190;&#35789;&#24314;&#35758;&#31454;&#20215;&#65288;&#22266;&#23450;&#183;&#31934;&#20934;)&#25512;&#33616;"],
      ["1", "amla", "0.21777607", "1", "33535", "1.96"],
      ["2", "amla capsules", "0.15779726", "26", "24762", "0.87"]
    ]
  };

  const result = normalizeSifKeywords(sheet, { targetAsin: "B0GBVSBHTY" });

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].keyword, "amla");
  assert.equal(result.records[0].organicTrafficShare, 0.21777607);
  assert.equal(result.records[0].organicRank, 1);
  assert.equal(result.records[0].searchVolume, 33535);
  assert.equal(result.records[0].cpc, 1.96);
  assert.match(result.records[0].keywordEffectType, /精准流量词/);
  assert.equal(result.records[0].allTrafficShare, 0.21777607);
  assert.equal(result.records[0].trafficChange, 0);
});

test("normalizeSifKeywords keeps only target ASIN rows when a target ASIN is supplied", () => {
  const sheet = {
    headers: ["ASIN", "关键词", "搜索量"],
    rows: [
      ["B000TEST01", "magnesium glycinate", "12000"],
      ["B000OTHER1", "other keyword", "5000"]
    ]
  };

  const result = normalizeSifKeywords(sheet, { targetAsin: "B000TEST01" });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].keyword, "magnesium glycinate");
});

test("mergeSifIntoRun enriches matching ASINs and clears the SIF missing-data prompt", () => {
  const run = {
    summary: { total: 1, strongCandidate: 1, observationCandidate: 0, manualReview: 0, rejected: 0, insufficientData: 0 },
    items: [{
      asin: "B000TEST01",
      status: "strong_candidate",
      missingData: [sifPrompt, "Market analysis export is needed"],
      passReasons: ["Strong monthly sales: 12000"],
      rejectionReasons: [],
      retentionReasons: []
    }]
  };

  const sif = normalizeSifKeywords({
    headers: ["ASIN", "关键词", "搜索量", "CPC", "自然流量占比", "是否品牌词"],
    rows: [
      ["B000TEST01", "magnesium glycinate", 12000, 1.25, "18%", ""],
      ["B000TEST01", "thorne magnesium", 9000, 1.8, "12%", "是"],
      ["B000OTHER1", "unmatched keyword", 5000, 0.9, "5%", ""]
    ]
  });

  const merged = mergeSifIntoRun(run, sif);

  assert.equal(merged.importInfo.sif.matchedAsins, 1);
  assert.equal(merged.importInfo.sif.unmatchedAsins, 1);
  assert.equal(merged.items[0].sif.keywordCount, 2);
  assert.equal(merged.items[0].sif.nonBrandExactKeywords[0], "magnesium glycinate");
  assert.equal(merged.items[0].keywordScore > 0, true);
  assert.equal(merged.items[0].missingData.includes(sifPrompt), false);
  assert.ok(merged.items[0].passReasons.some((reason) => reason.includes("SIF keyword data imported")));
});

test("mergeSifIntoRun analyzes selection-standard SIF points 6 through 10", () => {
  const run = {
    summary: { total: 1, strongCandidate: 1, observationCandidate: 0, manualReview: 0, rejected: 0, insufficientData: 0 },
    items: [{
      asin: "B000TEST01",
      brand: "Alevia",
      missingData: [sifPrompt],
      passReasons: [],
      rejectionReasons: [],
      retentionReasons: []
    }]
  };
  const sif = normalizeSifKeywords({
    headers: ["关键词", "关键词效果类型", "全部流量占比", "自然流量占比", "自然排名", "周搜索趋势", "全部流量变化", "关键词建议竞价（固定·精准)推荐"],
    rows: [
      ["amla", "[精准流量词, 出单词]", "0.22", "0.2", "1", "30000", "2000", "1.2"],
      ["alevia amla", "[品牌词, 精准流量词]", "0.18", "0.15", "2", "20000", "3000", "2.4"],
      ["amla capsules", "[精准流量词]", "0.15", "0.14", "3", "10000", "-500", "0.8"],
      ["organic amla", "[精准流量词]", "0.08", "0.07", "6", "6000", "100", "1.0"]
    ]
  }, { targetAsin: "B000TEST01" });

  const merged = mergeSifIntoRun(run, sif, { targetAsin: "B000TEST01" });
  const analysis = merged.items[0].sif.analysis;

  assert.equal(analysis.standardPoints.length, 5);
  assert.equal(analysis.naturalTrafficShare, 0.56);
  assert.equal(analysis.top10NonBrandExactTrafficKeywordCount, 3);
  assert.deepEqual(analysis.top10NonBrandExactTrafficKeywords, ["amla", "amla capsules", "organic amla"]);
  assert.equal(analysis.exactKeywordSearchVolume, 66000);
  assert.equal(analysis.keywordTrendRequiresManualReview, true);
  assert.equal(analysis.exactKeywordAverageCpc, 1.35);
});

test("mergeSifIntoRun analyzes SellerSprite keyword table columns A I J R and AD using the updated first-part rules", () => {
  const run = {
    summary: { total: 1, strongCandidate: 1, observationCandidate: 0, manualReview: 0, rejected: 0, insufficientData: 0 },
    items: [{
      asin: "B0GBVSBHTY",
      brand: "Alevia",
      missingData: [sifPrompt],
      passReasons: [],
      rejectionReasons: [],
      retentionReasons: []
    }]
  };
  const sif = normalizeSifKeywords({
    headers: ["流量词", "关键词翻译", "AC推荐词", "流量占比", "预估周曝光量", "关键词类型", "转化效果", "流量词类型", "自然流量占比", "广告流量占比", "自然排名", "自然排名页码", "更新时间", "广告排名", "广告排名页码", "更新时间", "ABA周排名", "月搜索量", "SPR", "标题密度", "购买量", "购买率", "展示量", "点击量", "商品数", "需供比", "广告竞品数", "点击总占比", "转化总占比", "PPC价格"],
    rows: [
      ["amla", "", "Y", "0.20", "", "", "", "", "0.70", "0.30", "", "", "", "", "", "", "", "120000", "", "", "", "", "", "", "", "", "", "", "", "$2.00"],
      ["alevia amla", "", "Y", "0.10", "", "", "", "", "0.90", "0.10", "", "", "", "", "", "", "", "60000", "", "", "", "", "", "", "", "", "", "", "", "$3.00"],
      ["amla capsules", "", "Y", "0.10", "", "", "", "", "0.60", "0.40", "", "", "", "", "", "", "", "55000", "", "", "", "", "", "", "", "", "", "", "", "$4.00"],
      ["organic amla", "", "Y", "0.10", "", "", "", "", "0.50", "0.50", "", "", "", "", "", "", "", "50000", "", "", "", "", "", "", "", "", "", "", "", "$1.00"]
    ]
  }, { targetAsin: "B0GBVSBHTY" });

  const merged = mergeSifIntoRun(run, sif, { targetAsin: "B0GBVSBHTY" });
  const analysis = merged.items[0].sif.analysis;

  assert.equal(analysis.naturalTrafficShare >= 0.6, true);
  assert.equal(analysis.top10BrandKeywordCount, 1);
  assert.equal(analysis.top10NonBrandExactTrafficKeywordCount, 3);
  assert.equal(analysis.hasOneKeywordOver100kSearches, true);
  assert.equal(analysis.keywordCountOver50kSearches, 4);
  assert.equal(analysis.searchDemandMeetsRule, true);
  assert.equal(analysis.keywordTrendRequiresManualReview, true);
  assert.equal(analysis.estimatedAdBid, 2.5);
  assert.equal(analysis.standardPoints.find((point) => point.point === 9).status, "manual");
});
