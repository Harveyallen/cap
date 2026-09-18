# CAP architecture

## Goal

Agents should see a **small, stable Capability surface**, while humans can install many Providers. CAP sits between Agent frontends (CLI / Web / MCP) and local or registered Providers.

```text
CLI / Web / MCP
       │
       ▼
CAP Core ── Search ── Catalog (data/catalog.json)
   │  │
   │  └──── Registry / Activity (~/.cap/registry.json or $CAP_HOME)
   │
   ├────── Inspector ── Claude Code / Codex configs + Skills
   └────── Use ─────── Managed providers (builtin CLI or stdio MCP gateway)
```

## Core objects

- **Capability**: stable intent-oriented id (`git.repository.status`), not an MCP server.
- **Provider**: implementation (CLI / MCP / Skill) that declares which capabilities it covers.
- **Managed**: Capability/Provider recorded in the CAP Registry after `add`.
- **Activity**: recent add/use outcomes for later CapabilityBench work.

## Module responsibilities

| Module | Owns | Must not |
|--------|------|----------|
| `search.js` | Hybrid keyword/intent scoring | Persist state |
| `registry.js` | Catalog load + registry R/W + add | Execute providers |
| `use.js` | Execute managed builtins or gateway one MCP tool | Discover/search, dump downstream schemas |
| `mcp-bind.js` | Resolve stdio launch from catalog / local mcpServers / Registry | Spawn or connect |
| `mcp-client.js` | Line-delimited JSON-RPC stdio client (initialize + one `tools/call` or `tools/list`) | Expand Agent tool surface |
| `input-schema.js` | JSON Schema for `cap.use` input: live mapped tool `inputSchema`, else catalog | Put downstream tools on `tools/list` |
| `inspector.js` | Read local Agent configs/skills, estimate footprint, derive Context Health | Connect to MCP servers |
| `profiler.js` | Score capability value / valuePerCost from Registry activity | Execute providers |
| `inject.js` | Task → minimal load/defer injection plan (reuses search ranking) | Mutate Agent configs, connect to MCP, embeddings |
| `mcp-tools.js` | CAP entry tool defs + `cap-mcp` detection | Talk to the network |
| `setup.js` | Write CAP MCP + Context Health Skill into Claude / Codex | Wipe existing servers or mutate unsafe TOML |
| `optimize.js` | Plan + guarded JSON MCP migration (keeps `cap-mcp`) | Mutate TOML |
| `mcp-server.js` | JSON-RPC stdio tool surface | Re-inject downstream tools into `tools/list` |
| `web-server.js` | Discover UI + thin JSON APIs | Own business logic |
| `cli.js` | Arg parsing + human/JSON formatting | Domain logic |

## Data contracts

- Seed catalog: `data/catalog.json` validated by `data/catalog.schema.json` (required fields, enums, id patterns, minItems, no extra properties) on `loadCatalog` and in tests.
- Registry default path: `$CAP_HOME/registry.json` or `~/.cap/registry.json`.
- Context footprint: character/4 estimate, not a vendor tokenizer.
- Inspect report (additive): `budget`, `pressure`, `funnel`, per-item `cost` / `status`. Skill `contextTokens` are name+description only. `funnel.installed` is local scan names, not catalog size. `funnel.configured` aliases `injected` (config scan, not live session). `cap-mcp` is the CAP surface (`status: cap`), priced from known entry schemas, excluded from Move → CAP. `effectiveBudget <= 0` → pressure `unknown`. `cost.value` / `valuePerCost` are filled by V3 Value Analysis (`src/profiler.js`, 0.3.0 runtime) from Registry activity; remain `null` when there is no signal. 0.2.0 documented V3 only. Product rules: [context-health.md](./context-health.md).
- Injection plan (V4, Unreleased): `planInjection(task)` returns `load` / `defer` / `keepResident` / `comparison`. Ranking reuses `searchCapabilities` with a relative score floor so weak substring hits are not loaded. `mutates: false` — plan only. `savedVsCatalog` uses seed `context_cost`. `savedVsResident` uses inspect estimates (after = CAP surface only; task caps go through `cap.use`). Default MCP surface stays 3 tools; `cap.inject` is opt-in (`CAP_MCP_INJECT=1`).
- MCP gateway (Unreleased): Capability `mcp_tool` + Provider `mcp_server` (optional catalog `command`/`args`). `cap add` stores a stdio launch in Registry `mcp_bindings`; `cap.use` spawns that MCP and calls the mapped tool. `cap.search` / `cap.add` attach `input_schema` + `schema_source` (`mcp` from a brief `tools/list` when a launch exists, else `catalog`). Inspect still does not connect. Binding details: [mcp-gateway.md](./mcp-gateway.md).
- Budget env: `CAP_NOMINAL_WINDOW`, `CAP_HARNESS_SOFT_LIMIT`, `CAP_RESERVE_TOKENS`, `CAP_EFFECTIVE_BUDGET`.

## Agent integration

`cap setup` writes user-level Claude Code / Codex MCP so Agents see `cap.search` / `cap.add` / `cap.use` (and `cap.inspect` when `CAP_MCP_INSPECT=1`, `cap.inject` when `CAP_MCP_INJECT=1`). Project `.mcp.json` is local dogfood, not a migrate/wipe target. Coding agents should load `AGENTS.md` and skills under `.agents/skills/` (CAP plus the full `mattpocock/skills` pack). Per-repo `/setup-matt-pocock-skills` is a human step after install; it is not applied by `cap setup`. The Matt pack is repo dogfood for developing CAP, not an end-user V4 prune target.
