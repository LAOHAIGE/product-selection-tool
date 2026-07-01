export const DEFAULT_RULES = Object.freeze({
  minMonthlySales: 3000,
  minPrice: 25,
  minRating: 4.1,
  minSalesGrowthRate: 0,
  maxFbaFee: 6,
  maxFbaToPriceRatio: 0.2,
  minGrossMargin: 0.3,
  maxReviewCountForStrongCandidate: 2000,
  maxSellerCount: 5,
  maxListingAgeDays: 720,
  strongOpportunityScore: 75,
  observationOpportunityScore: 55,
  highRiskScore: 70
});

export const RULE_FIELDS = Object.freeze([
  { key: "minMonthlySales", label: "最低月销量", unit: "件", min: 0, step: 100, integer: true },
  { key: "minPrice", label: "最低价格", unit: "USD", min: 0, step: 1 },
  { key: "minRating", label: "最低评分", unit: "分", min: 0, max: 5, step: 0.1 },
  { key: "minSalesGrowthRate", label: "最低销量增长率", unit: "%", min: 0, max: 1, step: 0.01, displayScale: 100 },
  { key: "maxFbaFee", label: "最高 FBA 费用", unit: "USD", min: 0, step: 0.5 },
  { key: "maxFbaToPriceRatio", label: "最高 FBA/价格比", unit: "%", min: 0, max: 1, step: 0.01, displayScale: 100 },
  { key: "minGrossMargin", label: "最低毛利率", unit: "%", min: 0, max: 1, step: 0.01, displayScale: 100 },
  { key: "maxReviewCountForStrongCandidate", label: "强候选最高 Review 数", unit: "个", min: 0, step: 100, integer: true },
  { key: "maxSellerCount", label: "最高卖家数", unit: "个", min: 0, step: 1, integer: true },
  { key: "maxListingAgeDays", label: "最高上架天数", unit: "天", min: 0, step: 30, integer: true },
  { key: "strongOpportunityScore", label: "强候选最低机会分", unit: "分", min: 0, max: 100, step: 1 },
  { key: "observationOpportunityScore", label: "观察候选最低机会分", unit: "分", min: 0, max: 100, step: 1 },
  { key: "highRiskScore", label: "高风险分界线", unit: "分", min: 0, max: 100, step: 1 }
]);

function numericValue(value) {
  if (typeof value === "string" && value.trim() === "") return Number.NaN;
  return Number(value);
}

export function parseSelectionRules(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const rules = {};
  const errors = [];

  for (const field of RULE_FIELDS) {
    const supplied = Object.prototype.hasOwnProperty.call(source, field.key);
    const value = numericValue(supplied ? source[field.key] : DEFAULT_RULES[field.key]);
    let message = "";
    if (!Number.isFinite(value)) message = `${field.label}必须是数字。`;
    else if (field.min !== undefined && value < field.min) message = `${field.label}不能低于 ${field.min * (field.displayScale || 1)}${field.unit || ""}。`;
    else if (field.max !== undefined && value > field.max) message = `${field.label}不能高于 ${field.max * (field.displayScale || 1)}${field.unit || ""}。`;
    else if (field.integer && !Number.isInteger(value)) message = `${field.label}必须是整数。`;

    if (message) {
      errors.push({ key: field.key, message });
      rules[field.key] = DEFAULT_RULES[field.key];
    } else {
      rules[field.key] = value;
    }
  }

  if (rules.strongOpportunityScore < rules.observationOpportunityScore) {
    errors.push({ key: "strongOpportunityScore", message: "强候选最低机会分不能低于观察候选分。" });
  }

  return { rules, errors };
}
