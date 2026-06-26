import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeWorkbookBuffer } from "../src/server/cli-analyze.mjs";

const productFile = "C:/Users/Administrator/Downloads/Product-Health&Household-US-Last-30-days-19089.xlsx";

test("real SellerSprite product file imports and analyzes all rows when available", async (t) => {
  if (!existsSync(productFile)) {
    t.skip("Initial product file is not present on this machine");
    return;
  }

  const buffer = await readFile(productFile);
  const run = analyzeWorkbookBuffer(buffer);

  assert.equal(run.summary.total, 1844);
  assert.equal(run.items.length, 1844);
  assert.ok(run.summary.strongCandidate + run.summary.observationCandidate + run.summary.manualReview + run.summary.rejected + run.summary.insufficientData > 0);
});
