import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_AI_PROMPT, DEFAULT_COMPETITOR_PROMPT, loadAiConfig, publicAiConfig, saveAiConfig } from "../src/server/ai-config.mjs";

test("loadAiConfig returns the default prompt when no config exists", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "ai-config-default-"));
  try {
    const config = await loadAiConfig(storageDir);

    assert.equal(config.prompt, DEFAULT_AI_PROMPT);
    assert.equal(config.competitorPrompt, DEFAULT_COMPETITOR_PROMPT);
    assert.equal(config.isDefault, true);
    assert.equal(config.competitorPromptIsDefault, true);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test("saveAiConfig persists a custom prompt", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "ai-config-save-"));
  try {
    const saved = await saveAiConfig(storageDir, { prompt: "请优先判断能不能做，然后给出打法。" });
    const loaded = await loadAiConfig(storageDir);

    assert.equal(saved.prompt, "请优先判断能不能做，然后给出打法。");
    assert.equal(loaded.prompt, "请优先判断能不能做，然后给出打法。");
    assert.equal(loaded.isDefault, false);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test("saveAiConfig persists a custom competitor prompt", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "ai-config-competitor-prompt-"));
  try {
    const saved = await saveAiConfig(storageDir, {
      prompt: "ASIN prompt",
      competitorPrompt: "竞品分析先分配方，再给价格带。"
    });
    const loaded = await loadAiConfig(storageDir);
    const publicConfig = publicAiConfig(loaded);

    assert.equal(saved.prompt, "ASIN prompt");
    assert.equal(saved.competitorPrompt, "竞品分析先分配方，再给价格带。");
    assert.equal(loaded.competitorPrompt, "竞品分析先分配方，再给价格带。");
    assert.equal(loaded.competitorPromptIsDefault, false);
    assert.equal(publicConfig.competitorPrompt, "竞品分析先分配方，再给价格带。");
    assert.equal(publicConfig.competitorPromptIsDefault, false);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test("saveAiConfig persists DeepSeek key but publicAiConfig masks it", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "ai-config-key-"));
  try {
    const saved = await saveAiConfig(storageDir, {
      prompt: "Custom prompt",
      deepseekApiKey: "sk-test-secret-123456"
    });
    const loaded = await loadAiConfig(storageDir);
    const publicConfig = publicAiConfig(loaded);

    assert.equal(saved.deepseekApiKey, "sk-test-secret-123456");
    assert.equal(loaded.deepseekApiKey, "sk-test-secret-123456");
    assert.equal(publicConfig.deepseekKeyConfigured, true);
    assert.equal(publicConfig.deepseekKeyPreview, "sk-****3456");
    assert.equal(Object.hasOwn(publicConfig, "deepseekApiKey"), false);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test("saveAiConfig keeps existing DeepSeek key when only prompt changes", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "ai-config-merge-"));
  try {
    await saveAiConfig(storageDir, {
      prompt: "Prompt A",
      deepseekApiKey: "sk-test-secret-abcdef"
    });
    await saveAiConfig(storageDir, { prompt: "Prompt B" });
    const loaded = await loadAiConfig(storageDir);

    assert.equal(loaded.prompt, "Prompt B");
    assert.equal(loaded.deepseekApiKey, "sk-test-secret-abcdef");
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});
