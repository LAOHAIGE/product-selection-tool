import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function runId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

export function createStorage(rootDir = "data") {
  const runsDir = join(rootDir, "runs");
  const latestPath = join(rootDir, "latest-run.json");
  return {
    async saveRun(run) {
      await mkdir(runsDir, { recursive: true });
      const id = run.id || runId();
      const saved = { id, createdAt: new Date().toISOString(), ...run };
      await writeFile(join(runsDir, `${id}.json`), JSON.stringify(saved, null, 2), "utf8");
      await writeFile(latestPath, JSON.stringify(saved, null, 2), "utf8");
      return saved;
    },
    async getRun(id) {
      return readJson(join(runsDir, `${id}.json`));
    },
    async getLatestRun() {
      try {
        return await readJson(latestPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      try {
        const files = await readdir(runsDir);
        const runs = await Promise.all(
          files
            .filter((file) => file.endsWith(".json"))
            .map((file) => readJson(join(runsDir, file)).catch(() => null))
        );
        return runs
          .filter(Boolean)
          .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0] || null;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }
  };
}
