import { readFile, writeFile } from "node:fs/promises";
import { analyzeProducts } from "./analyze-products.mjs";
import { toCsv, toMarkdownReport } from "./export-results.mjs";
import { normalizeProducts } from "./normalize-products.mjs";
import { readWorkbook } from "./xlsx/workbook-reader.mjs";
import { DEFAULT_RULES } from "../shared/default-rules.mjs";

export function analyzeWorkbookBuffer(buffer) {
  const workbook = readWorkbook(buffer);
  const sheet = workbook.sheets[0];
  const normalized = normalizeProducts(sheet);
  const analysis = analyzeProducts(normalized.products, DEFAULT_RULES);
  return { ...analysis, importInfo: { sheetName: sheet.name, missingRequiredFields: normalized.missingRequiredFields } };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node src/server/cli-analyze.mjs <product-export.xlsx>");
    process.exitCode = 1;
    return;
  }
  const run = analyzeWorkbookBuffer(await readFile(input));
  await writeFile("screening-results.csv", toCsv(run.items), "utf8");
  await writeFile("screening-report.md", toMarkdownReport(run.summary, run.items), "utf8");
  console.log(JSON.stringify(run.summary, null, 2));
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  await main();
}
