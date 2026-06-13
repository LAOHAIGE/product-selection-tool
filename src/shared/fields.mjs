export const CANONICAL_FIELDS = Object.freeze({
  asin: "asin",
  parentAsin: "parentAsin",
  title: "title",
  brand: "brand",
  categoryPath: "categoryPath",
  largeCategory: "largeCategory",
  smallCategory: "smallCategory",
  monthlySales: "monthlySales",
  salesGrowthRate: "salesGrowthRate",
  monthlyRevenue: "monthlyRevenue",
  price: "price",
  coupon: "coupon",
  reviewCount: "reviewCount",
  monthlyNewReviews: "monthlyNewReviews",
  rating: "rating",
  reviewRate: "reviewRate",
  fbaFee: "fbaFee",
  grossMargin: "grossMargin",
  listingDate: "listingDate",
  listingAgeDays: "listingAgeDays",
  sellerCount: "sellerCount",
  variantCount: "variantCount",
  lqs: "lqs",
  packageSizeTier: "packageSizeTier",
  amazonChoice: "amazonChoice",
  bestSeller: "bestSeller",
  newRelease: "newRelease",
  aPlus: "aPlus",
  video: "video",
  spAds: "spAds",
  sourceUrl: "sourceUrl",
  imageUrl: "imageUrl"
});

export const REQUIRED_PRODUCT_FIELDS = Object.freeze([
  "asin",
  "title",
  "brand",
  "smallCategory",
  "monthlySales",
  "price",
  "reviewCount",
  "rating",
  "fbaFee",
  "grossMargin",
  "listingAgeDays",
  "sellerCount"
]);

export const FIELD_ALIASES = Object.freeze({
  asin: ["ASIN"],
  parentAsin: ["父ASIN", "Parent ASIN"],
  title: ["商品标题", "Title", "Product Title"],
  brand: ["品牌", "Brand"],
  categoryPath: ["类目路径", "Category Path"],
  largeCategory: ["大类目", "Main Category"],
  smallCategory: ["小类目", "Subcategory"],
  monthlySales: ["月销量", "Monthly Sales"],
  salesGrowthRate: ["月销量增长率", "Sales Growth Rate"],
  monthlyRevenue: ["月销售额($)", "Monthly Revenue"],
  price: ["价格($)", "Price"],
  coupon: ["Coupon"],
  reviewCount: ["评分数", "Review Count"],
  monthlyNewReviews: ["月新增评分数", "Monthly New Reviews"],
  rating: ["评分", "Rating"],
  reviewRate: ["留评率", "Review Rate"],
  fbaFee: ["FBA($)", "FBA Fee"],
  grossMargin: ["毛利率", "Gross Margin"],
  listingDate: ["上架时间", "Listing Date"],
  listingAgeDays: ["上架天数", "Listing Age Days"],
  sellerCount: ["卖家数", "Seller Count"],
  variantCount: ["变体数", "Variant Count"],
  lqs: ["LQS"],
  packageSizeTier: ["包装尺寸分段", "Package Size Tier"],
  amazonChoice: ["Amazon's Choice"],
  bestSeller: ["Best Seller标识", "Best Seller"],
  newRelease: ["New Release标识", "New Release"],
  aPlus: ["A+页面", "A+ Page"],
  video: ["视频介绍", "Video"],
  spAds: ["SP广告", "SP Ads"],
  sourceUrl: ["商品详情页链接", "Product URL"],
  imageUrl: ["商品主图", "Image URL"]
});

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/,/g, "").replace(/\$/g, "").replace(/%$/, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFlag(value) {
  if (value === null || value === undefined || value === "") return false;
  return ["y", "yes", "true", "1"].includes(String(value).trim().toLowerCase());
}
