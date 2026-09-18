# Context Health

CAP 不只是 MCP / Skill 的安装器。它是 **Agent Capability & Context Control Plane**：同时管理 Capability 本身，以及它占用的上下文成本。

一句话：**用最小能力集，换最大有效上下文。**

首页与 `cap inspect` 应优先讲 Context Health 分数、能力已消耗的 token、以及通过动态注入可回收的 token——而不是「安装了 N 个 Skill」。

## 为什么要管 Context

Coding Agent 的有效上下文远小于厂商宣传的 Nominal Window。MCP tool schema、Skill 说明、插件指令会在会话开始时常驻注入。压力升高时，问题通常不是突然「开始幻觉」，而是：

- 注意力稀释（Attention dilution）
- 中间内容丢失（Lost in the Middle）
- 工具选择错误
- 指令互相冲突、召回变差

CAP 的目标是把这些占用变成可观测、可建议、最终可自动治理的成本。

## Context Pressure

```text
Context Pressure = Injected Tokens / Effective Budget
```

必须同时展示两个分母：

| 名称 | 含义 | 默认 |
|------|------|------|
| **Nominal Window** | 厂商宣传上限（例如 1M） | `200000`（可用 `CAP_NOMINAL_WINDOW=1000000` 设为营销上限） |
| **Effective Budget** | 进入 harness 压缩之前、再减去输出/推理预留后的可用窗口 | `min(nominal, harnessSoftLimit) - reserve` |

默认假设（均可覆盖）：

- `CAP_NOMINAL_WINDOW`：`200000`
- `CAP_HARNESS_SOFT_LIMIT`：`200000`（常见 coding harness 软上限；也可设 `272000`）
- `CAP_RESERVE_TOKENS`：`32000`（输出 / reasoning 预留）
- `CAP_EFFECTIVE_BUDGET`：若设置则直接作为有效预算，不再按公式计算

Token 估算沿用 CAP 的可解释规则：`characters / 4`，**不是**某一家模型的官方 tokenizer。Inspect **不会**连接或执行第三方 MCP。

### 压力带（工程产品标准，非行业官方）

| Pressure | Band | 含义 |
|----------|------|------|
| 0–30% | `healthy` | 常驻定义仍有余量 |
| 30–50% | `moderate` | 提示：存在不必要的注入 |
| 50–70% | `high` | 建议卸载或改为按需 MCP / Skill |
| >70% | `critical` | 需要 Context Pruning / Dynamic Injection |
| >85% | `emergency` | 压缩或 Capability eviction |

**Coding Agent SLO：** 常驻 MCP + Skill + Plugin 定义理想上只占 Effective Budget 的 **10–15%**。

`healthScore ≈ clamp(0, 100, 100 - pressure%)`。分数高表示占用低。

当 `effectiveBudget <= 0`（未配置、算成 0、或非法值）时，**不能**标成 `healthy`。`classifyPressure` 返回 `band: "unknown"`、`percent: 0`、`healthScore: 0`——分母无效，压力不可计算。

## 四个设计支柱

1. **Nominal vs Effective 分母**  
   不要只用 1M 当健康基线。先看 harness 软上限，再减去输出/推理预留。

2. **漏斗：Installed → Enabled → Configured → Used**  
   安装了不等于在用。Inspect **只扫配置 / Skills 文件**，不连接 MCP，也不测量当前会话是否真的加载了这些项。V2 能确定的映射：
   - `installed`：本地扫描到的 MCP / Skill **名称去重**（本地 inventory）。**不含**种子 Catalog 里从未扫到的 Provider
   - `enabled`：出现在 Agent 配置里的 MCP + Skills（配置条目数，重复项分别计数）
   - `injected` / `configured`：`direct=true`（配置里会暴露给 Agent 的项；`configured` 是同一数字的诚实别名）
   - `used`：来自 Registry activity 的成功 `use` 去重数；`useAttempts` 为全部 use 次数；仅当从未有过 use 尝试时 `usedUnknown: true`
   - `notes`：说明以上是 config scan

3. **每条 Capability 的 Context Cost**  
   尽量拆成 `schema` / `description` / `instructions` / `total`。全部标记 `estimated`。  
   Skill：常驻注入只有 **name + description**（frontmatter 身份）。正文进入 `cost.instructionTokens`，并标 `instructionOnDemand: true`，**不计入** `contextTokens` / `pressure.injectedTokens` / Pressure 分子。`cost.totalTokens` 可以是各分段之和（潜在总成本）。  
   `value` / Value-per-Cost 由 V3 价值分析（Value Analysis）从 Registry activity 计算（成功 use + UTC 日会话）；无信号时仍为 `null`。

4. **Monitor → advise → auto-govern**  
   见下方路线图。V2 做到可视化 + 建议；V4 第一刀是按任务的装载**计划**（不自动改配置）；自动驱逐仍是后续版本。

## 路线图

| 版本 | 名称 | 状态 |
|------|------|------|
| V1 | Token 可视化 | 已有：`contextTokens`、reduction % |
| V2 | Context Health | 0.2.0：budget / pressure / funnel / 更完整清单 |
| V3 | Value Analysis / 价值分析 | **0.3.0 运行时**：activity → value / valuePerCost、会话日引用、建议减负列表（0.2.0 仅文档；内部模块 `profiler.js`） |
| V4 | Dynamic Injection | **Unreleased 运行时（本切片）**：按任务给出最小装载计划，而非常驻全量 catalog / Direct MCP |
| V5 | Context Control Plane | 策略、SLO、自动 eviction / 压缩建议 |

## V3：价值分析 / Value Analysis（0.3.0 运行时）

0.2.0 只把 V3 写在文档里；**0.3.0 交付运行时**（内部模块 `src/profiler.js`），挂在 `cap inspect` / `--json` / Web Health 的 `profiler` 上（JSON 字段名保持兼容）。

1. **Usage from Activity**  
   从 Registry Activity 按 `capability_id` 聚合 `use`（成功次数、失败 / `connection_required`、最近尝试、UTC 日会话）。`funnel.used` 仍是成功 use 的去重能力数；`funnel.useAttempts` 是全部 use 次数；仅当从未有过 use 尝试时 `usedUnknown: true`。

2. **Value / Cost**  
   有信号时填写 `cost.value`（0–100，由成功 use + 会话日解释）与 `cost.valuePerCost`（`value / catalog context_cost`）；无信号时仍为 `null`。不要把这当成当前会话的实测注入量。

3. **性价比排行 + 建议减负**  
   `profiler.ranked` 按 value-per-cost 排序（人体：性价比排行）；`profiler.underused` 列出已托管但零成功 use、或高成本低性价比的能力（人体：建议减负），供人类决定是否卸载或交给 V4 Dynamic Injection（`cap inject <任务>`）。CAP surface（`cap-mcp`）不是候选。

输入仍是本地 Activity + inspect 估算，不连接第三方 MCP。

## V4：Dynamic Injection（Unreleased 运行时）

V3 告诉你哪些已托管能力性价比低、可以不再常驻。V4 的第一刀是：**给定一个任务，给出最小能力集装载计划**，而不是假设 catalog / Direct MCP 全部注入。

1. **按任务选 load**  
   `cap inject <任务>`（`--json`）复用 `searchCapabilities` 的关键词/意图评分，再用相对分数门槛丢掉弱子串命中（例如 `"PDF to markdown"` 不应装载 `git.repository.status`）。默认最多 3 条。`keepResident` 始终是 CAP 入口三件套（`cap.search` / `cap.add` / `cap.use`）。

2. **defer 其余**  
   种子 catalog 里未入选的能力进入 `defer`（本任务不注入）。对照 `comparison.savedVsCatalog`（全量 `context_cost` − 装载 `context_cost`）。若本地 inspect 扫到 Direct MCP，再给 `savedVsResident`（常驻 inspect 估算 − CAP 入口）。装载能力走 `cap.use`，不把 Provider schema 加进常驻分子。单位不同，全部 `estimated`。

3. **只出计划**  
   `mutates: false`。不改 Agent 配置、不连接第三方 MCP、不自动 `add`。下一步仍是 `cap add` / `cap use`。MCP 工具 `cap.inject` 需 `CAP_MCP_INJECT=1`（或 `exposeInject`），**不**加入默认三工具表面。

仓库 `.agents/skills` 的 Matt Pocock pack 是开发 CAP 的 dogfood，不是终端用户表面，V4 不修剪它。

```json
{
  "version": 4,
  "task": "分析 PostgreSQL 慢查询",
  "mutates": false,
  "load": [{"capability_id": "postgres.query.explain", "context_cost": 740}],
  "defer": [{"capability_id": "git.repository.status", "reason": "not relevant to this task"}],
  "keepResident": {"kind": "cap-surface", "tools": ["cap.search", "cap.add", "cap.use"]},
  "comparison": {
    "loadCount": 1,
    "catalogCount": 6,
    "loadTokens": 740,
    "catalogTokens": 3360,
    "savedVsCatalog": 2620
  }
}
```

## Inspect 输出（CLI / `--json` / `GET /api/inspect`）

在原有 `summary`、`items`、`duplicates`、`recommendations` 上**增量**增加：

```json
{
  "budget": {
    "nominalWindow": 200000,
    "effectiveBudget": 168000,
    "reserveTokens": 32000,
    "assumptions": {}
  },
  "pressure": {
    "injectedTokens": 1200,
    "percent": 0.7,
    "band": "healthy",
    "healthScore": 99
  },
  "funnel": {
    "installed": 3,
    "enabled": 3,
    "injected": 3,
    "configured": 3,
    "used": 0,
    "usedUnknown": true,
    "useAttempts": 0,
    "notes": "Config/skill scan only. Inspect does not connect to MCP servers or measure the live session."
  },
  "profiler": {
    "version": 3,
    "tracked": 0,
    "used": 0,
    "unusedManaged": 0,
    "ranked": [],
    "underused": []
  }
}
```

`summary` 增加 `warnings`、`managed`、`reclaimableTokens`、`capSurface`。`reclaimableTokens` 是把 **非 CAP** Direct MCP 迁到 CAP 后可回收的毛估，**不含** `cap-mcp` 自身。识别规则是启动命令/参数指向 `cap-mcp` / `cap-mcp.js`，不是服务器名叫 `cap`。对 CAP surface：用已知入口工具 schema 估价（默认 3；`CAP_MCP_INSPECT=1` 加 inspect，`CAP_MCP_INJECT=1` 加 inject），`status: "cap"`，`toolCountEstimated: false`。第三方 MCP 仍不连接，工具数继续是 minimum estimate。

每条 inventory item 增加 `status`（`direct` | `managed` | `estimated` | `cap`）和 `cost`。项目 `.mcp.json` 的 `agent` 为 `Project`（Cursor 与 Claude Code 都会读）。

人类可读的 `cap inspect` 与 Web Health 页按同一份报告渲染，但人体输出不展示入口 / 漏斗（这两项只在 `--json` / `/api/inspect`）。人体用带标签的中文：健康分数、常驻占用 / 有效预算、清单角色、价值分析、建议。`summary.registryCapabilities` 是 Registry 里已 `add` 的能力数；`summary.managed` 仍是已迁入 CAP 的 MCP 条目数。

## 相关命令

```bash
cap setup --agent auto
cap inspect
cap inspect --json
CAP_NOMINAL_WINDOW=1000000 cap inspect --json
cap inject "分析 PostgreSQL 慢查询"
cap inject "分析 PostgreSQL 慢查询" --json
cap optimize          # 预览；写入仍需 --apply --yes
```
