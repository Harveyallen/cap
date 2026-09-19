# AGENTS.md

Instructions for AI coding agents working on CAP.

## Project

CAP is a local capability layer for AI agents: discover Capabilities by intent, consolidate Providers behind a small stable surface (`cap.search` / `cap.add` / `cap.use`). Motto: **Install more. Expose less.**

Stack: Node.js ≥20, ESM (`"type": "module"`), **zero npm runtime dependencies**. Tests use `node:test`.

## Quick map

| Path | Role |
|------|------|
| `bin/cap.js` | CLI entry |
| `bin/cap-mcp.js` | MCP stdio entry |
| `src/cli.js` | Command routing |
| `src/search.js` | Intent/keyword capability search (seed catalog + local skills); writes privacy-safe search Activity |
| `src/registry.js` | Catalog + `~/.cap/registry.json` state + local skill index + Activity (search/select/add/use) |
| `src/use.js` | Execute managed providers (git / ripgrep builtins, stdio MCP gateway, or local skill path); first use implicitly `add`s if unmanaged |
| `src/mcp-bind.js` | Resolve MCP stdio launch from catalog / local `mcpServers` / Registry |
| `src/mcp-client.js` | Line-delimited JSON-RPC client (`tools/call` for `cap.use`, `tools/list` for on-demand input schema) |
| `src/input-schema.js` | On-demand JSON Schema for `cap.use` input (live MCP `tools/list` or catalog) |
| `src/skills.js` | Discover local `SKILL.md` files and map them to catalog overlay entries |
| `src/inspector.js` | Scan local MCP + Skills; Context Health (budget / pressure / funnel); CAP surface |
| `src/profiler.js` | V3 Value Analysis (internally: profiler module; `use` activity → value / valuePerCost / underused; no day-one frequency verdicts) |
| `src/inject.js` | V4 Dynamic Injection: task → minimal load/defer plan (does not mutate configs) |
| `src/setup.js` | `cap setup`: install persistent CLI launchers, write CAP MCP + Context Health Skill, then inspect |
| `src/optimize.js` | Preview / apply MCP consolidation (keeps `cap-mcp`) and index local skills |
| `src/mcp-server.js` | MCP JSON-RPC tools |
| `src/mcp-tools.js` | CAP entry tool defs + `cap-mcp` detection |
| `src/web-server.js` | Local Discover UI + JSON APIs |
| `src/paths.js` | `CAP_HOME` / package root |
| `src/catalog-schema.js` | Zero-dep catalog JSON Schema checks |
| `src/index.js` | Public programmatic API (read / main path) |
| `data/catalog.json` | Seed capabilities + providers |
| `data/catalog.schema.json` | Catalog JSON Schema |
| `test/*.test.js` | Node test suite |
| `.agents/skills/` | Shared agent skills: CAP (`add-capability`, `cap-develop`) plus the full `mattpocock/skills` pack (also scanned by `cap inspect`) |

Human overview: `README.md`. Architecture detail: `docs/architecture.md`. Local skills: `docs/local-skills.md`. Context Health: `docs/context-health.md` (V3 Value Analysis runtime in `src/profiler.js`, 0.3.0; V4 Dynamic Injection plan in `src/inject.js`, 0.4.0; 0.2.0 was docs-only for V3). MCP gateway + on-demand `input_schema`: `docs/mcp-gateway.md` (0.4.0). LLM index: `llms.txt`.

## Commands

```bash
npm test
npm run check
node ./bin/cap.js setup --agent auto
node ./bin/cap.js inspect
node ./bin/cap.js search "分析 PostgreSQL 慢查询" --json
node ./bin/cap.js inject "分析 PostgreSQL 慢查询" --json
node ./bin/cap.js add git.repository.status
node ./bin/cap.js use git.repository.status --input '{"path":"."}' --json
node ./bin/cap.js optimize
node ./bin/cap-mcp.js   # stdio MCP; optional CAP_MCP_INSPECT=1 / CAP_MCP_INJECT=1
```

Prefer `--json` when parsing CLI output. Prefer `CAP_HOME=<tmpdir>` in tests so state never touches the real `~/.cap`.

Project `.mcp.json` uses a relative `./bin/cap-mcp.js` path. Start the MCP server from the package root so that path resolves.

## Public API

`src/index.js` (package root export) is the read / main path only:

- `searchCapabilities`
- `addCapability`
- `useCapability`
- `inspectLocal`
- `loadCatalog`
- `loadState`

Registry writes, optimize apply, MCP/web server starters, Value Analysis (`profiler.js`), and Dynamic Injection (`planInjection` in `inject.js`) stay in their modules. Do not re-export them from the package root.

## Always do

- Keep ESM, no new runtime dependencies unless the task explicitly requires one.
- Preserve bidirectional catalog links: Capability `provider_refs` ↔ Provider `capabilities`.
- Keep `capability_id` stable once published.
- Match existing style: compact modules, early returns, no TypeScript.
- Add or update tests under `test/` for behavior changes.
- Run `npm run check` before finishing.

## Ask first

- Adding npm dependencies
- Changing MCP tool names or the default 3-tool surface
- Auto-editing Agent configs without dual confirmation (`--apply` and `--yes`)
- Expanding `optimize` to mutate TOML (currently inspect-only)

## Never do

- Connect to or execute scanned third-party MCP servers during `inspect`
- Fake successful `use` for providers that still need connection (`connection_required`)
- Commit `.cap/`, `node_modules/`, or real user Agent configs
- Expose full downstream tool schemas through `cap-mcp` by default (search/add may return the **one** mapped tool’s `input_schema`; `tools/list` stays search/add/use)

## Catalog edits

When adding a Capability:

1. Add the object to `data/catalog.json` `capabilities[]` with intents/keywords (zh + en when useful).
2. Point `provider_refs` at existing or new providers.
3. Update matching Provider `capabilities[]`.
4. For MCP: set Capability `mcp_tool` and Provider `mcp_server` (optional `command`/`args`). See `docs/mcp-gateway.md`.
5. Validate shape against `data/catalog.schema.json`.
6. Add a search and/or use test if behavior changes.

Builtin executors live in `src/use.js` and only apply to providers with `executable`. MCP gateway execution also lives in `src/use.js` (stdio client in `src/mcp-client.js`). Spawn with `shell: false`. Do not mark MCP `use` as completed without a real tool result.

## Security

- Registry files: directory `0700`, file `0600`.
- `optimize --apply --yes` must backup JSON configs to `*.cap-backup` before clearing `mcpServers` / `mcp_servers`.
- Spawn builtins and downstream MCP with `shell: false`.
- Do not log secrets from capability inputs or MCP `env`.

## PR expectations

- Descriptive commit messages; keep diffs focused.
- Update `CHANGELOG.md` for user-visible behavior.
- Keep agent docs (`AGENTS.md`, skills) in sync when workflow or module map changes.
