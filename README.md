# CAP

> Install more. Expose less.

## 为什么需要 CAP

在社交媒体或 GitHub 看到好用的 MCP、Skill，当然都想装来试试。问题是，许多能力安装后会长期暴露名称、描述和 Tool Schema：**装得越多，留给真实任务的上下文越少，Agent 也越容易选错工具。**

上下文就像随身背包。你只是下楼散步，却被迫背上帐篷、炉具和登山绳；装备以后也许有用，但不该每次出门都全部背着。Agent 也一样：它可能只需修改一行代码，却要同时“背着”钉钉、数据库、PDF、PPT 等几十套工具说明。

例如，一个钉钉类企业协作 MCP 如果暴露 **80 个工具**，每个工具 Schema 平均估算 **350 tokens**：

```text
80 个工具 × 350 tokens ≈ 28,000 tokens
28,000 ÷ 168,000 有效上下文 ≈ 17%
```

用户还没发出第一条任务，它就可能先占走近六分之一的有效上下文；再装几个重型 MCP，负担会迅速叠加。

> 上述数字是帮助理解量级的示意估算，不代表某个钉钉 MCP 版本的实测结果。工具数量和 Schema 大小会随版本、配置与 Agent 注入方式变化；CAP 会在本机扫描后给出当前环境的估算值。

另一个问题是：用户知道想做什么，却不知道该装哪个工具。比如只说：

> 我想生成一份 PPT。

CAP 应直接找到相关 Skill 或 MCP，说明各自的优缺点、权限、风险和上下文成本；用户选一个，就能立即使用。

## CAP 怎么解决

CAP 把 CLI、MCP、Skill 和 API 统一成 **Capability**，围绕用户意图完成四件事：

1. **Inspect**：看清本机已经安装了什么，以及它们占用了多少上下文。
2. **Search**：用模糊的自然语言描述目标，搜索相关 Capability，而不是工具名称。
3. **Compare**：比较候选 Provider 的覆盖范围、状态、权限、风险和 Context 成本。
4. **Add and Use**：选择 Provider，加入 CAP，然后通过统一入口调用。

```text
“我想生成一份 PPT”
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

CAP 更像门口的装备柜：能力都可以收藏，只在任务需要时取出，不必一直挤在 Agent 的随身背包里。

当前版本会搜索内置种子 Catalog 和本机发现的 `SKILL.md`。在线公共 Catalog 仍在规划中，因此不是任意意图都一定有结果。

## 三分钟开始

CAP 的主要使用场景是在 Agent 里，而不是让用户记住一组 CLI 命令。打开支持本地终端的 Codex、Claude Code 或 Cursor，把下面整段 **Agent 安装指令** 原样粘贴进去即可。粘贴这段专用指令，就表示你要求 Agent 执行其中限定的安装与只读检查，不需要再向 CAP 确认一次；Codex、Claude Code 或 Cursor 自身仍可能显示必要的命令执行审批。

```text
这是一个明确的执行请求，不是让我总结下面的步骤。请现在在这台电脑上安装并检查 CAP：

1. 运行 node --version，确认 Node.js 版本不低于 20；如果不满足就停止并告诉我如何升级。
2. 运行 npx -y @harvey2008/cap setup --agent auto。
3. 如果 setup 输出了更新 PATH 的命令，请执行它。
4. 运行 cap inspect --json。
5. 用中文告诉我：当前发现了多少 MCP、Skills 和暴露工具；它们估算占用多少上下文；Context Health 如何；哪些能力重复或值得迁入 CAP。如果某个扫描来源失败，说明这是部分报告、不是整体失败，并指出失败路径。口头报告不要因为没有可视化页面而中断；若已运行 cap web，附上 http://127.0.0.1:4173，否则可以提一句 cap web 会提供该地址。
6. 如果 Context Pressure 是 high、critical 或 emergency，或者可回收上下文达到有效预算的 10% 及以上，请明确建议我预览 CAP 优化，并说明：触发原因、优化前后预计占用、预计节省量、会修改哪些 JSON 配置、确认后会写入时间戳 .cap-backup、按文档把备份复制回去即可恢复（不是一键 Restore）。先只展示建议和预览命令，不要直接应用优化。不要根据“尚未使用”说低频或建议移除。

粘贴这段指令已经表示我同意你执行上述安装、CAP 最小入口配置和只读检查，请直接执行，不要再次询问我是否要安装。不要执行 cap optimize --apply --yes，也不要连接或运行扫描到的第三方 MCP。若 Agent 平台自身要求命令执行审批，正常发起该审批。
```

Agent 会代你安装 `cap` / `cap-mcp`，备份并配置检测到的 MCP，索引本地 `SKILL.md`，然后把检查结果翻译成人能读懂的报告。你不需要自己分析 JSON，也不需要知道配置文件在哪里。

如果 MCP / Skills 已经严重挤占上下文（压力带为 high / critical / emergency，或可回收量达到有效预算的 10%），Agent 应直接给出行动建议，例如“建议预览 CAP 优化，预计可回收 18,000 tokens”。它会同时说明优化会修改什么、备份写成 `<配置文件>.<时间戳>.cap-backup`，以及按 [从备份恢复](./docs/restore-from-backup.md) 把该文件复制回去。首次体检只推荐和预览，不会直接应用优化；你确认方案后才会执行。当前版本会为受支持的 JSON 配置创建时间戳 `.cap-backup`；可复原范围就是这份备份和文档中的复制步骤，不是跨 Agent 的一键 Restore。不要宣称已经支持自动恢复。

首次接入 MCP 后，Agent 可能会提示重启或新开一个会话。安装阶段仍可通过终端执行 `cap inspect`；重启后，Agent 才能直接调用 `cap.search`、`cap.add`、`cap.use` 和已启用的诊断入口。

当 Agent 能汇报 MCP、Skills、暴露工具、Context Health 和建议清单时，就表示安装成功。每台机器的配置不同，数量和 token 估算也会不同。

## 第一个完整流程

安装完成并按提示重启 Agent 后，你仍然只需要描述目标。比如直接说：

```text
我想生成一份 PPT。

请先通过 CAP 搜索本机和 Catalog 中相关的 Skill 或 MCP。列出最相关的候选，并比较：
- 适合做什么、不适合做什么
- 来源与维护状态
- 需要的权限和风险
- 估算的上下文成本
- 当前是否已经可用，还是需要安装、连接或授权

如果只有一个高置信的本机命中，可以直接通过 CAP 使用（尚未托管时会先登记到 Registry：这是 Acquisition，不会变成 Direct Exposure）。如果有多个可用候选，先让我选择。不要自动执行需要脚本、新权限或外部账号的 Provider。
```

Agent 会把这段模糊意图交给 `cap.search`，只返回少量相关候选。唯一高置信本机命中可以跳过选择、直接 `cap.use`；多个可用候选仍需你先选。`cap.use` 在尚未托管时会先登记（与 `cap.add` 同一账本），这是 CAP-managed，不是把工具列表写进 Agent。`cap.add` 仍可用于显式启用。如果命中的是本地 Skill，CAP 可以按需读取它的正文；如果命中的是 MCP，CAP 会尝试绑定已有的 `mcpServers` 配置。

如果没有匹配能力、缺少连接或需要额外授权，Agent 应明确说明原因和下一步，而不是假装已经生成 PPT。

## 搜索不到不是安装失败

CAP 会搜索内置种子 Catalog，并叠加本机发现的 `SKILL.md`。它目前不是完整的在线 MCP Marketplace。例如：

```bash
cap search "生成一份 PPT"
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

搜索命中不等于 Provider 已连接，也不等于 Direct Exposure。结果中的 `Available` / `Local skill` 表示尚未 Acquisition；`CAP Managed` 表示已有 ManagedBinding，可通过 `cap.use` 调用。本地 Skill 默认只返回名称、摘要和路径，正文仅在明确请求时加载。

## 工作方式

```text
用户任务
   │
   ▼
cap.search ── 找到 Capability 与候选 Provider（含 input_schema）
   │
   ▼
cap.use ───── 未托管时先登记（与 cap.add 相同账本），再执行
   │
   └─ cap.add 仍可用于显式启用 / inspect
```

Capability 描述“能完成什么”，Provider 描述“由谁实现”。同一个 Capability 可以有多个 Provider。CAP 不会把下游 Provider 的完整 Tool Schema 或 Skill 正文重新暴露给 Agent，只会按需返回当前能力的输入和内容。

## 常用命令

| 命令 | 用途 | 是否修改状态 |
|---|---|---|
| `cap setup` | 安装命令、接入 Agent 并索引本地 Skills | 是，写入前备份 |
| `cap inspect` | 检查 MCP、Skills 和上下文占用 | 否，只读扫描 |
| `cap search <任务>` | 搜索种子 Capability 与本地 Skills | 否 |
| `cap inject <任务>` | 生成最小能力装载计划 | 否，只生成计划 |
| `cap add <id>` | 将能力与 Provider 加入 CAP（显式启用） | 是，更新 Registry |
| `cap use <id>` | 调用 CLI、MCP 或按需读取本地 Skill；未托管时先登记 | 是，可能更新 Registry 并执行 |
| `cap pin <provider>` | 将 Provider 固定为 Direct Exposure | 是，可能写回 JSON MCP |
| `cap unpin <provider>` | 取消固定，恢复非驻留 CAP-managed | 是，可能迁出 JSON MCP |
| `cap exclude <provider>` | 从 optimize 建议中排除，不卸载 | 是，只改 Registry |
| `cap include <provider>` | 重新允许出现在建议里 | 是，只改 Registry |
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
- `cap optimize` 默认只预览；只有 `cap optimize --apply --yes` 才修改支持的 JSON MCP 与 Codex 点分表 TOML，并持久化 Skill 索引。应用成功后会再跑一次 inspect，对比 **projected vs actual** 估算节省；配置损坏或 CAP 入口丢失时失败（不是一键 Restore）。
- `cap pin` 把 Provider 写成 Direct Exposure；`cap unpin` 再收回到 CAP-managed。`cap exclude` 只从建议里拿掉，不卸载。默认 MCP 入口仍是 search / add / use。
- 修改配置前会创建带时间戳的 `*.cap-backup`；从备份恢复见 [runbook](./docs/restore-from-backup.md)。这不是一键 Restore。Registry 文件权限为 `0600`。
- 不支持的格式（JSON `mcp.servers`、Codex inline-table / `[mcp_servers]` / `[mcp.servers.*]`）会被拒绝并给出手工指引，不会静默改写。详见 [兼容性矩阵](./docs/compatibility.md)。
- Context footprint 是字符和 Schema 的稳定估算，不是模型 tokenizer 的精确计数。

扫描范围以 [OS/Agent 兼容性矩阵](./docs/compatibility.md) 为准：Claude Code、Cursor、Codex 以及共享目录中的用户级/项目级 MCP 与 Skills（含 Cursor 插件缓存中的 Skills）。矩阵标为 unknown 的路径不要当成已支持。

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
- [领域词汇](./CONTEXT.md)
- [Agent 体检与推荐用语](./docs/agent-onboarding.md)
- [从 `.cap-backup` 恢复 JSON MCP](./docs/restore-from-backup.md)
- [OS / Agent 兼容性矩阵](./docs/compatibility.md)
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
