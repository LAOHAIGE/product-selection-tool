import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceStorage, isValidWorkspaceRecord } from "../src/client/workspace-storage.js";

function memoryAdapter(initialValue = null) {
  let value = initialValue;
  return {
    async get() {
      return value;
    },
    async put(nextValue) {
      value = structuredClone(nextValue);
    },
    async delete() {
      value = null;
    }
  };
}

test("workspace storage saves and overwrites the current run", async () => {
  const storage = createWorkspaceStorage(memoryAdapter());

  await storage.save({ items: [{ asin: "BFIRST0001" }], summary: { total: 1 } });
  await storage.save({ items: [{ asin: "BSECOND001" }], summary: { total: 1 } });

  const record = await storage.load();
  assert.equal(record.version, 1);
  assert.match(record.savedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(record.run.items[0].asin, "BSECOND001");
});

test("workspace storage ignores damaged records", async () => {
  const storage = createWorkspaceStorage(memoryAdapter({ version: 1, savedAt: "bad", run: { items: "not-an-array" } }));

  assert.equal(await storage.load(), null);
  assert.equal(isValidWorkspaceRecord(null), false);
});

test("workspace storage rejects runs without an items array", async () => {
  const storage = createWorkspaceStorage(memoryAdapter());

  await assert.rejects(() => storage.save({ summary: { total: 0 } }), /items array/);
});
