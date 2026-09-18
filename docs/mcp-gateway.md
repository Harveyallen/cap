# MCP gateway (`cap.use`)

CAP keeps the Agent-facing MCP surface at **three tools**: `cap.search`, `cap.add`, `cap.use`. Third-party methods (GitHub, DingTalk, Postgres, …) stay behind `cap.use`. Inspect still does **not** connect to those servers.

## Binding model (v1)

Three pieces have to line up. Missing any one is `connection_required` (or a precise `failed`) — never a fake success.

| Piece | Where | Example |
| --- | --- | --- |
| Capability → tool | Catalog `mcp_tool` | `dingtalk.im.message.send` → `send_message` |
| Provider → local server name | Catalog `mcp_server` | `dingtalk.mcp` → `dingtalk` |
| How to spawn stdio JSON-RPC | Binding in `$CAP_HOME/registry.json` `mcp_bindings` | `{command, args, env}` |

`cap add` resolves the launch config (does not spawn) and stores it under `mcp_bindings[provider_id]`. `cap.use` spawns that command with `shell: false`, speaks line-delimited JSON-RPC (same framing as `cap-mcp`), calls **one** mapped tool with `input`, then stops the process.

## On-demand `input_schema`

Models cannot reliably fill `cap.use` from Catalog `inputs: {field: "string"}` alone. Search and add attach a real JSON Schema **on the result**, not as extra Agent tools:

| Field | Meaning |
| --- | --- |
| `input_schema` | JSON Schema object for that capability’s `cap.use` `input` |
| `schema_source` | `"mcp"` if the schema came from downstream `tools/list` for the mapped `mcp_tool`; `"catalog"` otherwise |

Live fetch: when a stdio launch is already bound or resolvable (Registry `mcp_bindings`, `--server` / local `mcpServers`, explicit launch, catalog `command`), CAP briefly spawns that server, calls `tools/list`, picks the mapped tool’s `inputSchema`, then exits. Same client as the gateway. If the child cannot be reached or the mapped tool is missing, results fall back to a Catalog-derived schema (`string` / `number` / `object` / `array` / `boolean` / `integer`, plus `path` → string path and `secret` → unlogged string). Field names `path` / `file` also get a filesystem-path description when the catalog type is only `string`. `path` is omitted from `required` because builtins default it to cwd.

Builtins (git / ripgrep) always use `schema_source: "catalog"`. `cap inject` ranking sets `liveSchema: false` so the plan does not connect to third-party MCP.

This does **not** expand `tools/list`. DingTalk’s 15 tools stay behind `cap.use`.

### Launch resolution order

1. Explicit `options.launch` (tests / programmatic).
2. `--server` / MCP `cap.add` argument `server` matching a local `mcpServers` name.
3. Catalog `mcp_server`, then `provider_id` / first id segment / provider name (e.g. `github.mcp` → `github`).
4. Registry `external_providers` left by `cap optimize --apply --yes`.
5. Live JSON configs (same roots as inspect: `~/.claude.json`, `~/.claude/settings.json`, project `.mcp.json`) and a best-effort Codex TOML `command`/`args`.
6. Catalog `command` + `args` when the seed itself knows a stdio launcher.

`cap-mcp` is never used as a downstream provider. HTTP/`url`-only servers return `connection_required` with `reason: unsupported_transport` (stdio only in v1). Env values from MCP configs are copied into the 0600 registry file so the child can start; add/use **results** expose `envKeys` only — values are not logged.

Optional catalog `command`/`args` are for public stdio packages without secrets. Prefer matching a local `mcpServers` entry so tokens stay in the user’s config (or in Registry after optimize).

## DingTalk

Real DingTalk OAuth is out of scope. Plug-in path:

1. Install a stdio DingTalk MCP locally. Put it in Claude/Codex/project MCP config under the key **`dingtalk`** (or pass `--server <that-key>`). Credentials stay in that server’s `env`.
2. Confirm the downstream tool name. Seed mapping is `dingtalk.im.message.send` → `send_message`. If your server uses another method, change catalog `mcp_tool` (or add a Capability that matches).
3. `cap add dingtalk.im.message.send` (optionally after `cap optimize --apply --yes` so the Agent no longer lists DingTalk tools).
4. Agent calls `cap.use` with `capability_id` + `input`. Cap starts the DingTalk MCP behind the scenes and returns the tool result.

```bash
# Isolated registry; point CAP at a local mock or real stdio server via mcpServers.
CAP_HOME=/tmp/cap-dt node ./bin/cap.js add dingtalk.im.message.send --json
CAP_HOME=/tmp/cap-dt node ./bin/cap.js use dingtalk.im.message.send \
  --input '{"id":"user-1","msgKey":"sampleText","msgParam":{"content":"hello"}}' --json
```

Without a matching launch: `status: "connection_required"`, `reason: "missing_launch"`. Tests use `test/fixtures/mock-mcp-server.js` (no DingTalk credentials).

## Limits

- Per-`use` spawn (no long-lived pool).
- Line-delimited JSON-RPC only (MCP spec stdio / same as `cap-mcp`).
- Does not expand the default 3-tool surface; does not re-inject downstream tools. The **one** mapped tool’s `inputSchema` is returned on search/add results (`input_schema`), not on Agent `tools/list`.
- Does not implement OAuth; if the child MCP cannot authenticate, `cap.use` returns `failed` with that error.
