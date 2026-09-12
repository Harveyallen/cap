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
   └────── Use ─────── Managed providers (builtin CLI or connection_required)
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
| `use.js` | Execute managed builtins | Discover/search |
| `inspector.js` | Read local Agent configs/skills, estimate footprint, derive Context Health | Connect to MCP servers |
| `mcp-tools.js` | CAP entry tool defs + `cap-mcp` detection | Talk to the network |
| `optimize.js` | Plan + guarded JSON MCP migration (keeps `cap-mcp`) | Mutate TOML in v0.1 |
| `mcp-server.js` | JSON-RPC stdio tool surface | Dump downstream schemas |
| `web-server.js` | Discover UI + thin JSON APIs | Own business logic |
| `cli.js` | Arg parsing + human/JSON formatting | Domain logic |

## Data contracts

- Seed catalog: `data/catalog.json` validated by `data/catalog.schema.json` (required fields, enums, id patterns, minItems, no extra properties) on `loadCatalog` and in tests.
- Registry default path: `$CAP_HOME/registry.json` or `~/.cap/registry.json`.
- Context footprint: character/4 estimate, not a vendor tokenizer.
- Inspect report (additive): `budget`, `pressure`, `funnel`, per-item `cost` / `status`. Skill `contextTokens` are name+description only. `funnel.installed` is local scan names, not catalog size. `funnel.configured` aliases `injected` (config scan, not live session). `cap-mcp` is the CAP surface (`status: cap`), priced from known entry schemas, excluded from Move → CAP. `effectiveBudget <= 0` → pressure `unknown`. Product rules: [context-health.md](./context-health.md).
- Budget env: `CAP_NOMINAL_WINDOW`, `CAP_HARNESS_SOFT_LIMIT`, `CAP_RESERVE_TOKENS`, `CAP_EFFECTIVE_BUDGET`.

## Agent integration

Project `.mcp.json` exposes CAP as an MCP server for local dogfooding. Coding agents should load `AGENTS.md` and optional skills under `.agents/skills/`.
