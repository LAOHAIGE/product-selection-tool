import { FIELD_ALIASES, REQUIRED_PRODUCT_FIELDS, parseFlag, parseNumber } from "../shared/fields.mjs";

const NUMERIC_FIELDS = new Set([
  "monthlySales",
  "salesGrowthRate",
  "monthlyRevenue",
  "price",
  "reviewCount",
  "monthlyNewReviews",
  "rating",
  "reviewRate",
  "fbaFee",
  "grossMargin",
  "listingAgeDays",
  "sellerCount",
  "variantCount",
  "lqs"
]);

const FLAG_FIELDS = new Set(["amazonChoice", "bestSeller", "newRelease", "aPlus", "video", "spAds"]);

function buildHeaderMap(headers) {
  const headerToIndex = new Map(Array.from(headers, (header, index) => [String(header ?? "").trim(), index]));
  const canonicalToIndex = new Map();
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (headerToIndex.has(alias)) {
        canonicalToIndex.set(canonical, headerToIndex.get(alias));
        break;
      }
    }
  }
  return canonicalToIndex;
}

function convertValue(field, value) {
  if (NUMERIC_FIELDS.has(field)) return parseNumber(value);
  if (FLAG_FIELDS.has(field)) return parseFlag(value);
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeProducts(sheet) {
  const canonicalToIndex = buildHeaderMap(sheet.headers);
  const missingRequiredFields = REQUIRED_PRODUCT_FIELDS.filter((field) => !canonicalToIndex.has(field));
  const products = sheet.rows
    .filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""))
    .map((row) => {
      const product = {};
      for (const field of Object.keys(FIELD_ALIASES)) {
        const index = canonicalToIndex.get(field);
        product[field] = index === undefined ? null : convertValue(field, row[index]);
      }
      return product;
    });

  return { products, missingRequiredFields, mappedFields: Object.fromEntries(canonicalToIndex) };
}
