import assert from "node:assert/strict";
import test from "node:test";
import { makeXlsxFixture } from "./utils/xlsx-fixture.mjs";
import { readZipEntries } from "../src/server/xlsx/zip-reader.mjs";
import { readWorkbook } from "../src/server/xlsx/workbook-reader.mjs";

test("readZipEntries returns named file contents from an xlsx buffer", () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "商品标题", "月销量"],
    ["B000TEST01", "Sample Product", 3200]
  ]);

  const entries = readZipEntries(workbook);

  assert.equal(entries.has("xl/workbook.xml"), true);
  assert.equal(entries.has("xl/worksheets/sheet1.xml"), true);
  assert.match(entries.get("xl/worksheets/sheet1.xml").toString("utf8"), /B000TEST01/);
});

test("readWorkbook parses sheet names, headers, and rows", () => {
  const workbook = makeXlsxFixture([
    ["ASIN", "商品标题", "月销量", "价格($)"],
    ["B000TEST01", "Sample Product", 3200, 29.99],
    ["B000TEST02", "Second Product", 8500, 39.5]
  ]);

  const parsed = readWorkbook(workbook);

  assert.deepEqual(parsed.sheetNames, ["Product-US-Last-30-days"]);
  assert.deepEqual(parsed.sheets[0].headers, ["ASIN", "商品标题", "月销量", "价格($)"]);
  assert.equal(parsed.sheets[0].rows.length, 2);
  assert.deepEqual(parsed.sheets[0].rows[0], ["B000TEST01", "Sample Product", "3200", "29.99"]);
});
