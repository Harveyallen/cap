# Changelog

## Unreleased

### Local skills

- **`cap search` finds local Agent skills.** `SKILL.md` files under Claude Code / Codex / Cursor / shared `.agents/skills` (user and project) are overlaid on the seed catalog, including Cursor `skills-cursor` and `plugins/cache/…/skills`. Intents like `画架构图` / `架构图` hit a skill whose **description** mentions architecture diagrams — not a hardcoded name, and not nearby “architecture” skills such as pstack `architect` or `improve-codebase-architecture`. Results include summary + `skill_path` only — not the skill body.
- **`cap add` / `cap use` work without hand-written catalog JSON.** Add accepts the generated `skill.<slug>` id. Use returns path + summary; `include_body: true` loads SKILL.md on demand. Seed Skill stubs without a local file stay `connection_required`.
- **`cap setup` and `cap optimize --apply --yes` index discovered skills** into Registry `local_skills`. Optimize preview lists `plan.skills`. Skill files are not moved or rewritten. Default Agent surface stays search / add / use.
- See [docs/local-skills.md](./docs/local-skills.md).

### Agent path (DingTalk / CJK)

- **`cap search` matches natural CJK send phrasing.** Catalog needles (keywords / intents) that appear inside the query are scored, so `帮我发钉钉消息` / `发钉钉消息` rank `dingtalk.im.message.send` the same way `发送钉钉消息` already did. Seed intents/keywords add those aliases. Latin matching is unchanged; short tokens like `im` / `pr` are not reverse-matched.
- **`cap inject` follows search.** DingTalk-send intents now get a non-empty `load` for that capability. Still plan-only (`mutates: false`); default MCP surface stays search/add/use.
- **Missing MCP launch is actionable.** `cap add` / `cap use` attach `next_steps`, `tried_aliases`, and `found_servers` (names only) when `binding.bound` is false / `reason: missing_launch`. Auto-bind accepts compact aliases (`dingtalk-mcp`, `dingding`, `钉钉`) and scans Cursor `~/.cursor/mcp.json` / project `.cursor/mcp.json` in addition to Claude / project `.mcp.json`. Remaining manual step: install a stdio DingTalk MCP and put credentials in that server’s `env` — see [docs/mcp-gateway.md](./docs/mcp-gateway.md).

## 0.4.0

Cuts **MCP gateway** (`cap.use` calls third-party stdio tools), **on-demand `input_schema`** on search/add, DingTalk seed capability, and **V4 Dynamic Injection** (plan-only). Not a patch: Agents can now proxy MCP behind three tools and fill `cap.use` from a real schema. Install with `npx -y @harvey2008/cap@0.4.0 setup` (or `@harvey2008/cap` for current). GitHub `npx -y github:Harveyallen/cap setup` remains a fallback. npm publish / git tag / GitHub Release stay with the coordinator after merge.

### MCP gateway

- **`cap.use` can call third-party MCP tools** over stdio JSON-RPC when a Capability has `mcp_tool` and a launch binding is resolved (local `mcpServers` / `mcp_servers`, Registry `external_providers` after `optimize --apply`, `--server`, explicit launch, or catalog `command`/`args`). Binding is stored in `~/.cap/registry.json` `mcp_bindings`. The Agent-facing MCP surface stays `cap.search` / `cap.add` / `cap.use` — downstream tools are not re-injected.
- Missing launch or `mcp_tool` still returns `connection_required` with a `reason` (`missing_launch` / `missing_mcp_tool` / `unsupported_transport` / `unsupported_type`). Spawn/protocol errors return `failed`. No fake success.
- Seed catalog: `mcp_server` on MCP providers; `mcp_tool` on GitHub / Postgres / DingTalk capabilities. DingTalk is a stub (`dingtalk.im.message.send` → tool `send_message`, server key `dingtalk`). Real DingTalk OAuth is out of scope. See [docs/mcp-gateway.md](./docs/mcp-gateway.md).
- `cap add --server <mcp-name>` (MCP `cap.add` optional `server`) pins which local server to bind. Add/use results list `envKeys` only; env values stay in the 0600 registry file and are not logged.

### On-demand `input_schema`

- **`cap.search` / `cap.add` attach JSON Schema** for that capability’s `cap.use` `input` (CLI, MCP, programmatic), plus `schema_source`: `"mcp"` from a brief downstream `tools/list` when a stdio launch exists, otherwise `"catalog"` (including git / ripgrep builtins). Catalog `inputs` are upgraded beyond stringly types (`path`, `secret`, `number`, `object`, …).
- Default Agent `tools/list` stays 3 tools — downstream schemas are not re-injected. `cap inject` does not spawn MCP for schemas. See [docs/mcp-gateway.md](./docs/mcp-gateway.md).

### Context Health / Dynamic Injection

- **V4 Dynamic Injection (runtime, plan-only):** `cap inject <task>` (`--json`) builds a minimal load/defer plan for that task instead of assuming the full catalog or Direct MCP surface is resident. Ranking reuses `searchCapabilities` with a relative score floor; CAP entry tools stay in `keepResident`. `savedVsCatalog` uses seed `context_cost`; `savedVsResident` uses inspect estimates with after = CAP surface only (`cap.use` does not add provider schemas to the resident window). Does not mutate Agent configs (`mutates: false`). MCP tool `cap.inject` is opt-in (`CAP_MCP_INJECT=1`), so the default 3-tool surface is unchanged.
- Human `cap inspect` next-step line points at `cap inject <任务>`.

### Version surface

- Package version is `0.4.0`. CLI help/banner and MCP `initialize` `serverInfo.version` still read `package.json`.

## 0.3.0

Cuts **V3 Value Analysis** as a shipped runtime. First npm registry publish uses `@harvey2008/cap` (`npx -y @harvey2008/cap setup`; GitHub `npx -y github:Harveyallen/cap setup` remains a fallback). No git tags or GitHub Releases in this repo yet.

### Context Health / Value Analysis

- **V3 Value Analysis (runtime):** `cap inspect` / `--json` / Web Health include a `profiler` block derived from Registry activity (successful uses + distinct UTC days as sessions). Fills `cost.value` / `cost.valuePerCost` when linkable; ranks value-per-cost; lists underused managed capabilities (`src/profiler.js`). JSON key `profiler` is unchanged.
- Funnel `usedUnknown` is true only when no `use` attempts exist (failed / `connection_required` attempts count as observed). Adds `useAttempts`.
- `cap use` records `connection_required` attempts in activity (`success: false`) so Value Analysis can see demand without a live MCP connection.
- Human `cap inspect` adds a **价值分析** section (性价比排行 / 建议减负); Web Health shows a **价值分析** panel.
- User-facing copy uses **Value Analysis** / **价值分析**. Internal identifiers (`profiler.js`, `buildProfiler`, JSON `profiler`) stay as-is.
- This is the runtime that follows the docs-only V3 note in **0.2.0** — 0.2.0 did not ship Value Analysis.

### Agent skills

- Added the full [`mattpocock/skills`](https://github.com/mattpocock/skills) pack (37 skills, including `setup-matt-pocock-skills`) under `.agents/skills/` via `npx skills@latest add mattpocock/skills -s '*' -a cursor -y --copy`. Per-repo `/setup-matt-pocock-skills` was **not** run in this change (issue-tracker choice needs a human). After merge, run `/setup-matt-pocock-skills` in Cursor/Agent against this repo and select **GitHub Issues**.

### Version surface

- Package name is `@harvey2008/cap` for the first npm registry publish (version stays `0.3.0`). `publishConfig.access` is `public` so the scoped package can be published to the public registry.
- CLI help/banner and MCP `initialize` `serverInfo.version` read `package.json` so they cannot drift (banner was still `CAP 0.1`; MCP was hardcoded `0.2.0`).

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
