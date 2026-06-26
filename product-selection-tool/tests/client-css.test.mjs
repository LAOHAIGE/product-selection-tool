import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("right detail panel can scroll independently inside the viewport", async () => {
  const css = await readFile("src/client/styles.css", "utf8");

  assert.match(css, /\.detail-panel,[\s\S]*\.ai-panel,[\s\S]*\.competitor-ai-panel\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.detail-panel,[\s\S]*\.ai-panel,[\s\S]*\.competitor-ai-panel\s*\{[^}]*scrollbar-gutter:\s*stable/s);
});

test("workspace uses a wide candidate pool and tabbed analysis panel", async () => {
  const css = await readFile("src/client/styles.css", "utf8");

  assert.match(css, /\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(760px,\s*1fr\)\s+minmax\(420px,\s*520px\)/s);
  assert.doesNotMatch(css, /\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(520px,\s*1fr\)\s+320px\s+320px\s+320px/s);
  assert.match(css, /\.candidate-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /table\s*\{[^}]*min-width:\s*760px/s);
  assert.match(css, /\.analysis-shell\s*\{[^}]*height:\s*var\(--analysis-panel-height\)/s);
  assert.match(css, /\.analysis-shell\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.analysis-tabs\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.analysis-panel\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.analysis-panel\.active\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.detail-panel,[\s\S]*\.ai-panel,[\s\S]*\.competitor-ai-panel\s*\{[^}]*min-height:\s*0/s);
  assert.match(css, /\.detail-panel,[\s\S]*\.ai-panel,[\s\S]*\.competitor-ai-panel\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*1180px\)[\s\S]*\.workspace,[\s\S]*\.metric-grid,[\s\S]*\.ai-config-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media\s*\(max-width:\s*1180px\)[\s\S]*\.analysis-shell\s*\{[^}]*height:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*1180px\)[\s\S]*\.detail-panel,[\s\S]*\.ai-panel,[\s\S]*\.competitor-ai-panel\s*\{[^}]*max-height:\s*70vh/s);
  assert.doesNotMatch(css, /\.detail-panel,\s*\.ai-panel,\s*\.competitor-ai-panel\s*\{[^}]*position:\s*sticky/s);
});
