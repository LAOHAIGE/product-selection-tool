import assert from "node:assert/strict";
import test from "node:test";
import { displayRuleValue, parseRuleFormValues, selectionRulesChanged } from "../src/client/rule-form.js";

const fields = [
  { key: "minGrossMargin", label: "最低毛利率", min: 0, max: 1, displayScale: 100 },
  { key: "maxSellerCount", label: "最高卖家数", min: 0, integer: true },
  { key: "strongOpportunityScore", label: "强候选分", min: 0, max: 100 },
  { key: "observationOpportunityScore", label: "观察候选分", min: 0, max: 100 }
];

test("displayRuleValue converts decimal percentages for editing", () => {
  assert.equal(displayRuleValue(fields[0], 0.3), 30);
});

test("parseRuleFormValues converts displayed percentages back to decimals", () => {
  const result = parseRuleFormValues(fields, {
    minGrossMargin: "45",
    maxSellerCount: "3",
    strongOpportunityScore: "75",
    observationOpportunityScore: "55"
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rules.minGrossMargin, 0.45);
  assert.equal(result.rules.maxSellerCount, 3);
});

test("parseRuleFormValues reports invalid ranges, integers, and score ordering", () => {
  const result = parseRuleFormValues(fields, {
    minGrossMargin: "120",
    maxSellerCount: "2.5",
    strongOpportunityScore: "50",
    observationOpportunityScore: "60"
  });

  assert.deepEqual(result.errors.map((error) => error.key), ["minGrossMargin", "maxSellerCount", "strongOpportunityScore"]);
});

test("selectionRulesChanged treats a legacy run as using defaults", () => {
  assert.equal(selectionRulesChanged(undefined, { minPrice: 40 }, { minPrice: 25 }), true);
  assert.equal(selectionRulesChanged(undefined, { minPrice: 25 }, { minPrice: 25 }), false);
});
