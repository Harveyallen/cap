# Changelog

## Unreleased

## 0.5.0 — 2026-10-21

Rollup of work merged after **0.4.1** (#23–#48 on `main`): temporary try mode, pin/exclude Direct Exposure controls, Observation Period readiness, post-optimize savings validation, Codex dotted-table TOML migrate, setup CAP-surface reuse, inventory filters / Skill overlap, Registry search Activity, and the Capability Router north-star docs. Install with `npx -y @harvey2008/cap@0.5.0 setup` (or `@harvey2008/cap` for current). GitHub `npx -y github:Harveyallen/cap setup` remains a fallback. npm publish / git tag / GitHub Release stay with the coordinator after merge.

### Try mode (USE-11)

- **`cap try` / `cap cleanup` are a local trial path.** Try runs a seed, local-skill, or already-managed Provider through a temporary ManagedBinding (same executors as `cap.use`) and does **not** write Agent configs — not Direct Exposure. Cleanup removes that trial binding and any Registry `mcp_bindings` launch copy the trial created, and keeps an anonymous local outcome record (`try` / `use` Activity rows with `anonymous` + `local`; no input, env, or remote telemetry).
- **`cap add` during a trial promotes it** to a persistent ManagedBinding. Cleanup then keeps the binding and still retains the outcome. Ordinary `cap.use` without try stays a persistent implicit add.
- Remote public-catalog download/try is refused until Phase 3 ACQ-*. Local SKILL.md files are never deleted. Web: `POST /api/try` and `/api/cleanup`. Default MCP tools stay `cap.search` / `cap.add` / `cap.use`. See [docs/try-mode.md](./docs/try-mode.md).

### Setup (ONB-09)

- **`cap setup` reuses a compatible CAP install instead of adding another surface.** Any existing `cap-mcp` entry (canonical `cap` or another name) is upgraded in place. Extra `cap-mcp` servers in the same Claude JSON or Codex TOML are removed after a `.cap-backup`. A second Claude user file (`.claude.json` vs `settings.json`) that also has `cap-mcp` is stripped so that Agent sees one CAP surface. Project `.mcp.json` is still not a setup mutate target.
- **Marked CLI launchers already on `PATH` are updated, not duplicated** into a second bin directory.
- JSON `install.reused` / `install.deduped` / `install.upgraded` records the outcome. Human setup prints 复用 / 去重 / 升级.

### Inventory (INV-10 / INV-06)

- **Inspect filters** (`cap inspect` and `GET /api/inspect`, Web Health 清单): `--agent`, `--scope user|project|shared|plugin`, `--type mcp|skill`, `--status`, `--source` (path substring), `--cost-min` / `--cost-max` (resident `contextTokens`), `--reason duplicate|overlap|migrate|pinned|excluded|cap-surface`. Tiles / pressure stay the full report; only the inventory listing is filtered (`filtered` in JSON).
- **Probable Skill overlap** beyond path/name dupes: Jaccard ≥ 0.5 on name+description content tokens (length ≥ 4, stopwords dropped) with ≥ 2 shared tokens, or 5+ character name containment. `overlaps[]` plus item `reasons` include `overlap`. False positives: shared jargon (review, github, 审查) across different owners. Paraphrases with no shared tokens are missed (not Phase 3 embeddings). Same-name copies stay in `duplicates`.
- Multiple `cap-mcp` entries for the same Agent are a `duplicates` group with `reason: cap-surface`.


### Pin / exclude (REC-06)

- **`cap pin` / `cap unpin` are first-class Direct Exposure controls.** Pin keeps or writes a JSON MCP Provider into Agent config so inspect/Health show `status: direct` with `pinned: true`. Unpin migrates that JSON entry into Registry `external_providers` and restores non-resident CAP-managed behavior. Implicit `add` / `use` still do not pin.
- **`cap exclude` / `cap include` hide a Provider from optimize recommendations without uninstalling it.** Inspect recommendations, `optimize --apply` (JSON and dotted-table Codex TOML), and Value Analysis `underused` / `advice` skip excluded Providers. The Provider stays in Local Inventory.
- **Web Health can pin / exclude.** `POST /api/pin`, `/api/unpin`, `/api/exclude`, `/api/include`. The default MCP tool surface stays `cap.search` / `cap.add` / `cap.use` — no `cap.pin` tool.
- Pin write-back is JSON MCP. Codex TOML pin/unpin is a preference that optimize apply honors (does not migrate pinned/excluded dotted tables).

### Observation Period

- **Phase 2 readiness is 14 UTC days and 3 distinct activity days** ([ADR 0003](./docs/adr/0003-observation-period-readiness.md), REC-03/04/05). 14 days is kept (7 is too short for weekly tools; 30 delays advice). Until both gates pass, Inspect/Web keep `frequencyVerdicts: false` and show `underused` as a value signal only.
- **Frequency/value advice after readiness.** `profiler.advice` explains cost, duplication, usage, and recency separately. Combined action is `prefer_on_demand` — never unused→remove. Value scores still come from `use` only. Registry persists `observation_started_at` so the 100-row Activity cap cannot drift the start.
- Human `cap inspect` and Web Health show observation progress; frequency labels appear only when ready.

### Optimize (OPT-07)

- **`cap optimize --apply --yes` re-inspects after a confirmed apply** and reports **actual vs projected** footprint savings. JSON `validation` is always `estimated: true` (characters/4, not a live tokenizer). Human output labels the same figures as estimates.
- **Apply fails closed** when a mutated file is unreadable after write (`config_invalid`) or a previously retained `cap-mcp` entry is gone (`cap_surface_broken`). Migrated MCP with no Registry launch is `invocation_regression`. Remaining Direct Exposure from pin/exclude is expected and not a failure. This is not auto Restore; recover from `.cap-backup`.

### Optimize (OPT-06)

- **`cap optimize --apply --yes` now migrates dotted-table Codex TOML** (`[mcp_servers.name]` and that server’s `[mcp_servers.name.env]`) with the same dual confirm, timestamped `.cap-backup`, and post-write validation as JSON MCP. Non-MCP tables (model, projects, …) and `cap-mcp` stay. Nested `.env` is not treated as its own server.
- **Unsupported layouts are refused**, not rewritten: JSON `mcp.servers`, Codex `mcp_servers = { … }`, `[mcp_servers]`, `[mcp.servers.*]`, and tables missing a quoted `command`. Preview/apply JSON lists `plan.adapters`, per-migration `apply` / `reason` / `guidance`, and `refused[]`.
- Recovery is the same sibling `.cap-backup` copy; still not one-click Restore. See [compatibility.md](./docs/compatibility.md) and [restore-from-backup.md](./docs/restore-from-backup.md).

### Registry Activity

- **`cap search` / MCP `cap.search` write a local search event.** Registry Activity now records the privacy-safe query (Capability Intent), hit count, hit ids, top id, timestamp, and `selected_id` when the result set has exactly one capability. Subsequent `add` / `use` of a recent hit also writes a `select` event. Add/use invocation and outcome records are unchanged.
- **Queries are sanitized before they hit disk.** Paths, emails, URLs, and secret-like tokens are redacted. Skill bodies, raw Agent config, and Provider env values are not stored.
- **`cap inject` ranking does not write search Activity.** That path reuses search scoring for a plan-only recommendation and is not a search→selection journey.
- **Value Analysis still scores from `use` only.** Search/select events do not create value or frequency labels. Inspect / Web Health keep `frequencyVerdicts: false` (Phase 1 defers frequency labels; [ADR 0002](./docs/adr/0002-observation-period-phase1.md)).
- `cap activity` prints search rows as `search  q=…  hits=N  <id>`.

### Docs

- README intro restored to the pre-#47 «Install more. Expose less.» marketing copy. PRD §1 and `CONTEXT.md` still lock the Capability Router north star.
- Product north star is the **Capability Router**: for a task, assemble the Capability Set. Context Health stays the explanation layer (“why unload these?”). Phase 1 P0 boundary is unchanged. See PRD §1 and the routing terms in `CONTEXT.md`.
- Phase 1 launch-gap close (#26, #27 docs, #28, #29, #31): `.cap-backup` recovery runbook; Agent first-report / partial-scan / optimize copy; OS×Agent inspect matrix; inspect labels mapped to CONTEXT.md; Observation Period deferred to Phase 2.
- Material-savings threshold frozen at **10% of effective budget** (`docs/adr/0001-material-savings-threshold.md`). Frequency labels deferred; no day-one unused→remove (`docs/adr/0002-observation-period-phase1.md`).
- PRD encodes the Grill-settled Phase 1 boundary: P0 and launch gates bind Phase 1 only; every journey and requirement ID has Phase plus Target / Now / Gap. Restore is the JSON optimize `.cap-backup` path; remote catalog, semantic retrieval, full one-click Restore, and anonymous product telemetry are not Phase 1 gates.
- Root `CONTEXT.md` is the domain glossary (Acquisition, Direct Exposure, CAP-managed, ManagedBinding, Invoked, scoped Restore Point, plan-only Dynamic Injection).
- README no longer calls full one-click Restore a P0 capability.

### Copy

- Human inspect / Web Health / setup Context Health skill use glossary role names (Direct Exposure, CAP-managed, CAP Surface). Value Analysis `underused` is a signal, not a remove recommendation. Inspect next-step mentions optional `cap web` at `http://127.0.0.1:4173` without starting the server.


### Version surface

- Package version is `0.5.0`. CLI help/banner and MCP `initialize` `serverInfo.version` still read `package.json`.

## 0.4.1

Ships **local Agent skill auto-register**, **implicit `cap.add` on first `cap.use`**, and a **reliable DingTalk / CJK search → inject → bind path**. Also installs persistent `cap` / `cap-mcp` launchers after `npx` setup and keeps the Agent-first README. Install with `npx -y @harvey2008/cap@0.4.1 setup` (or `@harvey2008/cap` for current). GitHub `npx -y github:Harveyallen/cap setup` remains a fallback. npm publish / git tag / GitHub Release stay with the coordinator after merge.

### Setup / CLI installation

- **`npx ... setup` now installs persistent `cap` and `cap-mcp` launchers.** Setup prefers a writable directory already present in `PATH`; when it must fall back to `~/.local/bin`, the CLI prints the exact `export PATH=...` command required by the current shell. Generated launchers are marked and updated safely; unrelated existing commands are never overwritten.
- **npx-based MCP setup no longer stores an ephemeral npm cache path.** The generated Agent configuration launches the pinned package through `npx`, so clearing the `_npx` cache does not leave Claude Code or Codex pointing at a missing `cap-mcp.js` file.
- **README now starts from the user's pain and stays Agent-first.** It explains capability-installation FOMO, resident context pressure, and intent-first Provider discovery, then gives copy-paste prompts for Agent-led setup/inspect and a complete architecture-diagram discovery → comparison → selection → use journey. Catalog misses are explicit, and implementation/history details move behind focused docs links.

### Local skills

- **`cap search` finds local Agent skills.** `SKILL.md` files under Claude Code / Codex / Cursor / shared `.agents/skills` (user and project) are overlaid on the seed catalog, including Cursor `skills-cursor` and `plugins/cache/…/skills`. Intents like `画架构图` / `架构图` hit a skill whose **description** mentions architecture diagrams — not a hardcoded name, and not nearby “architecture” skills such as pstack `architect` or `improve-codebase-architecture`. Results include summary + `skill_path` only — not the skill body.
- **`cap add` / `cap use` work without hand-written catalog JSON.** Add accepts the generated `skill.<slug>` id. Use returns path + summary; `include_body: true` loads SKILL.md on demand. Seed Skill stubs without a local file stay `connection_required`.
- **`cap setup` and `cap optimize --apply --yes` index discovered skills** into Registry `local_skills`. Optimize preview lists `plan.skills`. Skill files are not moved or rewritten. Default Agent surface stays search / add / use.
- See [docs/local-skills.md](./docs/local-skills.md).

### Agent path

- **`cap.use` implicitly adds.** Calling `use` on a catalog or local-skill capability that is not yet in the Registry registers it first (same ledger as `cap.add`: Installed→Enabled for inspect / inject / stats), then executes. Already-managed capabilities skip the add. Explicit `cap.add` stays available for intentional enablement. Search hits that are not installed include `use_registers: true`. Default Agent tools stay search / add / use.
- **`cap search` matches natural CJK send phrasing.** Catalog needles (keywords / intents) that appear inside the query are scored, so `帮我发钉钉消息` / `发钉钉消息` rank `dingtalk.im.message.send` the same way `发送钉钉消息` already did. Seed intents/keywords add those aliases. Latin matching is unchanged; short tokens like `im` / `pr` are not reverse-matched.
- **`cap inject` follows search.** DingTalk-send intents now get a non-empty `load` for that capability. Still plan-only (`mutates: false`); default MCP surface stays search/add/use.
- **Missing MCP launch is actionable.** `cap add` / `cap use` attach `next_steps`, `tried_aliases`, and `found_servers` (names only) when `binding.bound` is false / `reason: missing_launch`. Auto-bind accepts compact aliases (`dingtalk-mcp`, `dingding`, `钉钉`) and scans Cursor `~/.cursor/mcp.json` / project `.cursor/mcp.json` in addition to Claude / project `.mcp.json`. Remaining manual step: install a stdio DingTalk MCP and put credentials in that server’s `env` — see [docs/mcp-gateway.md](./docs/mcp-gateway.md).

### Version surface

- Package version is `0.4.1`. CLI help/banner and MCP `initialize` `serverInfo.version` still read `package.json`.

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

