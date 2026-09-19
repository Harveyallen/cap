# Recover JSON MCP config from `.cap-backup`

Phase 1 Restore for the JSON MCP optimize path is a **file copy**, not a Restore CLI or UI. Launch copy may say the change is backed up and recoverable from that backup. It must **never** say one-click Restore.

`cap optimize --apply --yes` copies each mutated JSON file to a timestamped sibling **before** it rewrites `mcpServers` / `mcp_servers`. Codex TOML is inspect-only and is not part of this path.

## Backup path pattern

```text
<source>.<stamp>.cap-backup
```

| Piece | Value |
|---|---|
| `<source>` | Absolute path of the JSON file that was mutated (same string inspect/optimize used). |
| `<stamp>` | `new Date().toISOString()` with `:` and `.` replaced by `-`. Example: `2026-09-19T08-54-12-345Z`. |
| suffix | `.cap-backup` |

Examples:

```text
~/.claude.json.2026-09-19T08-54-12-345Z.cap-backup
~/.cursor/mcp.json.2026-09-19T08-54-12-345Z.cap-backup
<project>/.mcp.json.2026-09-19T08-54-12-345Z.cap-backup
<project>/.cursor/mcp.json.2026-09-19T08-54-12-345Z.cap-backup
```

On Windows the same pattern uses `os.homedir()` plus `path.join`, for example `%USERPROFILE%\.claude.json.<stamp>.cap-backup`.

`cap setup` uses the same sibling pattern when it rewrites an existing JSON MCP file. This runbook is the JSON **optimize** recovery path (RST-01 / RST-02 / RST-09).

Apply JSON output lists each backup:

```bash
cap optimize --apply --yes --json
```

Look at `changed[].source` and `changed[].backup`. Preview-only `cap optimize` does not write a backup.

## Recover the JSON file

Phase 1 has **no** conflict detector. If you edited the live JSON after optimize, copying the backup back overwrites those later edits.

1. Confirm the live file you want to restore. Typical sources: `~/.claude.json`, `~/.cursor/mcp.json`, project `.mcp.json`, project `.cursor/mcp.json`.
2. Find the matching backup in the **same directory**. Prefer the stamp from the apply JSON; otherwise take the newest `*.cap-backup` for that source.
3. If you might want the post-optimize file later, copy it aside first (`cp source source.post-optimize`).
4. Copy the backup over the live file:

```bash
cp -- ~/.claude.json.2026-09-19T08-54-12-345Z.cap-backup ~/.claude.json
```

Windows (cmd): `copy /Y "%USERPROFILE%\.claude.json.<stamp>.cap-backup" "%USERPROFILE%\.claude.json"`

5. Restart the Agent so it reloads MCP config.
6. Re-inspect (see below).

## Optional: Registry `external_providers`

Optimize also records migrated servers in `$CAP_HOME/registry.json` or `~/.cap/registry.json` under `external_providers`. Restoring the JSON file puts those MCP entries back into the Agent config. Inspect still treats a name listed in `external_providers` as **CAP-managed**, even when the JSON again contains it.

To make inspect `status` return to **Direct Exposure** (`direct`) as it was before optimize:

1. Open the Registry JSON (mode `0600`).
2. Remove `external_providers` objects whose `originalSource` is the restored file (match `name` if several files were migrated).
3. Save. Do not delete `managed_capabilities` or `mcp_bindings` unless you also intend to drop CAP-managed use of those Providers.

Skipping this step is still a successful JSON recovery: the Agent sees the prior `mcpServers` after reload. Only the inspect role label may stay `CAP-managed`.

## Verify with inspect

```bash
cap inspect --json
```

Acceptance for this runbook:

- The restored JSON again lists the prior `mcpServers` / `mcp_servers` keys.
- Inspect `items` include those MCP names.
- After Registry cleanup, those items have `status: "direct"` (Direct Exposure), not `cap`.
- Human `cap inspect` shows them as Direct Exposure.

`cap-mcp` (CAP Surface) should remain if it was kept during optimize.

This is not automated Restore-point verification (RST-06 later). Re-inspect is the Phase 1 check.
