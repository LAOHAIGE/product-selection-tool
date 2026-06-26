import assert from "node:assert/strict";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createStorage } from "../src/server/storage.mjs";

test("storage saves and reads analysis runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "product-selection-"));
  try {
    const storage = createStorage(dir);
    const saved = await storage.saveRun({ summary: { total: 1 }, items: [{ asin: "B000TEST01" }] });
    const loaded = await storage.getRun(saved.id);

    assert.equal(loaded.summary.total, 1);
    assert.equal(loaded.items[0].asin, "B000TEST01");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage returns the latest saved analysis run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "product-selection-"));
  try {
    const storage = createStorage(dir);
    await storage.saveRun({ id: "run-a", summary: { total: 1 }, items: [{ asin: "B000TEST01" }] });
    await storage.saveRun({ id: "run-b", summary: { total: 2 }, items: [{ asin: "B000TEST02" }] });

    const latest = await storage.getLatestRun();

    assert.equal(latest.id, "run-b");
    assert.equal(latest.summary.total, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage falls back to the newest legacy run file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "product-selection-"));
  try {
    const storage = createStorage(dir);
    await storage.saveRun({ id: "legacy-a", createdAt: "2026-06-01T00:00:00.000Z", summary: { total: 1 }, items: [{ asin: "B000TEST01" }] });
    await storage.saveRun({ id: "legacy-b", createdAt: "2026-06-02T00:00:00.000Z", summary: { total: 2 }, items: [{ asin: "B000TEST02" }] });
    await unlink(join(dir, "latest-run.json"));

    const latest = await storage.getLatestRun();

    assert.equal(latest.id, "legacy-b");
    assert.equal(latest.summary.total, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
