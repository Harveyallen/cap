# Changelog

## Unreleased

- Added `cap setup` (`--agent auto|claude|codex`) to backup and write Claude Code / Codex MCP (`cap.search` / `cap.add` / `cap.use`; `cap.inspect` via `CAP_MCP_INSPECT=1`), install a `cap-context-health` Skill, and run inspect. Codex TOML that cannot be edited safely prints a manual snippet; Skill + inspect still run.
- README 快速开始 / 接入 Agent condensed into a one-line Install (`npx -y @capability-layer/cap setup`) with an honest unpublished fallback (`npx -y github:Harveyallen/cap` or clone + `node ./bin/cap.js setup`).
- Inspect recognizes the local `cap-mcp` entry as the CAP surface: real default tool count/schemas (3, or 4 when `CAP_MCP_INSPECT=1`), status `cap`, excluded from Move → CAP / `reclaimableTokens`. A server merely named `cap` is not treated as the surface.
- Inspect JSON keeps `funnel.injected` and adds `configured` plus a scan-only note. Skill rows show on-demand body tokens. Project `.mcp.json` is labeled `Project`.
- Human `cap inspect` and Web Health use labeled Chinese sections (健康 / 占用 / 清单 / 建议). 入口 and 漏斗 stay in `--json` only. `summary.registryCapabilities` is the Registry `add` count.
- `optimize --apply` keeps `cap-mcp` entries and only migrates other JSON MCP servers.
- Documented CAP as an Agent Capability & Context Control Plane in `docs/context-health.md`.
- `cap inspect` (human + `--json`) and Web Health now show Context Health: `budget`, `pressure` (band + healthScore), Installed→Enabled→Injected→Used funnel, per-item estimated cost, richer inventory, and token-ranked migration suggestions.
- Skill Pressure / `contextTokens` count only name + description; skill body is `instructionTokens` and on-demand. `funnel.installed` is local scanned names only (not the seed catalog). `effectiveBudget <= 0` yields pressure band `unknown`. `reclaimableTokens` is a gross estimate and does not subtract the 3 CAP entry tools.
- Budget defaults: nominal 200000, harness soft limit 200000, reserve 32000; override with `CAP_NOMINAL_WINDOW` / `CAP_HARNESS_SOFT_LIMIT` / `CAP_RESERVE_TOKENS` / `CAP_EFFECTIVE_BUDGET`.
- Validate the seed catalog against `data/catalog.schema.json` with a zero-dependency checker (required, enum, id pattern, minItems, reject extra fields).
- Narrowed the `src/index.js` public surface to `searchCapabilities`, `addCapability`, `useCapability`, `inspectLocal`, `loadCatalog`, and `loadState`.

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
