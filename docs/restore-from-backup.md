# Recover MCP config from `.cap-backup`

Restore for supported optimize paths is a **file copy**, not a Restore CLI or UI. Launch copy may say the change is backed up and recoverable from that backup. It must **never** say one-click Restore.

`cap optimize --apply --yes` copies each mutated file to a timestamped sibling **before** it rewrites:

- JSON MCP: `mcpServers` / `mcp_servers` (Claude Code, Cursor, project `.mcp.json`)
- Codex TOML: dotted-table `[mcp_servers.name]` (and that server’s `[mcp_servers.name.env]`)

`cap pin` / `cap unpin` use the same sibling pattern when they write or remove a JSON MCP Direct Exposure entry.

Unsupported layouts (JSON `mcp.servers`, Codex inline-table / `[mcp_servers]` / `[mcp.servers.*]`) are refused and are not part of this path. Matrix: [compatibility.md](./compatibility.md).

## Backup path pattern

```text
<source>.<stamp>.cap-backup
```

| Piece | Value |
|---|---|
| `<source>` | Absolute path of the file that was mutated (same string inspect/optimize used). |
| `<stamp>` | `new Date().toISOString()` with `:` and `.` replaced by `-`. Example: `2026-09-19T08-54-12-345Z`. |
| suffix | `.cap-backup` |

Examples:

```text
~/.claude.json.2026-09-19T08-54-12-345Z.cap-backup
~/.cursor/mcp.json.2026-09-19T08-54-12-345Z.cap-backup
<project>/.mcp.json.2026-09-19T08-54-12-345Z.cap-backup
<project>/.cursor/mcp.json.2026-09-19T08-54-12-345Z.cap-backup
~/.codex/config.toml.2026-09-19T08-54-12-345Z.cap-backup
```

On Windows the same pattern uses `os.homedir()` plus `path.join`, for example `%USERPROFILE%\.claude.json.<stamp>.cap-backup`.

`cap setup` uses the same sibling pattern when it rewrites an existing JSON or Codex MCP file. This runbook is the **optimize** recovery path (RST-01 / RST-02 / RST-09). Full conflict-aware Restore remains later (Phase 3).

Apply JSON output lists each backup:

```bash
cap optimize --apply --yes --json
```

Look at `changed[].source`, `changed[].backup`, and `changed[].adapter` (`json-mcp` or `codex-toml`). Preview-only `cap optimize` does not write a backup. `refused[]` lists sources that were left unchanged.

Apply also re-inspects and returns `validation` (projected vs actual **estimated** savings). `validation.ok: false` is a failure (`config_invalid`, `cap_surface_broken`, or `invocation_regression`), not automatic Restore. If validation fails, copy the matching `.cap-backup` back as below, then `cap inspect`.

## Recover the file

There is **no** conflict detector. If you edited the live file after optimize, copying the backup back overwrites those later edits.

1. Confirm the live file you want to restore. Typical sources: `~/.claude.json`, `~/.cursor/mcp.json`, project `.mcp.json`, project `.cursor/mcp.json`, `~/.codex/config.toml`.
2. Find the matching backup in the **same directory**. Prefer the stamp from the apply JSON; otherwise take the newest `*.cap-backup` for that source.
3. If you might want the post-optimize file later, copy it aside first (`cp source source.post-optimize`).
4. Copy the backup over the live file:

```bash
cp -- ~/.claude.json.2026-09-19T08-54-12-345Z.cap-backup ~/.claude.json
cp -- ~/.codex/config.toml.2026-09-19T08-54-12-345Z.cap-backup ~/.codex/config.toml
```

Windows (cmd): `copy /Y "%USERPROFILE%\.claude.json.<stamp>.cap-backup" "%USERPROFILE%\.claude.json"`

5. Restart the Agent so it reloads MCP config.
6. Re-inspect (see below).

## Optional: Registry `external_providers`

Optimize also records migrated servers in `$CAP_HOME/registry.json` or `~/.cap/registry.json` under `external_providers`. Restoring the Agent file puts those MCP entries back into the Agent config. Inspect still treats a name listed in `external_providers` as **CAP-managed**, even when the file again contains it.

To make inspect `status` return to **Direct Exposure** (`direct`) as it was before optimize:

1. Open the Registry JSON (mode `0600`).
2. Remove `external_providers` objects whose `originalSource` is the restored file (match `name` if several files were migrated).
3. Save. Do not delete `managed_capabilities` or `mcp_bindings` unless you also intend to drop CAP-managed use of those Providers.

Skipping this step is still a successful file recovery: the Agent sees the prior MCP entries after reload. Only the inspect role label may stay `CAP-managed`.

## Verify with inspect

```bash
cap inspect --json
```

Acceptance for this runbook:

- The restored JSON again lists the prior `mcpServers` / `mcp_servers` keys, or the restored Codex TOML again lists the prior `[mcp_servers.name]` tables.
- Inspect `items` include those MCP names.
- After Registry cleanup, those items have `status: "direct"` (Direct Exposure), not `cap`.
- Human `cap inspect` shows them as Direct Exposure.

`cap-mcp` (CAP Surface) should remain if it was kept during optimize.

This is not automated Restore-point verification (RST-06 later). Re-inspect is the check.
