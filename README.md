# CAP

CAP 是面向 AI Agent 的 **Capability & Context Control Plane**。用户按任务搜索 Capability，Provider 被收拢到 CAP Registry；同时计量这些能力占用的上下文。目标不是「安装了多少 Skill」，而是 **Context Health、已消耗 token、以及可回收 token**。

> 用最小能力集，换最大有效上下文。
>
> Install more. Expose less.

## 首屏 Demo

```console
$ cap inspect
CAP Inspect · 2026-09-12 11:32
Claude Code / Codex
14 MCP · 8 Skills · 286 tools · ~37.8k tokens
████████████████████░░  →  3 CAP entry tools (−99%)
Pressure  High  22% · health 78 · effective ~168k / nominal ~200k
Funnel    24 local installed → 22 enabled → 16 injected → used unknown
⚠ 2 warnings · 3 duplicates · ✓ 1 managed

$ cap search "分析 PostgreSQL 慢查询"
1. PostgreSQL Performance Analysis  [Available]
   postgres.query.explain
   Explain a slow PostgreSQL query and recommend evidence-based optimizations.
   Providers: PostgreSQL MCP (Discovered)
```

## V0.2 已实现

- `cap setup`：备份并写入 Claude Code / Codex 的 CAP MCP 与 `cap-context-health` Skill，然后跑一次 `cap inspect`。
- `cap inspect`：扫描本地 MCP 配置与 Skills（不连接 MCP），用人话输出健康分数、常驻占用和清单。`cap-mcp` 不会被建议再迁走。详见 [docs/context-health.md](./docs/context-health.md)。
- `cap search`：使用任务/意图搜索 Capability，并比较 Provider、权限、风险和 Context 成本。
- `cap add`：将 Capability 和 Provider 登记为 `CAP Managed`。
- `cap use`：通过 Capability 抽象调用已登记的本地 Provider；初版内置 Git 状态与 ripgrep 搜索。
- `cap optimize`：展示 Before / After；显式使用 `--apply --yes` 时迁移 JSON MCP 配置，并先生成时间戳备份。
- `cap web`：轻量 Discover、My Capabilities、Context Health 仪表盘。
- `cap-mcp`：MCP stdio 服务，默认仅提供 `cap.search`、`cap.add`、`cap.use`；可选暴露 `cap.inspect`。
- Activity：记录 Add/Use 结果，为后续 CapabilityBench 积累基础数据。

## 安装

`@capability-layer/cap` **尚未发布到 npm**（registry publish 仍推迟）。请用 GitHub 入口：

```bash
npx -y github:Harveyallen/cap setup
```

仓库 `Harveyallen/cap` 是私有的，需要有访问权限。也可以克隆后本地执行：`node ./bin/cap.js setup`。`npx -y @capability-layer/cap setup` 现在会 404，等发布后再用。

Agent 可粘贴：

```text
请安装 CAP（npx -y github:Harveyallen/cap setup；包尚未发布到 npm。也可克隆后 node ./bin/cap.js setup）。
然后运行 cap inspect，用中文汇报 Context Pressure、漏斗（installed → enabled → injected → used）和可回收 token。
之后凡是「上下文占用 / MCP 是否过多」的问题，优先使用 cap.inspect / cap inspect。
```

用法示例：帮我看看当前上下文占用情况

`setup` 会备份并写入 Claude Code / Codex 的 MCP（`cap.search` / `cap.add` / `cap.use`；`cap.inspect` 需进程环境 `CAP_MCP_INSPECT=1`）、安装 `cap-context-health` Skill，并跑一次 inspect。`--agent auto|claude|codex`（默认 auto）。Codex TOML 无法安全改写时会打印手动片段，但仍会装 Skill 并 inspect。

## 安全迁移

默认只预览，不修改 Agent 配置：

```bash
cap optimize
cap optimize --write-plan .cap/optimization-plan.json
```

只有同时提供两个确认参数才会执行：

```bash
cap optimize --apply --yes
```

当前执行迁移仅支持 JSON 中的 `mcpServers` / `mcp_servers`。每个源配置会先复制为 `*.cap-backup`，Provider 配置再写入权限为 `0600` 的 CAP Registry。TOML 配置在 V0.2 中只检查、不自动修改。

## 扫描范围

- Claude Code：`~/.claude.json`、`~/.claude/settings.json`、项目 `.mcp.json`、Skills 目录
- Codex：`~/.codex/config.toml`、`~/.codex/skills`
- 共享项目 Skills：`.agents/skills`

无法从静态配置读取 Tool Schema 时，`Direct Tools` 显示的是保守的最小估算。CAP 不会连接或执行扫描到的 MCP Server。

## 架构

```text
CLI / Web / MCP
       │
       ▼
CAP Core ── Search ── Catalog
   │  │
   │  └──── Registry / Activity
   │
   ├────── Inspector ── Claude / Codex config
   └────── Use ─────── Managed providers
```

核心对象是 Capability，而不是 MCP Server。一个 Capability 可以由多个 MCP、Skill、API 或 CLI Provider 实现。

## AI 友好仓库

本仓库按 coding agent 可导航方式组织：

| 文件 | 用途 |
|------|------|
| [`AGENTS.md`](./AGENTS.md) | Agent 工作约定（命令、边界、目录图） |
| [`llms.txt`](./llms.txt) | LLM / Agent 文档索引 |
| [`docs/architecture.md`](./docs/architecture.md) | 模块边界与数据流 |
| [`docs/context-health.md`](./docs/context-health.md) | Context Pressure、漏斗与 Health 产品说明 |
| [`.agents/skills/`](./.agents/skills/) | 可被 `cap inspect` 发现的共享 Skills |
| [`.mcp.json`](./.mcp.json) | 项目级 CAP MCP（dogfood） |
| [`src/index.js`](./src/index.js) | 稳定程序化 API：`searchCapabilities` / `addCapability` / `useCapability` / `inspectLocal` / `loadCatalog` / `loadState` |
| [`data/catalog.schema.json`](./data/catalog.schema.json) | Catalog 结构约束 |

Claude Code / Cursor / Copilot 等也会读取 `CLAUDE.md`、`.cursor/rules/`、`.github/copilot-instructions.md`，内容以 `AGENTS.md` 为准。

## 开发

```bash
npm test
npm run check
node ./bin/cap.js setup --agent auto
node ./bin/cap.js inspect
node ./bin/cap.js web --port 4173
```

种子 Catalog 位于 `data/catalog.json`，结构见 `data/catalog.schema.json`。添加记录时保持 `capability_id` 稳定，并在 `provider_refs` 与 Provider 的 `capabilities` 中双向声明。Agent 侧可直接按 `.agents/skills/add-capability/SKILL.md` 执行。

## V3 价值分析（Value Analysis）

Unreleased 运行时（0.2.0 仅文档）：从 Registry Activity 统计每条 Capability 的使用，计算 Value/Cost，在 `cap inspect` / Web Health 展示性价比排行与建议减负。详见 [docs/context-health.md](./docs/context-health.md)。

## V0.2 边界

- 公共 Registry/GitHub 的在线抓取、语义向量检索与 OAuth 连接尚未实现；当前使用本地 curated Catalog 和可解释的混合关键词评分。
- 非内置 Provider 可以添加，但 Use 会返回 `connection_required`，不会伪装成已执行。
- Context footprint 是可解释的字符/Schema 估算，不等同于某个特定模型 tokenizer 的精确值。高 Context Pressure 不会突然「触发幻觉」，但会造成注意力稀释、召回变差、选错工具和指令冲突（Lost in the Middle）。
- V3 价值分析运行时已在 Unreleased（`src/profiler.js`）：`cost.value` 来自 Activity 信号，无信号时仍为 `null`；不假装测量当前会话注入。
- 本版优先验证开发者闭环，不包含 Desktop、企业权限、团队治理，也不发布 npm。
