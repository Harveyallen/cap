# CAP

> Install more. Expose less.

## 你可能已经遇到这些问题

你在社交媒体、GitHub 或技术社区看到一个新的 MCP 或 Skill：它看起来很有用，于是安装下来试一试。过几天又看到几个，也都想装。单个能力的成本似乎不高，但数量越来越多之后，它们的名称、描述和 Tool Schema 会持续挤占大模型上下文——即使当前任务根本用不到它们。

结果是：**安装的能力越多，Agent 留给真实任务的有效上下文越少；相似能力越多，Agent 选错工具和忽略重要信息的概率也越高。**

另一个问题是发现能力。用户通常知道自己想完成什么，却不知道应该搜索哪个 Skill、MCP Server 或插件。比如你只会说：

> 我想画一张生产系统架构图。

理想情况下，Agent 应该直接找到与“架构图”相关的 Capability，列出可用的 Skill 或 MCP，并说明每个候选的能力覆盖、维护状态、权限、风险和上下文成本。你选择一个 Provider 后，就能立即把它加入 CAP 并在当前任务中使用，而不需要先研究一堆工具名称和安装文档。

## CAP 怎么解决

CAP 把 CLI、MCP、Skill 和 API 统一成 **Capability**，围绕用户意图完成四件事：

1. **Inspect**：看清本机已经安装了什么，以及它们占用了多少上下文。
2. **Search**：用模糊的自然语言描述目标，搜索相关 Capability，而不是工具名称。
3. **Compare**：比较候选 Provider 的覆盖范围、状态、权限、风险和 Context 成本。
4. **Add and Use**：选择 Provider，加入 CAP，然后通过统一入口调用。

```text
“我想画生产架构图”
          │
          ▼
   搜索相关 Capability
          │
          ▼
 Skill / MCP 候选与优缺点
          │
          ▼
      选择 → 添加 → 使用
```

与此同时，Agent 默认只需要面对 `cap.search`、`cap.add` 和 `cap.use`，而不是所有 Provider 的完整工具列表。

当前版本会搜索内置种子 Catalog 和本机发现的 `SKILL.md`。在线公共 Catalog 仍在规划中，因此不是任意意图都一定有结果。

## 三分钟开始

CAP 的主要使用场景是在 Agent 里，而不是让用户记住一组 CLI 命令。打开支持本地终端的 Codex、Claude Code 或 Cursor，把下面这段话直接粘贴进去：

```text
请在这台电脑上安装并检查 CAP：

1. 确认 Node.js 版本不低于 20。
2. 运行 npx -y @harvey2008/cap setup。
3. 如果 setup 输出了更新 PATH 的命令，请执行它。
4. 运行 cap inspect --json。
5. 用中文告诉我：当前发现了多少 MCP、Skills 和暴露工具；它们估算占用多少上下文；Context Health 如何；哪些能力重复或值得迁入 CAP。

只做安装和只读检查。不要执行 cap optimize --apply --yes，也不要连接或运行扫描到的第三方 MCP。
```

Agent 会代你安装 `cap` / `cap-mcp`，备份并配置检测到的 MCP，索引本地 `SKILL.md`，然后把检查结果翻译成人能读懂的报告。你不需要自己分析 JSON，也不需要知道配置文件在哪里。

首次接入 MCP 后，Agent 可能会提示重启或新开一个会话。安装阶段仍可通过终端执行 `cap inspect`；重启后，Agent 才能直接调用 `cap.search`、`cap.add`、`cap.use` 和已启用的诊断入口。

当 Agent 能汇报 MCP、Skills、暴露工具、Context Health 和建议清单时，就表示安装成功。每台机器的配置不同，数量和 token 估算也会不同。

## 第一个完整流程

安装完成并按提示重启 Agent 后，你仍然只需要描述目标。比如直接说：

```text
我想画一张生产系统架构图。

请先通过 CAP 搜索本机和 Catalog 中相关的 Skill 或 MCP。列出最相关的候选，并比较：
- 适合做什么、不适合做什么
- 来源与维护状态
- 需要的权限和风险
- 估算的上下文成本
- 当前是否已经可用，还是需要安装、连接或授权

先让我选择，不要自动执行需要脚本、新权限或外部账号的 Provider。等我选择后，再通过 CAP 添加并使用这个能力。
```

Agent 会把这段模糊意图交给 `cap.search`，只返回少量相关候选。你选择后，Agent 再调用 `cap.add` 和 `cap.use`。如果命中的是本地 Skill，CAP 可以按需读取它的正文；如果命中的是 MCP，CAP 会尝试绑定已有的 `mcpServers` 配置。

如果没有匹配能力、缺少连接或需要额外授权，Agent 应明确说明原因和下一步，而不是假装已经完成架构图。

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

- [产品需求文档](./docs/product-requirements.md)
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
