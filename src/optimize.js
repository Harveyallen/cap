/** Preview and guarded JSON MCP consolidation into CAP Registry. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectLocal } from './inspector.js';
import { isCapMcpConfig } from './mcp-tools.js';
import { loadState, saveState } from './registry.js';

export async function buildOptimizationPlan(options = {}) {
  const inspection = await inspectLocal(options);
  return {
    createdAt: new Date().toISOString(),
    before: {directTools: inspection.summary.directTools, contextTokens: inspection.summary.contextTokens},
    after: {directTools: inspection.summary.directTools ? inspection.summary.capEntryTools : 0, contextTokens: inspection.summary.directTools ? 180 : 0},
    reductionPercent: inspection.summary.estimatedReductionPercent,
    migrations: inspection.recommendations,
    rollback: 'Every changed JSON config is copied to a timestamped .cap-backup file before modification.'
  };
}

export async function applyOptimization(options = {}) {
  const plan = await buildOptimizationPlan(options);
  const jsonSources = [...new Set(plan.migrations.map((item) => item.source).filter((file) => file.endsWith('.json')))];
  if (!jsonSources.length) return {plan, changed: [], message: 'No supported JSON MCP configuration was found.'};
  const state = await loadState(options);
  const changed = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const source of jsonSources) {
    const original = await fs.readFile(source, 'utf8');
    const config = JSON.parse(original);
    const key = config.mcpServers ? 'mcpServers' : config.mcp_servers ? 'mcp_servers' : null;
    if (!key) continue;
    const servers = config[key];
    const remaining = {};
    const migrated = [];
    for (const [name, providerConfig] of Object.entries(servers)) {
      if (isCapMcpConfig(providerConfig)) {
        remaining[name] = providerConfig;
        continue;
      }
      state.external_providers.push({name, type: 'MCP', originalSource: source, config: providerConfig, migratedAt: new Date().toISOString()});
      migrated.push(name);
    }
    if (!migrated.length) continue;
    const backup = `${source}.${stamp}.cap-backup`;
    await fs.copyFile(source, backup);
    config[key] = remaining;
    const temp = `${source}.cap-tmp`;
    await fs.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`);
    await fs.rename(temp, source);
    changed.push({source, backup, providers: migrated});
  }
  state.external_providers = [...new Map(state.external_providers.map((item) => [`${item.originalSource}:${item.name}`, item])).values()];
  await saveState(state, options);
  return {plan, changed, message: changed.length ? 'Migration applied. Restart the Agent to reload its configuration.' : 'Nothing changed.'};
}

export async function writeOptimizationPlan(file, options = {}) {
  const plan = await buildOptimizationPlan(options);
  await fs.mkdir(path.dirname(path.resolve(file)), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(plan, null, 2)}\n`);
  return path.resolve(file);
}
