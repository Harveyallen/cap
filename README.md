# CAP

CAP 是面向 AI Agent 的本地能力层。用户按任务搜索 Capability，Provider 被收拢到 CAP Registry，Agent 默认只需看到少量稳定入口。

> Install more. Expose less.

## 首屏 Demo

```console
$ cap inspect
Claude Code / Codex
  MCP Servers       14
  Skills            8
  Direct Tools      286
  Estimated Schema  37,800 tokens

Potential consolidation
  286 tools → 3 CAP entry tools
  Estimated reduction: 99%

$ cap search "分析 PostgreSQL 慢查询"
1. PostgreSQL Performance Analysis  [Available]
   postgres.query.explain
   Explain a slow PostgreSQL query and recommend evidence-based optimizations.
   Providers: PostgreSQL MCP (Discovered)
```

## V0.1 已实现

- `cap inspect`：扫描 Claude Code / Codex 的 MCP 配置与本地 Skills，估算直接暴露工具和 Context footprint，标记重复项。
- `cap search`：使用任务/意图搜索 Capability，并比较 Provider、权限、风险和 Context 成本。
- `cap acquire`：将 Capability 和 Provider 登记为 `CAP Managed`。
- `cap use`：通过 Capability 抽象调用已登记的本地 Provider；初版内置 Git 状态与 ripgrep 搜索。
- `cap optimize`：展示 Before / After；显式使用 `--apply --yes` 时迁移 JSON MCP 配置，并先生成时间戳备份。
- `cap web`：轻量 Discover、My Capabilities、Health 页面。
- `cap-mcp`：MCP stdio 服务，默认仅提供 `cap.search`、`cap.acquire`、`cap.use`；可选暴露 `cap.inspect`。
- Activity：记录 Acquire/Use 结果，为后续 CapabilityBench 积累基础数据。

## 快速开始

要求 Node.js 20 或更高版本，无第三方运行时依赖。

```bash
npm link
cap inspect
cap search "review GitHub PR security"
cap acquire git.repository.status
cap use git.repository.status --input '{"path":"."}'
cap web
```

打开 `http://127.0.0.1:4173` 使用 Web Search。

也可以不安装，直接运行：

```bash
node ./bin/cap.js inspect
node ./bin/cap.js web --port 4173
```

## 接入 Agent

MCP 命令为仓库内 `bin/cap-mcp.js` 的绝对路径。例如 Claude Code 配置：

```json
{
  "mcpServers": {
    "cap": {
      "command": "node",
      "args": ["/absolute/path/to/cap/bin/cap-mcp.js"]
    }
  }
}
```

服务使用 MCP JSON-RPC stdio，每行一条消息。它不会把下游 Provider 的完整 Tool Schema 暴露给 Agent。
如需让 Agent 自助诊断，可为 MCP 进程设置 `CAP_MCP_INSPECT=1`；默认保持 3 个入口。

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

当前执行迁移仅支持 JSON 中的 `mcpServers` / `mcp_servers`。每个源配置会先复制为 `*.cap-backup`，Provider 配置再写入权限为 `0600` 的 CAP Registry。TOML 配置在 V0.1 中只检查、不自动修改。

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
| [`.agents/skills/`](./.agents/skills/) | 可被 `cap inspect` 发现的共享 Skills |
| [`.mcp.json`](./.mcp.json) | 项目级 CAP MCP（dogfood） |
| [`src/index.js`](./src/index.js) | 稳定程序化 API：`searchCapabilities` / `acquireCapability` / `useCapability` / `inspectLocal` / `loadCatalog` / `loadState` |
| [`data/catalog.schema.json`](./data/catalog.schema.json) | Catalog 结构约束 |

Claude Code / Cursor / Copilot 等也会读取 `CLAUDE.md`、`.cursor/rules/`、`.github/copilot-instructions.md`，内容以 `AGENTS.md` 为准。

## 开发

```bash
npm test
npm run check
```

种子 Catalog 位于 `data/catalog.json`，结构见 `data/catalog.schema.json`。添加记录时保持 `capability_id` 稳定，并在 `provider_refs` 与 Provider 的 `capabilities` 中双向声明。Agent 侧可直接按 `.agents/skills/add-capability/SKILL.md` 执行。

## V0.1 边界

- 公共 Registry/GitHub 的在线抓取、语义向量检索与 OAuth 连接尚未实现；当前使用本地 curated Catalog 和可解释的混合关键词评分。
- 非内置 Provider 可以 Acquire，但 Use 会返回 `connection_required`，不会伪装成已执行。
- Context footprint 是可解释的字符/Schema 估算，不等同于某个特定模型 tokenizer 的精确值。
- 首版优先验证开发者闭环，不包含 Desktop、企业权限和团队治理。
