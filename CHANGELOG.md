# Changelog

## Unreleased

### Agent skills

- Added the full [`mattpocock/skills`](https://github.com/mattpocock/skills) pack (37 skills, including `setup-matt-pocock-skills`) under `.agents/skills/` via `npx skills@latest add mattpocock/skills -s '*' -a cursor -y --copy`. Per-repo `/setup-matt-pocock-skills` was **not** run in this change (issue-tracker choice needs a human). After merge, run `/setup-matt-pocock-skills` in Cursor/Agent against this repo and select **GitHub Issues**.

### Context Health / Value Analysis

- **V3 Value Analysis (runtime):** `cap inspect` / `--json` / Web Health include a `profiler` block derived from Registry activity (successful uses + distinct UTC days as sessions). Fills `cost.value` / `cost.valuePerCost` when linkable; ranks value-per-cost; lists underused managed capabilities (`src/profiler.js`). JSON key `profiler` is unchanged.
- Funnel `usedUnknown` is true only when no `use` attempts exist (failed / `connection_required` attempts count as observed). Adds `useAttempts`.
- `cap use` records `connection_required` attempts in activity (`success: false`) so Value Analysis can see demand without a live MCP connection.
- Human `cap inspect` adds a **价值分析** section (性价比排行 / 建议减负); Web Health shows a **价值分析** panel.
- User-facing copy uses **Value Analysis** / **价值分析**. Internal identifiers (`profiler.js`, `buildProfiler`, JSON `profiler`) stay as-is.
- This is the runtime that follows the docs-only V3 note in **0.2.0** — 0.2.0 did not ship Value Analysis.

## 0.2.0

Rollup of work shipped after 0.1.x. npm registry publish remains deferred; install via `npx -y github:Harveyallen/cap setup` (or clone + `node ./bin/cap.js setup`).

### Breaking

- Renamed the acquire flow to **add** with no compatibility alias. CLI is `cap add`; MCP tool is `cap.add`; programmatic API is `addCapability`; activity records use `action: "add"`; web API is `POST /api/add`. `cap acquire` and `cap.acquire` are gone.

### Context Health

- CAP is documented as an Agent Capability & Context Control Plane in `docs/context-health.md`.
- `cap inspect` (human + `--json`) and Web Health show Context Health: `budget`, `pressure` (band + healthScore), Installed→Enabled→Injected→Used funnel, per-item estimated cost, richer inventory, and token-ranked migration suggestions.
- Inspect JSON keeps `funnel.injected` and adds `configured` plus a scan-only note. Human `cap inspect` and Web Health use labeled Chinese sections (健康 / 占用 / 清单 / 建议). 入口 and 漏斗 stay in `--json` only.
- Inspect recognizes the local `cap-mcp` entry as the CAP surface: real default tool count/schemas (3, or 4 when `CAP_MCP_INSPECT=1`), status `cap`, excluded from Move → CAP / `reclaimableTokens`. A server merely named `cap` is not treated as the surface. `optimize --apply` keeps `cap-mcp` and only migrates other JSON MCP servers.
- Skill Pressure / `contextTokens` count only name + description; skill body is `instructionTokens` and on-demand. `funnel.installed` is local scanned names only (not the seed catalog). `effectiveBudget <= 0` yields pressure band `unknown`. `reclaimableTokens` is a gross estimate and does not subtract the 3 CAP entry tools. `summary.registryCapabilities` is the Registry `add` count.
- Budget defaults: nominal 200000, harness soft limit 200000, reserve 32000; override with `CAP_NOMINAL_WINDOW` / `CAP_HARNESS_SOFT_LIMIT` / `CAP_RESERVE_TOKENS` / `CAP_EFFECTIVE_BUDGET`.
- V3 Capability Context Profiler is **documented only** in this release (per-capability Activity usage, Value/Cost, lazy-loading candidates). **No V3 runtime in 0.2.0.**

### Setup

- Added `cap setup` (`--agent auto|claude|codex`) to backup and write Claude Code / Codex MCP (`cap.search` / `cap.add` / `cap.use`; `cap.inspect` via `CAP_MCP_INSPECT=1`), install a `cap-context-health` Skill, and run inspect. Codex TOML that cannot be edited safely prints a manual snippet; Skill + inspect still run.
- README Install prefers the GitHub npx path (`npx -y github:Harveyallen/cap setup`). `@capability-layer/cap` is not on npm yet.

### Catalog / public API

- Validate the seed catalog against `data/catalog.schema.json` with a zero-dependency checker (required, enum, id pattern, minItems, reject extra fields).
- Narrowed the `src/index.js` public surface to `searchCapabilities`, `addCapability`, `useCapability`, `inspectLocal`, `loadCatalog`, and `loadState`.
- MCP `initialize` `serverInfo.version` matches `package.json` (`0.2.0`).

## 0.1.2

- **Breaking:** renamed the acquire flow to add with no compatibility alias. CLI is `cap add`; MCP tool is `cap.add`; programmatic API is `addCapability`; activity records use `action: "add"`; web API is `POST /api/add`. `cap acquire` and `cap.acquire` are gone.

## 0.1.1

- Added AI-oriented repo docs: `AGENTS.md`, `llms.txt`, `docs/architecture.md`, Claude/Cursor/Copilot pointers.
- Added shared agent skills under `.agents/skills` and project `.mcp.json` for local CAP dogfooding.
- Exported a stable programmatic API via `src/index.js` and documented the catalog with `data/catalog.schema.json`.

## 0.1.0

- Added local Claude Code and Codex capability inspection.
- Added intent-first capability search and curated seed catalog.
- Added CAP Registry, acquire/use flow, activity records, and guarded optimization.
- Added CLI, Web Search, and MCP stdio interfaces.
