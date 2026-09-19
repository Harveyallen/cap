# CAP architecture

## Goal

Agents should see a **small, stable Capability surface**, while humans can install many Providers. CAP sits between Agent frontends (CLI / Web / MCP) and local or registered Providers.

```text
CLI / Web / MCP
       │
       ▼
CAP Core ── Search ── Catalog (data/catalog.json + local SKILL.md overlay)
   │  │
   │  └──── Registry / Activity (~/.cap/registry.json or $CAP_HOME)
   │
   ├────── Inspector / skills ── Claude / Codex / Cursor / Shared SKILL.md
   └────── Use ─────── Managed providers (builtin CLI, stdio MCP, or local skill path)
```

## Core objects

- **Capability**: stable intent-oriented id (`git.repository.status`), not an MCP server.
- **Provider**: implementation (CLI / MCP / Skill) that declares which capabilities it covers.
- **Managed**: Capability/Provider recorded in the CAP Registry after `add`, or after the first `use` of an unmanaged catalog / local-skill capability (implicit add).
- **Activity**: local search / select / add / use outcomes (query, hit ids, invocation result, time) for later observation. No remote telemetry.

## Module responsibilities

| Module | Owns | Must not |
|--------|------|----------|
| `search.js` | Hybrid keyword/intent scoring over seed + local skills; appends privacy-safe search Activity via registry | Persist ranking or catalog; mutate Agent configs |
| `registry.js` | Catalog load + registry R/W + add + skill index + Activity | Execute providers |
| `skills.js` | Walk Agent skill dirs, parse SKILL.md, map to catalog overlay | Mutate Agent configs |
| `use.js` | Execute managed builtins or gateway one MCP tool | Discover/search, dump downstream schemas |
| `mcp-bind.js` | Resolve stdio launch from catalog / local mcpServers / Registry | Spawn or connect |
| `mcp-client.js` | Line-delimited JSON-RPC stdio client (initialize + one `tools/call` or `tools/list`) | Expand Agent tool surface |
| `input-schema.js` | JSON Schema for `cap.use` input: live mapped tool `inputSchema`, else catalog | Put downstream tools on `tools/list` |
| `inspector.js` | Read local Agent configs/skills, estimate footprint, derive Context Health | Connect to MCP servers |
| `profiler.js` | Score capability value / valuePerCost from Registry activity | Execute providers |
| `inject.js` | Task → minimal load/defer injection plan (reuses search ranking) | Mutate Agent configs, connect to MCP, embeddings |
| `mcp-tools.js` | CAP entry tool defs + `cap-mcp` detection | Talk to the network |
| `setup.js` | Install persistent CLI launchers; write CAP MCP + Context Health Skill into Claude / Codex | Overwrite unrelated commands, wipe existing servers, or mutate unsafe TOML |
| `optimize.js` | Plan + guarded JSON MCP migration (keeps `cap-mcp`) + skill index | Mutate TOML |
| `mcp-server.js` | JSON-RPC stdio tool surface | Re-inject downstream tools into `tools/list` |
| `web-server.js` | Discover UI + thin JSON APIs | Own business logic |
| `cli.js` | Arg parsing + human/JSON formatting | Domain logic |

## Data contracts

- Seed catalog: `data/catalog.json` validated by `data/catalog.schema.json` (required fields, enums, id patterns, minItems, no extra properties) on `loadCatalog` and in tests. `loadEffectiveCatalog` overlays local `SKILL.md` files (summaries + path only). See [local-skills.md](./local-skills.md).
- Registry default path: `$CAP_HOME/registry.json` or `~/.cap/registry.json`. Activity rows are local only (`search` / `select` / `add` / `use`); search stores a sanitized query plus hit ids, never skill bodies or raw config.
- Context footprint: character/4 estimate, not a vendor tokenizer.
- Inspect report (additive): `budget`, `pressure`, `funnel`, per-item `cost` / `status`. Skill `contextTokens` are name+description only. `funnel.installed` is Local Inventory (scanned names), not catalog size. `funnel.configured` aliases `injected` (Direct Exposure count; config scan, not live session). `funnel.used` is Invoked. Item `status`: `direct`/`estimated` = Direct Exposure, `managed` = CAP-managed, `cap` = CAP Surface. `cap-mcp` is priced from known entry schemas, excluded from Move → CAP. `effectiveBudget <= 0` → pressure `unknown`. `cost.value` / `valuePerCost` are filled by V3 Value Analysis (`src/profiler.js`, 0.3.0 runtime) from Registry `use` activity; remain `null` when there is no signal. Search/select Activity is stored but does not create value scores or frequency verdicts (`frequencyVerdicts: false`). Phase 1 does not classify low-frequency. Product rules: [context-health.md](./context-health.md). Agent copy: [agent-onboarding.md](./agent-onboarding.md). Scan matrix: [compatibility.md](./compatibility.md). JSON `.cap-backup` recovery: [restore-from-backup.md](./restore-from-backup.md).
- Injection plan (V4, 0.4.0): `planInjection(task)` returns `load` / `defer` / `keepResident` / `comparison`. Ranking reuses `searchCapabilities` with a relative score floor so weak substring hits are not loaded. `mutates: false` — plan only. `savedVsCatalog` uses seed `context_cost`. `savedVsResident` uses inspect estimates (after = CAP surface only; task caps go through `cap.use`). Default MCP surface stays 3 tools; `cap.inject` is opt-in (`CAP_MCP_INJECT=1`).
- MCP gateway (0.4.0): Capability `mcp_tool` + Provider `mcp_server` (optional catalog `command`/`args`). `cap add` stores a stdio launch in Registry `mcp_bindings`; `cap.use` on an unmanaged capability calls `addCapability` first (same ledger), then spawns that MCP and calls the mapped tool. `cap.search` / `cap.add` attach `input_schema` + `schema_source` (`mcp` from a brief `tools/list` when a launch exists, else `catalog`). Unmanaged search hits may set `use_registers: true`. Inspect still does not connect. Binding details: [mcp-gateway.md](./mcp-gateway.md). Search scores CJK catalog needles inside the query so phrasing like `帮我发钉钉消息` ranks the mapped capability. Local `SKILL.md` files are overlaid the same way (see [local-skills.md](./local-skills.md)). Missing launch returns structured `next_steps` (plan only; default Agent surface stays search/add/use).
- Budget env: `CAP_NOMINAL_WINDOW`, `CAP_HARNESS_SOFT_LIMIT`, `CAP_RESERVE_TOKENS`, `CAP_EFFECTIVE_BUDGET`.

## Agent integration

`cap setup` installs marked `cap` / `cap-mcp` launchers in a writable bin directory already on `PATH` when possible, then writes user-level Claude Code / Codex MCP so Agents see `cap.search` / `cap.add` / `cap.use` (and `cap.inspect` when `CAP_MCP_INSPECT=1`, `cap.inject` when `CAP_MCP_INJECT=1`). If no writable PATH directory exists, launchers go to `~/.local/bin` and setup returns the required PATH command. npx installs use pinned npx launchers instead of cache paths; unrelated existing executables are not overwritten. Setup and `optimize --apply` also index local `SKILL.md` files into Registry `local_skills`; search overlays them live. Project `.mcp.json` is local dogfood, not a migrate/wipe target. Coding agents should load `AGENTS.md` and skills under `.agents/skills/` (CAP plus the full `mattpocock/skills` pack). Per-repo `/setup-matt-pocock-skills` is a human step after install; it is not applied by `cap setup`. The Matt pack is repo dogfood for developing CAP, not an end-user V4 prune target.
