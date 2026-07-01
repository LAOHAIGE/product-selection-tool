# Configurable Analysis Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each browser configure ASIN screening thresholds, the ASIN AI prompt, and the competitor AI prompt, then immediately reanalyze the current candidate pool when numeric rules change.

**Architecture:** Extend the shared rules module with field metadata and validation. The browser stores one complete rule configuration alongside its existing prompts and sends numeric rules with product imports or `POST /api/reanalyze`; the server remains authoritative for validation and scoring. Reanalysis operates on current run items so enrichment fields remain attached to each ASIN.

**Tech Stack:** Node.js ES modules, browser JavaScript, HTML/CSS, localStorage/IndexedDB, Node test runner.

---

### Task 1: Shared Rule Schema And Validation

**Files:**
- Modify: `src/shared/default-rules.mjs`
- Create: `tests/selection-rules.test.mjs`

- [ ] Write failing tests for metadata, default merging, numeric coercion, range errors, and strong-score/observation-score ordering.
- [ ] Run `node --test tests/selection-rules.test.mjs` and confirm exports are missing.
- [ ] Export `RULE_FIELDS` and `parseSelectionRules(input)` returning `{ rules, errors }`; use the existing `DEFAULT_RULES` as fallback and ignore unknown keys.
- [ ] Run the targeted test and confirm all cases pass.

### Task 2: Custom Import Rules And Reanalysis API

**Files:**
- Modify: `src/server/http-server.mjs`
- Modify: `tests/http-server.test.mjs`

- [ ] Write failing API tests proving `GET /api/rules` exposes defaults/schema, `/api/analyze` honors a base64 JSON rules header, `/api/reanalyze` changes classification, and enrichment fields remain unchanged.
- [ ] Run the targeted server tests and confirm the new response shape/header/endpoint fail.
- [ ] Decode `x-selection-rules-b64`, validate rules through `parseSelectionRules`, store `selectionRules` on each run, and return HTTP 400 with field errors for invalid values.
- [ ] Add `POST /api/reanalyze` using current run items and current browser session; merge recalculated results while preserving import info and per-ASIN enrichment.
- [ ] Run server tests and confirm all cases pass.

### Task 3: Rule Configuration Center UI

**Files:**
- Modify: `src/client/index.html`
- Modify: `src/client/styles.css`
- Modify: `src/client/app.js`
- Modify: `tests/client-ui.test.mjs`

- [ ] Write failing structure tests for the three rule tabs, numeric-field container, restore-default button, save button, client validation, rule header, and reanalysis request.
- [ ] Run `node --test tests/client-ui.test.mjs` and confirm the new controls are absent.
- [ ] Replace the AI config panel with a three-tab rule center. Render numeric fields from server metadata, display percentage values as 0-100, and keep DeepSeek Key separate from saved workspace data.
- [ ] Extend browser configuration with `selectionRules`; old saved configurations merge with defaults.
- [ ] On save, validate the form, persist prompts/rules, call `/api/reanalyze` when a run exists, hydrate the returned run, and show a precise success/error message. Prompt changes alone do not call DeepSeek.
- [ ] Make restore-default refill all three rule editors without saving until the user presses Save.
- [ ] Run client structure tests and confirm they pass.

### Task 4: Regression, Packaging, And Deployment

**Files:**
- Update deployment mirror under `.push-repo`
- Regenerate: `dist/product-selection-portable.zip`

- [ ] Run `npm.cmd test` and require zero failures.
- [ ] Run `node --check` for changed JavaScript modules.
- [ ] Start the app and verify rule tabs, default restore, save/reanalysis, and independent analysis-panel scrolling in the browser.
- [ ] Rebuild the portable package with `npm.cmd run build:portable`.
- [ ] Sync only intended source/tests/docs to `.push-repo`, inspect `git diff --check`, commit, push `main`, and verify the Render page contains the new rule center.
