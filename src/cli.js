/** CLI command routing and human/JSON formatting. */
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from './inspector.js';
import { searchCapabilities } from './search.js';
import { addCapability, loadState } from './registry.js';
import { useCapability } from './use.js';
import { applyOptimization, buildOptimizationPlan, writeOptimizationPlan } from './optimize.js';
import { startWebServer } from './web-server.js';

const help = `CAP 0.1 — Capability & Context Control Plane
用最小能力集，换最大有效上下文。

Usage:
  cap inspect [--json]
  cap search <task> [--json]
  cap add <capability-id> [--provider <provider-id>] [--json]
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

function reductionBar(percent, width = 22) {
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 100 * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function pressureTone(band) {
  if (band === 'healthy') return 32;
  if (band === 'moderate') return 33;
  if (band === 'high') return 33;
  return 31;
}

function statusLabel(item) {
  if (item.status === 'managed' || item.direct === false) return 'Managed';
  if (item.status === 'estimated' || item.toolCountEstimated) return '~est';
  return 'Direct';
}

function kindMark(item) {
  return item.kind === 'skill' ? '○' : '●';
}

export function inspectText(report, options = {}) {
  const s = report.summary;
  const pressure = report.pressure ?? {};
  const budget = report.budget ?? {};
  const funnel = report.funnel ?? {};
  const home = options.userHome ?? os.homedir();
  const cwd = options.projectRoot ?? process.cwd();
  const rel = (file) => shortPath(file, home, cwd);
  const agents = [...new Set(report.items.filter((item) => item.agent).map((item) => item.agent))].join(' / ') || 'No Agent configuration found';
  const estimateNote = report.items.some((item) => item.toolCountEstimated) ? ' (minimum estimate)' : '';
  const band = pressure.band ?? 'healthy';
  const used = funnel.usedUnknown || funnel.used == null ? 'used unknown' : `${funnel.used} used`;
  const rule = '─'.repeat(56);
  const lines = [
    paint(1, `CAP Inspect · ${stamp(report.generatedAt)}`),
    agents,
    rule,
    `${s.mcpServers} MCP · ${s.skills} Skills · ${s.directTools} tools${estimateNote} · ${compactTokens(s.contextTokens)} tokens`,
    `${reductionBar(s.estimatedReductionPercent)}  →  ${s.directTools ? s.capEntryTools : 0} CAP entry tools (−${s.estimatedReductionPercent}%)`,
    `Pressure  ${paint(pressureTone(band), band[0].toUpperCase() + band.slice(1))}  ${pressure.percent ?? 0}% · health ${pressure.healthScore ?? ''} · effective ${compactTokens(budget.effectiveBudget)} / nominal ${compactTokens(budget.nominalWindow)}`,
    `Funnel    ${funnel.installed ?? 0} installed → ${funnel.enabled ?? 0} enabled → ${funnel.injected ?? 0} injected → ${used}`,
    `${paint(33, '⚠')} ${s.warnings ?? 0} warnings · ${s.duplicateGroups} duplicates · ${paint(32, '✓')} ${s.managed ?? 0} managed`
  ];

  const warnings = report.items.filter((item) => item.kind === 'warning');
  if (warnings.length) {
    lines.push(rule, '警告');
    for (const item of warnings) lines.push(`  ● ${item.message}  ${rel(item.source)}`);
  }

  if (report.duplicates.length) {
    lines.push(rule, '重复项');
    for (const group of report.duplicates) lines.push(`  ● ${group.name}  ${group.sources.map(rel).join(' + ')}`);
  }

  if (report.recommendations.length) {
    lines.push(rule, '建议迁移（按省 token）');
    report.recommendations.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item.provider.padEnd(18)} ${compactTokens(item.estimatedTokensSaved).padStart(7)} tok  Move → CAP`);
      lines.push(`     ${rel(item.source)}`);
    });
  }

  const inventory = report.items.filter((item) => item.kind !== 'warning');
  const order = ['Claude Code', 'Codex', 'Shared'];
  const agentsPresent = [...new Set(inventory.map((item) => item.agent))];
  agentsPresent.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  for (const agent of agentsPresent) {
    const rows = inventory.filter((item) => item.agent === agent);
    lines.push(rule, `MCP / Skills（${agent}）`);
    for (const item of rows) {
      const tools = item.kind === 'skill' ? 'skill' : `~${item.toolCount} tools`;
      lines.push(`  ${kindMark(item)} ${item.name.padEnd(18)} ${tools.padEnd(12)} ${compactTokens(item.contextTokens).padStart(7)} tok  ${statusLabel(item).padEnd(8)}  ${rel(item.source)}`);
    }
  }

  if (!inventory.length && !warnings.length) lines.push(rule, '  未发现本地 MCP / Skills 配置。');
  lines.push(rule, paint(2, 'tip: cap optimize · 或 cap search 搜索任务'));
  return lines.join('\n');
}

function searchText(results) {
  if (!results.length) return 'No matching capability found.';
  return results.map((item, index) => `${index + 1}. ${item.name}  ${item.installed ? '[CAP Managed]' : '[Available]'}\n   ${item.capability_id}\n   ${item.summary}\n   Providers: ${item.providers.map((p) => `${p.name} (${p.status})`).join(', ')}\n   Context: ~${item.context_cost} tokens · Risk: ${item.risk}`).join('\n\n');
}

export async function main(args, options = {}) {
  const command = args[0] ?? 'help';
  const rest = args.slice(1);
  const json = rest.includes('--json');
  if (command === 'help' || command === '--help' || command === '-h') return print(help, false);
  if (command === 'inspect') {
    const report = await inspectLocal(options);
    return print(json ? report : inspectText(report, options), json);
  }
  if (command === 'search') {
    const query = positional(rest).join(' ');
    const results = await searchCapabilities(query, options);
    return print(json ? results : searchText(results), json);
  }
  if (command === 'add') {
    const capabilityId = positional(rest)[0];
    if (!capabilityId) throw new Error('Capability id is required');
    const result = await addCapability(capabilityId, flag(rest, '--provider'), options);
    return print(json ? result : `Added ${result.capability.name} via ${result.provider.name}\nRegistry: ${result.statePath}`, json);
  }
  if (command === 'use') {
    const capabilityId = positional(rest)[0];
    if (!capabilityId) throw new Error('Capability id is required');
    const input = JSON.parse(flag(rest, '--input') ?? '{}');
    const result = await useCapability(capabilityId, input, options);
    return print(json ? result : (result.stdout || result.message || JSON.stringify(result, null, 2)), json);
  }
  if (command === 'optimize') {
    if (rest.includes('--apply') && !rest.includes('--yes')) throw new Error('Refusing to edit Agent configs without both --apply and --yes');
    const result = rest.includes('--apply') ? await applyOptimization(options) : await buildOptimizationPlan(options);
    const output = flag(rest, '--write-plan');
    if (output) await writeOptimizationPlan(output, options);
    return print(json ? result : `Before: ${result.plan?.before?.directTools ?? result.before.directTools} direct tools\nAfter: ${result.plan?.after?.directTools ?? result.after.directTools} CAP entry tools\nEstimated reduction: ${result.plan?.reductionPercent ?? result.reductionPercent}%${output ? `\nPlan: ${output}` : ''}${result.message ? `\n${result.message}` : '\nPreview only. Use --apply --yes to migrate supported JSON configs.'}`, json);
  }
  if (command === 'activity') {
    const state = await loadState(options);
    return print(json ? state.activity : (state.activity.map((item) => `${item.at}  ${item.action}  ${item.capability_id}  ${item.success ? 'ok' : 'failed'}`).join('\n') || 'No activity yet.'), json);
  }
  if (command === 'web') {
    const {url} = await startWebServer({...options, port: flag(rest, '--port')});
    console.log(`CAP Web running at ${url}`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}
