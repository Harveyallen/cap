# Agent onboarding and inspect copy

Agent-facing wording for Phase 1. Domain terms: [CONTEXT.md](../CONTEXT.md). Requirements: [product-requirements.md](./product-requirements.md). Restore honesty: [restore-from-backup.md](./restore-from-backup.md). Scan claims: [compatibility.md](./compatibility.md).

The README [Agent Installation Directive](../README.md) is the scoped install request. This page is the copy the Agent should use **after** `cap setup` / `cap inspect`.

## First report (ONB-06)

Always return the health summary in the same conversation: MCP / Skill counts, estimated resident tokens, Context Health (pressure band + score), duplicates, high-cost Direct Exposure, reclaimable estimate.

A local visual report is **optional** and must not block CLI-only installs:

- If `cap web` is already running, include `http://127.0.0.1:4173` (Health tab).
- If it is not running, mention that `cap web` serves that URL. Do not start it unless the user wants the page. Do not treat a missing URL as install failure.

Human `cap inspect` prints the same default URL as a next step. `cap inspect --json` remains the machine source. Filter the listing with `--agent` / `--scope` / `--type` / `--status` / `--source` / `--cost-min` / `--cost-max` / `--reason` (INV-10); health tiles stay the full report.

## Existing install (ONB-09)

Re-running `cap setup` on a compatible CAP install must **reuse and upgrade**, not add a second CAP surface.

| Situation | Agent does |
|---|---|
| `cap-mcp` already present (name `cap` or another name) | Report reuse. Do not add another MCP server. Setup upgrades the keeper launch and may print 复用 / 升级. |
| Extra `cap-mcp` entries in the same Agent JSON/TOML | Setup removes extras after `.cap-backup`. JSON `install.deduped` lists removed names. |
| Marked `cap` / `cap-mcp` launchers already on PATH | Setup updates those files; it does not install a second copy in another bin. |
| Project `.mcp.json` also has `cap-mcp` | Inspect may list it (agent `Project`). Setup does not strip project dogfood. |

After setup, inspect `summary.capSurfaces` for that Agent should be 1 in the mutated user config. Same-Agent extras remaining elsewhere show as `duplicates` with `reason: cap-surface`.


## Partial scan (ONB-07)

Installation can succeed while one scan source fails (unreadable or invalid JSON/TOML). Inspect continues other sources and adds `items[]` with `kind: "warning"`.

Use this shape; do not discard the report:

```text
安装已成功。这是一份部分报告，不是整体失败。
有 <N> 个扫描来源失败：<path>（<reason>）。
下面是其余来源的完整 Context Health。失败来源未计入占用估算。
```

Human inspect heading: `部分扫描失败（其余来源已完整报告，不是整体失败）`.

## When to recommend optimize (ONB-11 / ONB-12)

Recommend a **preview** (`cap optimize`, never `--apply --yes` under onboarding consent) when **either**:

1. Context Pressure band is `high`, `critical`, or `emergency`, or
2. `summary.reclaimableTokens` is at least **10% of `budget.effectiveBudget`** (material-savings threshold; closed in [ADR 0001](./adr/0001-material-savings-threshold.md)).

Until Observation Period readiness (14 UTC days and 3 activity days; [ADR 0003](./adr/0003-observation-period-readiness.md)), do not treat unused / Value Analysis `underused` as low-frequency. After readiness, frequency/value advice still must not say remove.

## Optimize recommendation template (ONB-13 / RST-09)

Fill from inspect JSON. Do **not** say 一键恢复, one-click Restore, or “safely reversible with one click.”

```text
建议预览 CAP 优化（先 cap optimize，不要 cap optimize --apply --yes）。
触发：<pressure band 和/或 可回收 tokens 已达有效预算的 10%>。
当前常驻约 <contextTokens> tok / 有效预算 <effectiveBudget>；迁到 CAP 后预计可回收约 <reclaimableTokens> tok（估算）。
会改动的支持项：JSON mcpServers / mcp_servers，以及 Codex 点分表 [mcp_servers.name]；cap-mcp 会保留。
不支持的格式（JSON mcp.servers、Codex inline-table / [mcp_servers] / [mcp.servers.*]）会拒绝并给出手工指引，不会静默改写。
确认应用后，每个被改的文件会先写成 <source>.<stamp>.cap-backup。
后悔时按 docs/restore-from-backup.md 把备份复制回去，再 cap inspect 核对。这不是一键 Restore。
```

## After optimize apply (OPT-07)

After a confirmed `cap optimize --apply --yes`, CAP re-inspects. Read `validation` from `--json` (or the human Validation line).

| Field | Agent does |
|---|---|
| `validation.estimated: true` | Say **estimated**. Never claim a live-session tokenizer count. |
| `validation.projected` vs `validation.actual` | Report both token savings. Actual remaining Direct Exposure from pin/exclude is expected, not a miss. |
| `validation.ok: true` | Apply succeeded. Restart the Agent to reload config. |
| `validation.ok: false` | Treat as failure. `config_invalid` = mutated file unreadable; `cap_surface_broken` = retained `cap-mcp` gone; `invocation_regression` = migrated MCP has no Registry launch for `cap.use`. Point at `.cap-backup` copy-back in [restore-from-backup.md](./restore-from-backup.md). Do not claim one-click Restore. |

Do not connect to third-party MCP to “verify” savings. The validation loop is inspect estimates plus CAP-surface / launch checks.

## Unique hit vs choice (USE-09)

`cap.use` on an unmanaged catalog or local-skill hit **registers a ManagedBinding** (same ledger as `cap.add`). That is **Acquisition + CAP-managed**, not Direct Exposure. It does not add the Provider’s tools to the Agent tool list.

| Search outcome | Agent does |
|---|---|
| One high-confidence local hit (seed catalog or local `SKILL.md`; the only viable candidate in the returned set) | May `cap.use` without a choice step. Implicit add is allowed. |
| Two or more viable hits | Present existing metadata and wait for the user to choose before acquire / first use. |
| Weak or empty match | Say so. Do not invent a Provider. |

Do not describe implicit `use` as Direct Exposure, pin, or “installed into the Agent.” `cap try` is a temporary ManagedBinding; `cap cleanup` removes it without Direct Exposure. Keep the anonymous local outcome; do not imply remote telemetry. Remote catalog try is Phase 3.

## Inspect labels ↔ glossary (INV-07)

| Inspect / CLI / Web | CONTEXT.md | Notes |
|---|---|---|
| `funnel.installed` | Local Inventory | Distinct scanned names. Not seed-catalog size. Not Acquisition. Alias historically called “installed.” |
| `funnel.enabled` | configured entries | Config/skill rows counted with duplicates. |
| `funnel.injected` / `funnel.configured` | Direct Exposure count | Same number. Config scan, not live session. |
| `funnel.used` | Invoked | Distinct capabilities with a successful Registry `use`. |
| item `status: direct` / CLI `Direct Exposure` | Direct Exposure | Resident in Agent config. |
| item `status: estimated` | Direct Exposure | Same, tool count estimated. |
| item `status: managed` / CLI `CAP-managed` | CAP-managed | Registry `external_providers` (migrated MCP) or non-direct inventory. |
| item `status: cap` / CLI `CAP Surface` | CAP Surface | `cap-mcp` entry tools. |
| item `pinned: true` / CLI `pinned` | Pin → Direct Exposure | Kept or written as resident JSON MCP. Not a Move → CAP candidate. |
| item `excluded: true` / CLI `excluded` | Exclude | Hidden from optimize recommendations; not uninstalled. |
| item `scope` | user / project / shared / plugin | From scan path. Plugin trees and `.agents/skills` are not “user home MCP”. |
| item `reasons` | duplicate / overlap / migrate / pinned / excluded / cap-surface | Why the row is notable. Overlap is the INV-06 heuristic, not a path/name dupe. |
| search `[CAP Managed]` / `installed: true` | CAP-managed | Registry `managed_capabilities`. |
| search `[Available]` / `[Local skill]` | discovered, not acquired | Not Direct Exposure. First `use` may acquire. |
| `profiler.underused` | Value Analysis signal | **Not** a low-frequency label. **Not** a remove recommendation in Phase 1. |

Human inspect no longer prints Funnel counts; `--json` does. When summarizing JSON, use the glossary names above, not “installed means CAP-managed.”
