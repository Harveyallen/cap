# OS / Agent compatibility matrix

CAP inspects Codex, Claude Code, and Cursor configuration on macOS, Windows, and Linux **only along the paths in this matrix**. Launch language must not claim Agents, OS layouts, or config files that a cell here does not mark **tested** or **expected**.

Verification notes:

| Note | Meaning |
|---|---|
| **tested** | Exercised by this repo’s Node tests (`path.join` + mocked `userHome` / `projectRoot`) on Linux. |
| **expected** | Same relative layout as a tested cell. Scanners use `os.homedir()` and `path.join`, so the path is OS-native. Not separately run on that OS in this repository. |
| **unknown** | Not scanned, or an OS-specific alternate layout is not implemented. Do not claim support. |

Home in the tables is `os.homedir()`: `~` on macOS/Linux, `%USERPROFILE%` on Windows. CAP does **not** scan `%APPDATA%`, `%LOCALAPPDATA%`, or ProgramData.

Optimize `--apply` mutates **JSON MCP** rows only. Codex TOML is inspect-only.

## MCP configs CAP inspects

| Config | Agent label | Linux | macOS | Windows | Optimize apply |
|---|---|---|---|---|---|
| `~/.claude.json` | Claude Code | tested | expected | expected | JSON yes |
| `~/.claude/settings.json` | Claude Code | expected | expected | expected | JSON yes |
| `~/.cursor/mcp.json` | Cursor | tested | expected | expected | JSON yes |
| `<project>/.cursor/mcp.json` | Cursor | expected | expected | expected | JSON yes |
| `<project>/.mcp.json` | Project (Claude Code and Cursor both read) | tested | expected | expected | JSON yes |
| `~/.codex/config.toml` | Codex | tested (missing file = empty; setup writes TOML) | expected | expected | **no** (inspect-only) |

`~/.claude/settings.json` is in the default inspect list (`defaultMcpJsonConfigs`) but tests usually override `jsonConfigs` with `~/.claude.json` only, so that row is **expected**, not **tested**.

## Skills CAP inspects

Skill roots are walked for `SKILL.md`. Cursor plugin trees walk deeper (`plugins/cache/…/skills`). See [local-skills.md](./local-skills.md).

| Root | Agent label | Linux | macOS | Windows |
|---|---|---|---|---|
| `~/.claude/skills` | Claude Code | tested | expected | expected |
| `~/.claude/plugins` | Claude Code | expected | expected | expected |
| `~/.codex/skills` | Codex | expected | expected | expected |
| `~/.cursor/skills` | Cursor | expected | expected | expected |
| `~/.cursor/skills-cursor` | Cursor | expected | expected | expected |
| `~/.cursor/plugins` | Cursor | expected | expected | expected |
| `~/.agents/skills` | Shared | expected | expected | expected |
| `<project>/.claude/skills` | Claude Code | expected | expected | expected |
| `<project>/.codex/skills` | Codex | expected | expected | expected |
| `<project>/.cursor/skills` | Cursor | expected | expected | expected |
| `<project>/.cursor/skills-cursor` | Cursor | expected | expected | expected |
| `<project>/.agents/skills` | Shared | tested (repo `.agents/skills`) | expected | expected |

## Unknown (do not claim)

| Layout | Why |
|---|---|
| `%APPDATA%` / `%LOCALAPPDATA%` Agent configs on Windows | Not scanned. |
| Claude Code `settings.local.json`, project `.claude/settings.json` | Not in the default inspect list. |
| Cursor cloud / non-file MCP | Not a local file scan. |
| Agents other than Codex, Claude Code, Cursor | No adapter. |
| Specific OS or Agent **versions** | Open; this matrix is path-level, not a version floor. |

## Launch claims that match this matrix

Safe:

- CAP inspects Codex, Claude Code, and Cursor MCP/Skill files under the home and project paths above on macOS, Windows, and Linux.
- JSON MCP optimize apply is the Claude/Cursor/project JSON rows, with `.cap-backup`.
- Codex TOML is read for inventory; it is not auto-migrated.

Not safe:

- “Every Agent on every OS.”
- “Windows APPDATA configs.”
- “Codex optimize apply.”
- “Verified on macOS and Windows CI” — this repo’s tests run on Linux; other OS cells are **expected**.
