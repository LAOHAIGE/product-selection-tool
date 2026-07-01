export function displayRuleValue(field, value) {
  return Number(value) * (field.displayScale || 1);
}

export function parseRuleFormValues(fields, displayedValues) {
  const rules = {};
  const errors = [];
  for (const field of fields || []) {
    const raw = displayedValues[field.key];
    const displayed = raw === "" || raw === null || raw === undefined ? Number.NaN : Number(raw);
    const value = displayed / (field.displayScale || 1);
    let message = "";
    if (!Number.isFinite(value)) message = `${field.label}必须是数字。`;
    else if (field.min !== undefined && value < field.min) message = `${field.label}低于允许范围。`;
    else if (field.max !== undefined && value > field.max) message = `${field.label}超出允许范围。`;
    else if (field.integer && !Number.isInteger(value)) message = `${field.label}必须是整数。`;

    if (message) errors.push({ key: field.key, message });
    else rules[field.key] = value;
  }

  if (
    Number.isFinite(rules.strongOpportunityScore)
    && Number.isFinite(rules.observationOpportunityScore)
    && rules.strongOpportunityScore < rules.observationOpportunityScore
  ) {
    errors.push({ key: "strongOpportunityScore", message: "强候选机会分不能低于观察候选分。" });
  }

  return { rules, errors };
}

export function selectionRulesChanged(runRules, configuredRules, defaultRules) {
  return JSON.stringify(runRules || defaultRules || {}) !== JSON.stringify(configuredRules || {});
}
