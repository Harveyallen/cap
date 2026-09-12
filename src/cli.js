/** CLI command routing and human/JSON formatting. */
import { inspectLocal } from './inspector.js';
import { searchCapabilities } from './search.js';
import { addCapability, loadState } from './registry.js';
import { useCapability } from './use.js';
import { applyOptimization, buildOptimizationPlan, writeOptimizationPlan } from './optimize.js';
import { startWebServer } from './web-server.js';

const help = `CAP 0.1 — discover more capabilities, expose fewer tools

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

function inspectText(report) {
  const s = report.summary;
  const agents = [...new Set(report.items.filter((item) => item.agent).map((item) => item.agent))].join(' / ') || 'No Agent configuration found';
  return `${agents}\n  MCP Servers       ${s.mcpServers}\n  Skills            ${s.skills}\n  Direct Tools      ${s.directTools}${report.items.some((x) => x.toolCountEstimated) ? ' (minimum estimate)' : ''}\n  Estimated Schema  ${s.contextTokens.toLocaleString()} tokens\n\nPotential consolidation\n  ${s.directTools} tools → ${s.directTools ? 3 : 0} CAP entry tools\n  Estimated reduction: ${s.estimatedReductionPercent}%\n  Migration candidates: ${report.recommendations.length}`;
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
    return print(json ? report : inspectText(report), json);
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
