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

## 四个设计支柱

1. **Nominal vs Effective 分母**  
   不要只用 1M 当健康基线。先看 harness 软上限，再减去输出/推理预留。

2. **漏斗：Installed → Enabled → Injected → Used**  
   安装了不等于在用。V2 能确定的映射：
   - `installed`：种子 Catalog Provider + 扫描到的 MCP/Skill 去重计数
   - `enabled`：出现在 Agent 配置里的 MCP + Skills
   - `injected`：`direct=true`（当前会暴露给 Agent 的项）
   - `used`：来自 Registry activity 的成功 `use`；若没有则 `0` 且 `usedUnknown: true`

3. **每条 Capability 的 Context Cost**  
   尽量拆成 `schema` / `description` / `instructions` / `total`。全部标记 `estimated`。  
   `value` / Value-per-Cost 在 V2 先留空（`value: null`），供 V3 Profiler 使用。

4. **Monitor → advise → auto-govern**  
   见下方路线图。V2 做到可视化 + 建议；自动驱逐与动态注入是后续版本。

## 路线图

| 版本 | 名称 | 状态 |
|------|------|------|
| V1 | Token 可视化 | 已有：`contextTokens`、reduction % |
| V2 | Context Health | 本版：budget / pressure / funnel / 更完整清单 |
| V3 | Capability Context Profiler | 真实 value/cost、按会话引用 |
| V4 | Dynamic Injection | 按任务装载 MCP / Skill，而非常驻 |
| V5 | Context Control Plane | 策略、SLO、自动 eviction / 压缩建议 |

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
    "installed": 9,
    "enabled": 3,
    "injected": 3,
    "used": 0,
    "usedUnknown": true
  }
}
```

`summary` 增加 `warnings`、`managed`、`reclaimableTokens`（把 Direct MCP 迁到 CAP 后可回收的估算 token）。每条 inventory item 增加 `status`（`direct` | `managed` | `estimated`）和 `cost`。

人类可读的 `cap inspect` 与 Web Health 页按同一份报告渲染：压力带、漏斗、重复项、按 token 排序的迁移建议、按 Agent 分组的清单。

## 相关命令

```bash
cap inspect
cap inspect --json
CAP_NOMINAL_WINDOW=1000000 cap inspect --json
cap optimize          # 预览；写入仍需 --apply --yes
```
