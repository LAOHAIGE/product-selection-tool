import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RULES, RULE_FIELDS, parseSelectionRules } from "../src/shared/default-rules.mjs";

test("rule schema exposes every configurable screening threshold", () => {
  const keys = RULE_FIELDS.map((field) => field.key);

  assert.deepEqual(keys, Object.keys(DEFAULT_RULES));
  assert.equal(RULE_FIELDS.find((field) => field.key === "minGrossMargin").displayScale, 100);
  assert.equal(RULE_FIELDS.find((field) => field.key === "minRating").max, 5);
});

test("parseSelectionRules merges defaults and coerces numeric input", () => {
  const result = parseSelectionRules({ minPrice: "35", maxFbaFee: "5.5", minGrossMargin: "0.45", ignored: 123 });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rules.minPrice, 35);
  assert.equal(result.rules.maxFbaFee, 5.5);
  assert.equal(result.rules.minGrossMargin, 0.45);
  assert.equal(result.rules.minMonthlySales, DEFAULT_RULES.minMonthlySales);
  assert.equal("ignored" in result.rules, false);
});

test("parseSelectionRules reports field ranges and score ordering", () => {
  const result = parseSelectionRules({
    minRating: 6,
    minGrossMargin: 1.2,
    strongOpportunityScore: 50,
    observationOpportunityScore: 60
  });
  const errorKeys = result.errors.map((error) => error.key);

  assert.ok(errorKeys.includes("minRating"));
  assert.ok(errorKeys.includes("minGrossMargin"));
  assert.ok(errorKeys.includes("strongOpportunityScore"));
});

test("parseSelectionRules rejects empty and non-numeric values", () => {
  const result = parseSelectionRules({ minPrice: "", maxSellerCount: "many" });

  assert.deepEqual(result.errors.map((error) => error.key), ["minPrice", "maxSellerCount"]);
});
