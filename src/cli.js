/** CLI command routing and human/JSON formatting. */
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from './inspector.js';
import { searchCapabilities } from './search.js';
import { addCapability, loadState } from './registry.js';
import { useCapability } from './use.js';
import { planInjection } from './inject.js';
import { applyOptimization, buildOptimizationPlan, writeOptimizationPlan } from './optimize.js';
import { setupCap } from './setup.js';
import { DEFAULT_WEB_URL, startWebServer } from './web-server.js';
import { packageVersion } from './paths.js';

const help = `CAP ${packageVersion()} — Capability & Context Control Plane
用最小能力集，换最大有效上下文。

Usage:
  cap setup [--agent auto|claude|codex] [--json]
  cap inspect [--json]
  cap search <task> [--json]
  cap inject <task> [--json]
  cap add <capability-id> [--provider <provider-id>] [--server <mcp-name>] [--json]
  cap use <capability-id> [--input <json>] [--json]
  cap optimize [--write-plan <file>] [--apply --yes] [--json]
  cap activity [--json]
  cap web [--port <number>]
  cap help
`;

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positional(args) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) { if (!['--json', '--apply', '--yes'].includes(args[i])) i += 1; }
    else values.push(args[i]);
  }
  return values;
}

function print(value, json) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function activityLine(item) {
  const outcome = item.success === false ? 'failed' : 'ok';
  if (item.action === 'search') {
    const pick = item.selected_id ?? item.top_id ?? '-';
    return `${item.at}  search  q=${item.query ?? ''}  hits=${item.hit_count ?? 0}  ${pick}  ${outcome}`;
  }
  return `${item.at}  ${item.action}  ${item.capability_id ?? '-'}  ${outcome}`;
}

function colorEnabled() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function paint(code, text) {
  return colorEnabled() ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export function compactTokens(value) {
  const n = Math.round(Number(value) || 0);
  if (Math.abs(n) >= 1000) return `~${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `~${n}`;
}

function stamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shortPath(file, home = os.homedir(), cwd = process.cwd()) {
  if (!file) return '';
  if (file === home || file.startsWith(`${home}${path.sep}`)) return `~${file.slice(home.length)}`;
  const relative = path.relative(cwd, file);
  if (relative && !relative.startsWith(`..${path.sep}`) && relative !== '..') return relative;
  return file;
}

function pressureTone(band) {
  if (band === 'healthy') return 32;
  if (band === 'moderate' || band === 'high' || band === 'unknown') return 33;
  return 31;
}

function bandPhrase(band) {
  return {
    healthy: '很好',
    moderate: '一般',
    high: '偏高',
    critical: '很高',
    emergency: '紧急',
    unknown: '无法计算'
  }[band] ?? band;
}

function roleLabel(item) {
  if (item.status === 'cap' || item.capSurface) return 'CAP Surface';
  if (item.status === 'managed' || item.direct === false) return 'CAP-managed';
  if (item.status === 'estimated' || item.toolCountEstimated) return 'Direct Exposure（工具数是估算）';
  return 'Direct Exposure';
}

function kindMark(item) {
  return item.kind === 'skill' ? '○' : '●';
}

export function inspectText(report, options = {}) {
  const s = report.summary;
  const pressure = report.pressure ?? {};
  const budget = report.budget ?? {};
  const home = options.userHome ?? os.homedir();
  const cwd = options.projectRoot ?? process.cwd();
  const rel = (file) => shortPath(file, home, cwd);
  const agents = [...new Set(report.items.filter((item) => item.agent).map((item) => item.agent))].join(' / ') || '未发现 Agent 配置';
  const estimateNote = report.items.some((item) => item.toolCountEstimated && !item.capSurface) ? '（部分工具数是估算）' : '';
  const band = pressure.band ?? 'healthy';
  const capSurface = Boolean(s.capSurface) || report.items.some((item) => item.capSurface);
  const rule = '─'.repeat(56);
  const healthLine = band === 'unknown'
    ? '健康  无法计算 · 有效预算无效（检查 CAP_EFFECTIVE_BUDGET）'
    : `健康  ${paint(pressureTone(band), `${pressure.healthScore ?? '—'} / 100 · ${bandPhrase(band)}`)} · 常驻占用了有效预算的 ${pressure.percent ?? 0}%`;
  const lines = [
    paint(1, `CAP Inspect · ${stamp(report.generatedAt)}`),
    `范围  ${agents} · 只读本地配置，未连接 MCP`,
    rule,
    `${s.mcpServers} 个 MCP · ${s.skills} 个 Skill · ${s.directTools} 个暴露工具${estimateNote} · 常驻 ${compactTokens(s.contextTokens)} tok`,
    healthLine,
    `占用  常驻 ${compactTokens(s.contextTokens)} tok / 有效预算 ${compactTokens(budget.effectiveBudget)}（厂商标称 ${compactTokens(budget.nominalWindow)}）`,
    `状态  ${s.warnings ?? 0} 个警告 · ${s.duplicateGroups} 组重复 · 已迁入 CAP 的 MCP ${s.managed ?? 0} 个 · Registry 已 add ${s.registryCapabilities ?? 0} 个能力`
  ];

  const warnings = report.items.filter((item) => item.kind === 'warning');
  if (warnings.length) {
    lines.push(rule, '部分扫描失败（其余来源已完整报告，不是整体失败）');
    for (const item of warnings) lines.push(`  ● ${rel(item.source)}  ${item.message}`);
  }

  if (report.duplicates.length) {
    lines.push(rule, '重复项');
    for (const group of report.duplicates) lines.push(`  ● ${group.name}  ${group.sources.map(rel).join(' + ')}`);
  }

  const inventory = report.items.filter((item) => item.kind !== 'warning');
  const order = ['Claude Code', 'Codex', 'Project', 'Shared'];
  const agentsPresent = [...new Set(inventory.map((item) => item.agent))];
  agentsPresent.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  if (inventory.length) {
    lines.push(rule, '清单');
    for (const agent of agentsPresent) {
      const rows = inventory.filter((item) => item.agent === agent);
      lines.push(`  ${agent}`);
      for (const item of rows) {
        const kind = item.kind === 'skill' ? 'Skill' : 'MCP';
        const tools = item.kind === 'skill' ? '' : ` · ${item.toolCountEstimated ? '约 ' : ''}${item.toolCount} 个工具`;
        lines.push(`  ${kindMark(item)} ${item.name}`);
        lines.push(`      ${kind}${tools} · 常驻 ${compactTokens(item.contextTokens)} tok · ${roleLabel(item)}`);
        if (item.cost?.instructionOnDemand && item.cost.instructionTokens) {
          lines.push(`      正文约 ${item.cost.instructionTokens} tok，用到这个 Skill 时才加载`);
        }
        lines.push(`      ${rel(item.source)}`);
      }
    }
  }

  const profiler = report.profiler;
  if (profiler && profiler.tracked > 0) {
    lines.push(rule, '价值分析');
    lines.push(`  Registry 跟踪 ${profiler.tracked} 个能力 · 用过 ${profiler.used} 个 · 未使用 ${profiler.unusedManaged} 个 · ${profiler.useAttempts} 次 use`);
    const observation = profiler.observation ?? {};
    if (profiler.frequencyVerdicts) {
      lines.push(`  频率结论：已就绪（${observation.elapsedDays} / ${observation.periodDays} 天 · ${observation.evidenceSessionDays} 个活动日）`);
    } else {
      lines.push('  频率结论：未就绪（搜索/选择已记录，Observation Period 未完成）');
      if (observation.startedAt) {
        lines.push(`  观察进度：已过 ${observation.elapsedDays} / ${observation.periodDays} 天 · 活动日 ${observation.evidenceSessionDays} / ${observation.evidenceSessionDaysRequired}`);
      }
    }
    if (profiler.ranked.length) {
      lines.push('  性价比排行（value / context_cost）：');
      profiler.ranked.slice(0, 5).forEach((item, index) => {
        lines.push(`  ${index + 1}. ${item.capability_id}  value ${item.value} · vpc ${item.valuePerCost} · ${item.successes} uses / ${item.sessions} sessions · ~${item.contextCost} tok`);
      });
    }
    if (profiler.frequencyVerdicts && profiler.advice?.length) {
      lines.push('  频率 / 价值建议（信号分列，不是移除建议）：');
      profiler.advice.slice(0, 5).forEach((item) => {
        const {cost, duplication, usage, recency} = item.signals;
        const frequency = item.frequency === 'low' ? '低频' : '已观察';
        const recencyText = recency.neverUsed ? '从未成功 use' : `${recency.daysSinceLastUse} 天前`;
        lines.push(`  ● ${item.capability_id}  ${frequency} · 建议勿常驻注入`);
        lines.push(`      成本 ~${cost.contextCost} tok（估算）`);
        lines.push(`      重复 ${duplication.duplicate ? duplication.name : '无'}`);
        lines.push(`      用量 ${usage.successes} 成功 / ${usage.attempts} 尝试 / ${usage.sessions} 会话`);
        lines.push(`      近况 ${recencyText}`);
      });
    } else if (profiler.underused.length) {
      lines.push('  价值信号（Observation Period 未完成，不是移除建议）：');
      profiler.underused.slice(0, 5).forEach((item) => {
        const signal = item.successes ? `value ${item.value} · vpc ${item.valuePerCost}` : '未使用';
        lines.push(`  ● ${item.capability_id}  ${signal} · ~${item.contextCost} tok`);
      });
    }
  }

  lines.push(rule, '建议');
  if (report.recommendations.length) {
    lines.push('  这些 MCP 现在是 Direct Exposure。迁到 CAP 后可少占上下文：');
    report.recommendations.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item.provider}  约可回收 ${compactTokens(item.estimatedTokensSaved)}`);
      lines.push(`     ${rel(item.source)}`);
    });
  } else if (capSurface) {
    lines.push('  没有需要迁走的第三方 MCP。');
    lines.push('  还没有托管能力的话：cap search <任务>，再 cap use（会自动登记）。');
  } else {
    lines.push('  还没有 CAP 入口。先 cap add，或 cap optimize 预览迁移。');
  }

  if (!inventory.length && !warnings.length) lines.push(rule, '  未发现本地 MCP / Skills 配置。');
  lines.push(rule, paint(2, `下一步  cap inject <任务>  ·  cap search <任务>  ·  cap optimize（仅预览）  ·  可视化报告 cap web → ${DEFAULT_WEB_URL}（未启动也不阻塞）`));
  return lines.join('\n');
}

export function setupText(result, options = {}) {
  const home = options.userHome ?? os.homedir();
  const cwd = options.projectRoot ?? process.cwd();
  const rel = (file) => shortPath(file, home, cwd);
  const lines = [
    paint(1, 'CAP Setup'),
    `Agent  ${result.agent} → ${result.targets.join(', ')}`
  ];
  if (result.cli?.installed) {
    lines.push(`命令  ${result.cli.paths.map(rel).join(' · ')}`);
    if (result.cli.pathCommand) {
      lines.push('当前终端还需要执行：');
      lines.push(`  ${result.cli.pathCommand}`);
    } else {
      lines.push('可用  cap inspect · cap search <任务>');
    }
  }
  for (const file of result.cli?.conflicts ?? []) lines.push(`跳过  ${rel(file)}  已存在且不是 CAP launcher`);
  for (const item of result.writes) {
    const backup = item.backup ? `  备份 ${rel(item.backup)}` : '';
    lines.push(`写入  ${rel(item.path)}${backup}`);
  }
  for (const item of result.skipped) lines.push(`跳过  ${rel(item.path)}  ${item.reason}`);
  for (const item of result.manual) {
    lines.push(`无法安全写入 ${rel(item.path)}${item.reason ? `（${item.reason}）` : ''}，请手动添加：`);
    lines.push(item.snippet.trimEnd());
  }
  if (result.skills?.registered?.length) {
    lines.push(`已索引 ${result.skills.registered.length} 个本地 Skill，可供 cap search / add / use`);
  }
  if (result.inspection) {
    lines.push('', inspectText(result.inspection, options));
  }
  return lines.join('\n');
}

function searchText(results) {
  if (!results.length) return 'No matching capability found.';
  return results.map((item, index) => {
    const required = item.input_schema?.required?.join(', ');
    const schemaLine = item.schema_source
      ? `\n   cap.use input_schema: ${item.schema_source}${required ? ` · required ${required}` : ''}`
      : '';
    const skillLine = item.skill_path ? `\n   Skill: ${item.skill_path}` : '';
    const mark = item.installed ? '[CAP Managed]' : item.origin === 'local-skill' ? '[Local skill]' : '[Available]';
    return `${index + 1}. ${item.name}  ${mark}\n   ${item.capability_id}\n   ${item.summary}\n   Providers: ${item.providers.map((p) => `${p.name} (${p.status})`).join(', ')}\n   Context: ~${item.context_cost} tokens · Risk: ${item.risk}${skillLine}${schemaLine}`;
  }).join('\n\n');
}

export function injectText(plan) {
  const cmp = plan.comparison ?? {};
  const rule = '─'.repeat(56);
  const lines = [
    paint(1, 'CAP Inject · 按任务装载'),
    `任务  ${plan.task}`,
    `装载  ${cmp.loadCount ?? 0} / ${cmp.catalogCount ?? 0} 个能力 · ${compactTokens(cmp.loadTokens)} tok（全量 catalog ${compactTokens(cmp.catalogTokens)}）`,
    `推迟  ${cmp.deferCount ?? 0} 个 · 相对全量 catalog 少占 ${compactTokens(cmp.savedVsCatalog)} tok`,
    `入口  ${(plan.keepResident?.tools ?? []).join(' / ') || 'cap.search / cap.add / cap.use'} 保持常驻`,
    paint(2, '只出计划，不改 Agent 配置，也不连接第三方 MCP')
  ];
  if (cmp.residentTokens > cmp.afterTokens) {
    lines.push(`对照  当前常驻 ${compactTokens(cmp.residentTokens)} → CAP 入口 ${compactTokens(cmp.afterTokens)} · 可少占 ${compactTokens(cmp.savedVsResident)} tok`);
  }
  lines.push(rule, '装载');
  if (!plan.load?.length) {
    lines.push('  没有高相关能力。CAP 入口保持常驻，不要为这个任务注入 catalog 其余能力。');
  } else {
    plan.load.forEach((item, index) => {
      const mark = item.installed ? '[CAP Managed]' : '[Available]';
      lines.push(`  ${index + 1}. ${item.name}  ${mark}`);
      lines.push(`     ${item.capability_id}  ${compactTokens(item.context_cost)} tok`);
      if (item.next?.command) lines.push(`     下一步  ${item.next.command}`);
    });
  }
  if (plan.defer?.length) {
    lines.push(rule, '推迟（本任务不注入）');
    for (const item of plan.defer) {
      lines.push(`  · ${item.capability_id}  ${compactTokens(item.context_cost)} tok`);
    }
  }
  return lines.join('\n');
}

export async function main(args, options = {}) {
  const command = args[0] ?? 'help';
  const rest = args.slice(1);
  const json = rest.includes('--json');
  if (command === 'help' || command === '--help' || command === '-h') return print(help, false);
  if (command === 'setup') {
    const result = await setupCap({...options, agent: flag(rest, '--agent') ?? 'auto'});
    return print(json ? result : setupText(result, options), json);
  }
  if (command === 'inspect') {
    const report = await inspectLocal(options);
    return print(json ? report : inspectText(report, options), json);
  }
  if (command === 'search') {
    const query = positional(rest).join(' ');
    const results = await searchCapabilities(query, options);
    return print(json ? results : searchText(results), json);
  }
  if (command === 'inject') {
    const query = positional(rest).join(' ');
    const plan = await planInjection(query, options);
    return print(json ? plan : injectText(plan), json);
  }
  if (command === 'add') {
    const capabilityId = positional(rest)[0];
    if (!capabilityId) throw new Error('Capability id is required');
    const result = await addCapability(capabilityId, flag(rest, '--provider'), {...options, server: flag(rest, '--server')});
    const bind = result.binding?.bound
      ? `MCP binding: ${result.binding.server} → ${result.binding.command} ${(result.binding.args ?? []).join(' ')}`.trim()
      : result.binding && result.provider.type === 'MCP'
        ? ['MCP binding: not resolved (cap.use will return connection_required until a matching mcpServers entry exists)', ...(result.next_steps ?? [])].join('\n  ')
        : null;
    return print(json ? result : [`Added ${result.capability.name} via ${result.provider.name}`, `Registry: ${result.statePath}`, bind].filter(Boolean).join('\n'), json);
  }
  if (command === 'use') {
    const capabilityId = positional(rest)[0];
    if (!capabilityId) throw new Error('Capability id is required');
    const input = JSON.parse(flag(rest, '--input') ?? '{}');
    const result = await useCapability(capabilityId, input, options);
    return print(json ? result : (result.stdout || [result.message, ...(result.next_steps ?? [])].filter(Boolean).join('\n') || JSON.stringify(result, null, 2)), json);
  }
  if (command === 'optimize') {
    if (rest.includes('--apply') && !rest.includes('--yes')) throw new Error('Refusing to edit Agent configs without both --apply and --yes');
    const result = rest.includes('--apply') ? await applyOptimization(options) : await buildOptimizationPlan(options);
    const output = flag(rest, '--write-plan');
    if (output) await writeOptimizationPlan(output, options);
    const plan = result.plan ?? result;
    const skillCount = plan.skills?.discovered ?? result.skills?.registered?.length ?? 0;
    const skillLine = skillCount ? `\nLocal skills: ${skillCount} indexed for cap search / add / use` : '';
    const rollback = plan.rollback ? `\n${plan.rollback}` : '';
    return print(json ? result : `Before: ${plan.before.directTools} direct tools\nAfter: ${plan.after.directTools} CAP entry tools\nEstimated reduction: ${plan.reductionPercent}%${skillLine}${output ? `\nPlan: ${output}` : ''}${result.message ? `\n${result.message}` : '\nPreview only. Use --apply --yes to migrate supported JSON configs and index local skills.'}${rollback}`, json);
  }
  if (command === 'activity') {
    const state = await loadState(options);
    return print(json ? state.activity : (state.activity.map(activityLine).join('\n') || 'No activity yet.'), json);
  }
  if (command === 'web') {
    const {url} = await startWebServer({...options, port: flag(rest, '--port')});
    console.log(`CAP Web running at ${url}`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}
