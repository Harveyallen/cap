# CAP

让 Agent 只看到少量稳定入口，其他能力按任务查找、添加和调用；同时看清本地 MCP 与 Skills 占用了多少上下文。

> Install more. Expose less.

MCP 和工具越装越多，常驻 Tool Schema 占用的上下文也越多。CAP 把底层 CLI、MCP、Skill 和 API 统一成 **Capability**，让 Agent 默认只面对 `cap.search`、`cap.add` 和 `cap.use`，而不是所有 Provider 的完整工具列表。

## 三分钟开始

需要 Node.js 20 或更高版本。

```bash
npx -y @harvey2008/cap setup
```

`setup` 会安装 `cap` / `cap-mcp` 命令，备份并配置检测到的 Claude Code 或 Codex MCP，安装 Context Health Skill，索引本地 `SKILL.md`，然后执行一次本机检查。

如果输出提示当前终端需要更新 PATH，请复制执行它给出的 `export PATH=...` 命令。随后运行：

```bash
cap inspect
```

看到 MCP、Skills、暴露工具、Context Health 和建议清单，就表示安装成功。每台机器的配置不同，数量和 token 估算也会不同。

## 第一个完整流程

这个例子使用内置 Git Provider，不需要安装第三方 MCP：

```bash
# 1. 按任务搜索，而不是按插件名搜索
cap search "查看 Git 仓库状态"

# 2. 将能力加入 CAP Registry
cap add git.repository.status

# 3. 通过统一入口调用能力
cap use git.repository.status --input '{"path":"."}'
```

对于 MCP Provider，`cap add` 会尝试绑定本地已有的 `mcpServers` 配置。没有可用连接时，CAP 返回 `connection_required` 和下一步建议，不会假装任务已经执行。

## 搜索不到不是安装失败

CAP 会搜索内置种子 Catalog，并叠加本机发现的 `SKILL.md`。它目前不是完整的在线 MCP Marketplace。例如：

```bash
cap search "生产架构图"
```

如果本机没有相应 Skill，可能返回 `No matching capability found.`。这表示命令运行正常，只是当前种子目录和本地 Skills 都没有匹配能力。

可以用以下任务验证内置搜索：

```bash
cap search "查看 Git 仓库状态"
cap search "在项目中搜索代码"
cap search "分析 PostgreSQL 慢查询"
cap search "发送钉钉消息"
cap search "把 PDF 转成 Markdown"
```

搜索命中不等于 Provider 已连接。结果中的 `Available`、`CAP Managed`、权限和连接状态会说明下一步。本地 Skill 默认只返回名称、摘要和路径，正文仅在明确请求时加载。

## 工作方式

```text
用户任务
   │
   ▼
cap.search ── 找到 Capability 与候选 Provider
   │
   ▼
cap.add ───── 登记能力并绑定本地 Provider
   │
   ▼
cap.use ───── 通过统一输入调用 CLI、MCP 或本地 Skill
```

Capability 描述“能完成什么”，Provider 描述“由谁实现”。同一个 Capability 可以有多个 Provider。CAP 不会把下游 Provider 的完整 Tool Schema 或 Skill 正文重新暴露给 Agent，只会按需返回当前能力的输入和内容。

## 常用命令

| 命令 | 用途 | 是否修改状态 |
|---|---|---|
| `cap setup` | 安装命令、接入 Agent 并索引本地 Skills | 是，写入前备份 |
| `cap inspect` | 检查 MCP、Skills 和上下文占用 | 否，只读扫描 |
| `cap search <任务>` | 搜索种子 Capability 与本地 Skills | 否 |
| `cap inject <任务>` | 生成最小能力装载计划 | 否，只生成计划 |
| `cap add <id>` | 将能力与 Provider 加入 CAP | 是，更新 Registry |
| `cap use <id>` | 调用 CLI、MCP 或按需读取本地 Skill | 会执行对应 Provider |
| `cap optimize` | 预览 MCP 收拢与 Skill 索引计划 | 否，默认仅预览 |
| `cap web` | 启动本地搜索与健康页面 | 否 |

机器读取时添加 `--json`：

```bash
cap inspect --json
cap search "分析 PostgreSQL 慢查询" --json
cap inject "分析 PostgreSQL 慢查询" --json
```

## 安全边界

- `cap inspect` 只读取本地配置，不连接或执行扫描到的第三方 MCP。
- `cap search` 只读取本地 Skill 的名称和描述，不默认加载正文。
- `cap inject` 只生成 load / defer 计划，不修改 Agent 配置。
- `cap optimize` 默认只预览；只有 `cap optimize --apply --yes` 才修改支持的 JSON MCP 配置并持久化 Skill 索引。
- 修改配置前会创建带时间戳的 `*.cap-backup`；Registry 文件权限为 `0600`。
- Codex TOML 当前只检查，不由 optimize 自动修改。
- Context footprint 是字符和 Schema 的稳定估算，不是模型 tokenizer 的精确计数。

扫描范围包括 Claude Code、Cursor、Codex 和共享目录中的用户级/项目级 MCP 配置与 Skills，也包括 Cursor 插件缓存中的 Skills。

## 当前边界

- 公共 Registry 在线同步、语义向量检索和通用 OAuth 尚未实现。
- 内置 Git 与 ripgrep 能力可直接调用；MCP 能力需要本地 stdio 启动配置或 Registry 绑定。
- 本地 Skill 可以直接搜索和按需读取，但 CAP 不会自行执行 Skill 中描述的工作流。
- 产品当前面向开发者，不包含 Desktop、企业权限和团队治理。

## 从源码运行

```bash
git clone https://github.com/Harveyallen/cap.git
cd cap
node ./bin/cap.js setup
```

不执行 setup 也可以直接调用：

```bash
node ./bin/cap.js inspect
node ./bin/cap.js search "查看 Git 仓库状态"
```

## 深入阅读

- [架构与模块边界](./docs/architecture.md)
- [本地 Agent Skills 的发现与按需读取](./docs/local-skills.md)
- [Context Health、Value Analysis 与 Dynamic Injection](./docs/context-health.md)
- [MCP Gateway 与按需 input schema](./docs/mcp-gateway.md)
- [Agent 工作约定](./AGENTS.md)
- [LLM 文档索引](./llms.txt)

## 开发

项目使用 Node.js ESM，运行时零 npm 依赖，测试基于 `node:test`。

```bash
npm test
npm run check
```

种子目录位于 `data/catalog.json`。添加 Capability 时保持 `capability_id` 稳定，并维护 Capability `provider_refs` 与 Provider `capabilities` 的双向引用。完整约束见 [AGENTS.md](./AGENTS.md)。
