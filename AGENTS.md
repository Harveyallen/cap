# AGENTS.md

Instructions for AI coding agents working on CAP.

## Project

CAP is a local capability layer for AI agents: discover Capabilities by intent, consolidate Providers behind a small stable surface (`cap.search` / `cap.acquire` / `cap.use`). Motto: **Install more. Expose less.**

Stack: Node.js ≥20, ESM (`"type": "module"`), **zero npm runtime dependencies**. Tests use `node:test`.

## Quick map

| Path | Role |
|------|------|
| `bin/cap.js` | CLI entry |
| `bin/cap-mcp.js` | MCP stdio entry |
| `src/cli.js` | Command routing |
| `src/search.js` | Intent/keyword capability search |
| `src/registry.js` | Catalog + `~/.cap/registry.json` state |
| `src/use.js` | Execute managed providers (git / ripgrep builtins) |
| `src/inspector.js` | Scan Claude Code / Codex MCP + Skills |
| `src/optimize.js` | Preview / apply MCP consolidation |
| `src/mcp-server.js` | MCP JSON-RPC tools |
| `src/web-server.js` | Local Discover UI + JSON APIs |
| `src/paths.js` | `CAP_HOME` / package root |
| `src/catalog-schema.js` | Zero-dep catalog JSON Schema checks |
| `src/index.js` | Public programmatic API (read / main path) |
| `data/catalog.json` | Seed capabilities + providers |
| `data/catalog.schema.json` | Catalog JSON Schema |
| `test/*.test.js` | Node test suite |
| `.agents/skills/` | Shared agent skills (also scanned by `cap inspect`) |

Human overview: `README.md`. Architecture detail: `docs/architecture.md`. LLM index: `llms.txt`.

## Commands

```bash
npm test
npm run check
node ./bin/cap.js inspect
node ./bin/cap.js search "分析 PostgreSQL 慢查询" --json
node ./bin/cap.js acquire git.repository.status
node ./bin/cap.js use git.repository.status --input '{"path":"."}' --json
node ./bin/cap.js optimize
node ./bin/cap-mcp.js   # stdio MCP; optional CAP_MCP_INSPECT=1
```

Prefer `--json` when parsing CLI output. Prefer `CAP_HOME=<tmpdir>` in tests so state never touches the real `~/.cap`.

Project `.mcp.json` uses a relative `./bin/cap-mcp.js` path. Start the MCP server from the package root so that path resolves.

## Public API

`src/index.js` (package root export) is the read / main path only:

- `searchCapabilities`
- `acquireCapability`
- `useCapability`
- `inspectLocal`
- `loadCatalog`
- `loadState`

Registry writes, optimize apply, and MCP/web server starters stay in their modules. Do not re-export them from the package root.

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
- Expose full downstream tool schemas through `cap-mcp` by default

## Catalog edits

When adding a Capability:

1. Add the object to `data/catalog.json` `capabilities[]` with intents/keywords (zh + en when useful).
2. Point `provider_refs` at existing or new providers.
3. Update matching Provider `capabilities[]`.
4. Validate shape against `data/catalog.schema.json`.
5. Add a search and/or use test if behavior changes.

Builtin executors live in `src/use.js` and only apply to providers with `executable`.

## Security

- Registry files: directory `0700`, file `0600`.
- `optimize --apply --yes` must backup JSON configs to `*.cap-backup` before clearing `mcpServers` / `mcp_servers`.
- Spawn builtins with `shell: false`.
- Do not log secrets from capability inputs.

## PR expectations

- Descriptive commit messages; keep diffs focused.
- Update `CHANGELOG.md` for user-visible behavior.
- Keep agent docs (`AGENTS.md`, skills) in sync when workflow or module map changes.
