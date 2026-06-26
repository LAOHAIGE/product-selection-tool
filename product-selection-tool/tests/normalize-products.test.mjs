import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProducts } from "../src/server/normalize-products.mjs";

test("normalizeProducts maps SellerSprite headers to canonical product records", () => {
  const sheet = {
    headers: ["ASIN", "商品标题", "品牌", "小类目", "月销量", "月销量增长率", "月销售额($)", "价格($)", "评分数", "评分", "FBA($)", "毛利率", "上架天数", "卖家数", "变体数", "Amazon's Choice", "商品详情页链接"],
    rows: [["B000TEST01", "Magnesium Capsules", "Test Brand", "Magnesium Mineral Supplements", "3200", "0.12", "96000", "29.99", "430", "4.5", "4.09", "0.72", "180", "1", "2", "Y", "https://www.amazon.com/dp/B000TEST01"]]
  };

  const result = normalizeProducts(sheet);

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].asin, "B000TEST01");
  assert.equal(result.products[0].monthlySales, 3200);
  assert.equal(result.products[0].price, 29.99);
  assert.equal(result.products[0].amazonChoice, true);
  assert.deepEqual(result.missingRequiredFields, []);
});

test("normalizeProducts reports missing required fields", () => {
  const result = normalizeProducts({ headers: ["ASIN", "商品标题"], rows: [["B000TEST01", "Title"]] });

  assert.equal(result.products.length, 1);
  assert.deepEqual(result.missingRequiredFields.sort(), ["brand", "fbaFee", "grossMargin", "listingAgeDays", "monthlySales", "price", "rating", "reviewCount", "sellerCount", "smallCategory"].sort());
});
