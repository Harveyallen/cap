---
name: cap-develop
description: Develop or debug the CAP repository itself (CLI, MCP, registry, search, optimize).
---

# Develop CAP

## Before coding

1. Read root `AGENTS.md` and `docs/architecture.md`.
2. Identify the owning module from the map; keep domain logic out of `cli.js` / `web-server.js`. Context Health math lives in `inspector.js`; CLI/Web only format it.
3. Prefer extending existing functions over new files unless a clear boundary appears.
4. Inspect output is additive: keep existing `summary` fields and add `budget` / `pressure` / `funnel`. Do not connect to third-party MCP servers. Recognize `cap-mcp` as the CAP surface (known schemas, never Move → CAP / wipe `.mcp.json`). Product rules: `docs/context-health.md`. V3 Value Analysis runtime lives in `src/profiler.js` (JSON key `profiler`); do not reimplement usage/value scoring. V4 Dynamic Injection lives in `src/inject.js` (`planInjection`; plan only). Tool defs live in `src/mcp-tools.js`.

## Verify loop

```bash
npm run check
node ./bin/cap.js search "<intent>" --json
```

Use a temp registry:

```bash
CAP_HOME=/tmp/cap-dev-$$ node ./bin/cap.js add git.repository.status --json
```

## MCP surface

Default tools: `cap.search`, `cap.add`, `cap.use`. Only expose `cap.inspect` behind `CAP_MCP_INSPECT=1` and `cap.inject` behind `CAP_MCP_INJECT=1`.

## Done when

- Tests cover the changed behavior
- No new runtime dependency without explicit approval
- Changelog updated for user-visible changes
