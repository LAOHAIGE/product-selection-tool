import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("portable launcher starts the local server and supports a bundled Node runtime", async () => {
  const launcher = await readFile("portable/启动选品工具.cmd", "utf8");

  assert.match(launcher, /Start-ProductSelection\.ps1/);
  assert.match(launcher, /-NoExit/);
});

test("portable PowerShell launcher writes logs and starts the local server", async () => {
  const launcher = await readFile("portable/Start-ProductSelection.ps1", "utf8");

  assert.match(launcher, /runtime\\node\.exe/);
  assert.match(launcher, /logs/);
  assert.match(launcher, /launcher\.log/);
  assert.match(launcher, /OPEN_BROWSER/);
  assert.match(launcher, /src\\server\\http-server\.mjs/);
  assert.match(launcher, /Find-FreePort/);
});

test("portable build script excludes local data and creates a zip", async () => {
  const script = await readFile("scripts/build-portable.ps1", "utf8");

  assert.match(script, /app\\data/);
  assert.doesNotMatch(script, /Copy-Item[^\n]+data/s);
  assert.match(script, /Compress-Archive/);
});

test("portable build script rebuilds extracted package from a clean directory", async () => {
  const script = await readFile("scripts/build-portable.ps1", "utf8");

  assert.match(script, /\$extractedRoot/);
  assert.match(script, /Remove-Item\s+-LiteralPath\s+\$resolvedExtracted/s);
  assert.match(script, /Refusing to delete an extracted package outside dist/);
  assert.match(script, /Could not update the extracted package/);
});

test("portable build script bundles local Node runtime when available", async () => {
  const script = await readFile("scripts/build-portable.ps1", "utf8");

  assert.match(script, /Resolve-NodeExe/);
  assert.match(script, /runtime\\node\.exe/);
  assert.match(script, /Copy-Item\s+-LiteralPath\s+\$nodeExe\s+-Destination\s+\$runtimeNode/s);
});
