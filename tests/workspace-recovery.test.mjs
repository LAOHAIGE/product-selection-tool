import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithWorkspaceRecovery } from "../src/client/workspace-recovery.js";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("workspace recovery restores the run and retries once when the server lost it", async () => {
  let requests = 0;
  let restores = 0;
  const fetchImpl = async () => {
    requests += 1;
    return requests === 1
      ? jsonResponse(400, { error: "Please import a product workbook before marking an ASIN as reviewed." })
      : jsonResponse(200, { items: [{ asin: "BRETRY0001", reviewed: true }] });
  };

  const response = await fetchWithWorkspaceRecovery(fetchImpl, "/api/item-reviewed", {}, {
    hasWorkspace: () => true,
    restoreWorkspace: async () => { restores += 1; }
  });

  assert.equal(response.status, 200);
  assert.equal(requests, 2);
  assert.equal(restores, 1);
});

test("workspace recovery does not retry unrelated validation errors", async () => {
  let restores = 0;
  const response = await fetchWithWorkspaceRecovery(
    async () => jsonResponse(400, { error: "ASIN is required." }),
    "/api/item-reviewed",
    {},
    { hasWorkspace: () => true, restoreWorkspace: async () => { restores += 1; } }
  );

  assert.equal(response.status, 400);
  assert.equal(restores, 0);
});
