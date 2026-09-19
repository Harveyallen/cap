/** Preview and guarded JSON + Codex TOML MCP consolidation into CAP Registry. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CODEX_TOML_GUIDANCE,
  classifyCodexToml,
  listCodexMcpServers,
  removeCodexMcpServers
} from './codex-toml.js';
import { inspectLocal } from './inspector.js';
import { isCapMcpConfig } from './mcp-tools.js';
import { loadCatalog, loadState, registerLocalSkills, saveState } from './registry.js';
import { discoverLocalSkills, overlayLocalSkills } from './skills.js';

const ROLLBACK = 'Each changed JSON or Codex TOML file is copied to <source>.<ISO-stamp>.cap-backup before modification. Recover by copying that backup over the live file (docs/restore-from-backup.md). This is not one-click Restore.';

export const OPTIMIZE_ADAPTERS = {
  apply: [
    {id: 'json-mcp', keys: ['mcpServers', 'mcp_servers'], note: 'Claude Code, Cursor, and project JSON MCP.'},
    {id: 'codex-toml', form: '[mcp_servers.name]', note: 'Dotted-table Codex config.toml only. Nested [mcp_servers.name.env] is removed with its parent.'}
  ],
  inspectOnly: [
    {id: 'json-mcp.servers', reason: 'JSON mcp.servers is read by inspect and refused for mutate.'},
    {id: 'codex-toml-inline', reason: 'mcp_servers = { ... } inline tables are refused.'},
    {id: 'codex-toml-table-form', reason: '[mcp_servers] table form is refused.'},
    {id: 'codex-toml-mcp.servers', reason: '[mcp.servers.*] is refused.'}
  ]
};

function skillPlan(overlay) {
  return {
    discovered: overlay.local.length,
    register: overlay.local.map((capability) => ({
      capability_id: capability.capability_id,
      name: capability.name,
      source: capability.skill_path
    })),
    note: 'Local SKILL.md files are indexed into the CAP catalog overlay. Search/add/use see summaries and paths only; skill bodies stay on disk.'
  };
}

async function readText(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function classifyJson(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return {adapter: 'json-mcp', apply: false, reason: 'unreadable-json', guidance: CODEX_TOML_GUIDANCE['unreadable-json']};
  }
  if (value.mcpServers || value.mcp_servers) return {adapter: 'json-mcp', apply: true};
  if (value.mcp?.servers) {
    return {adapter: 'json-mcp.servers', apply: false, reason: 'mcp.servers', guidance: CODEX_TOML_GUIDANCE['mcp.servers']};
  }
  return {adapter: 'json-mcp', apply: false, reason: 'no-mcp-key', guidance: CODEX_TOML_GUIDANCE['no-mcp-key']};
}

function classifySource(source, text) {
  if (text == null) return {adapter: 'missing', apply: false, reason: 'missing', guidance: 'Source file was not found.'};
  if (source.endsWith('.toml')) return classifyCodexToml(text);
  if (source.endsWith('.json')) return classifyJson(text);
  return {adapter: 'unknown', apply: false, reason: 'unsupported-format', guidance: 'CAP only mutates JSON mcpServers / mcp_servers and dotted-table Codex TOML.'};
}

async function decoratePlan(inspection, options) {
  const cache = new Map();
  async function infoFor(source) {
    if (cache.has(source)) return cache.get(source);
    const info = classifySource(source, await readText(source));
    cache.set(source, info);
    return info;
  }
  const migrations = [];
  for (const item of inspection.recommendations) {
    const info = await infoFor(item.source);
    migrations.push({...item, ...info});
  }
  const refused = [];
  const seen = new Set(migrations.map((item) => item.source));
  const codexFile = options.codexConfig ?? path.join(options.userHome ?? os.homedir(), '.codex', 'config.toml');
  if (!seen.has(codexFile)) {
    const text = await readText(codexFile);
    if (text != null && /mcp_servers|mcp\.servers/i.test(text)) {
      const info = classifyCodexToml(text);
      if (!info.apply) {
        refused.push({source: codexFile, provider: null, action: 'Refuse', ...info});
      }
    }
  }
  for (const item of migrations) {
    if (!item.apply) refused.push({source: item.source, provider: item.provider, action: 'Refuse', adapter: item.adapter, reason: item.reason, guidance: item.guidance});
  }
  return {migrations, refused};
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function backupAndReplace(source, nextText, stamp, validate) {
  const backup = `${source}.${stamp}.cap-backup`;
  await fs.copyFile(source, backup);
  const temp = `${source}.cap-tmp`;
  await fs.writeFile(temp, nextText);
  try {
    validate(await fs.readFile(temp, 'utf8'));
    await fs.rename(temp, source);
    validate(await fs.readFile(source, 'utf8'));
  } catch (error) {
    try { await fs.copyFile(backup, source); } catch { /* keep trying to remove temp */ }
    try { await fs.rm(temp, {force: true}); } catch { /* already renamed or gone */ }
    throw error;
  }
  return backup;
}

function assertJsonMigrated(text, key, migrated, kept) {
  const config = JSON.parse(text);
  const servers = config[key] && typeof config[key] === 'object' ? config[key] : {};
  for (const name of migrated) {
    if (Object.hasOwn(servers, name)) throw new Error(`JSON still contains migrated server ${name}`);
  }
  for (const name of kept) {
    if (!Object.hasOwn(servers, name)) throw new Error(`JSON lost retained server ${name}`);
  }
}

function assertTomlMigrated(text, migrated, kept) {
  const info = classifyCodexToml(text);
  if (!info.apply) throw new Error(`Codex TOML invalid after write: ${info.reason}`);
  const names = new Set(listCodexMcpServers(text).map((server) => server.name));
  for (const name of migrated) {
    if (names.has(name)) throw new Error(`Codex TOML still contains migrated server ${name}`);
  }
  for (const name of kept) {
    if (!names.has(name)) throw new Error(`Codex TOML lost retained server ${name}`);
  }
}

function recordProviders(state, source, entries) {
  const migratedAt = new Date().toISOString();
  for (const entry of entries) {
    const config = {...entry.config};
    delete config.inlineEnv;
    state.external_providers.push({name: entry.name, type: 'MCP', originalSource: source, config, migratedAt});
  }
}

async function applyJsonSource(source, state, stamp) {
  const original = await readText(source);
  const classified = classifyJson(original ?? '');
  if (!classified.apply) return {refused: {source, ...classified}};
  const config = JSON.parse(original);
  const key = config.mcpServers ? 'mcpServers' : 'mcp_servers';
  const servers = config[key] && typeof config[key] === 'object' ? config[key] : {};
  const remaining = {};
  const migrated = [];
  for (const [name, providerConfig] of Object.entries(servers)) {
    if (isCapMcpConfig(providerConfig)) {
      remaining[name] = providerConfig;
      continue;
    }
    migrated.push({name, config: providerConfig});
  }
  if (!migrated.length) return {};
  const names = migrated.map((item) => item.name);
  const kept = Object.keys(remaining);
  const backup = await backupAndReplace(source, `${JSON.stringify({...config, [key]: remaining}, null, 2)}\n`, stamp, (text) => {
    assertJsonMigrated(text, key, names, kept);
  });
  recordProviders(state, source, migrated);
  return {changed: {source, backup, adapter: 'json-mcp', providers: names, validated: true}};
}

async function applyTomlSource(source, state, stamp) {
  const original = await readText(source);
  const classified = classifyCodexToml(original ?? '');
  if (!classified.apply) return {refused: {source, ...classified}};
  const servers = listCodexMcpServers(original);
  const remaining = [];
  const migrated = [];
  for (const server of servers) {
    if (isCapMcpConfig(server.config, server.block)) {
      remaining.push(server.name);
      continue;
    }
    migrated.push(server);
  }
  if (!migrated.length) return {};
  const names = migrated.map((item) => item.name);
  const next = removeCodexMcpServers(original, names);
  const backup = await backupAndReplace(source, next, stamp, (text) => {
    assertTomlMigrated(text, names, remaining);
  });
  recordProviders(state, source, migrated);
  return {changed: {source, backup, adapter: 'codex-toml', providers: names, validated: true}};
}

export async function buildOptimizationPlan(options = {}) {
  const [inspection, catalog, skills] = await Promise.all([
    inspectLocal(options),
    loadCatalog(),
    discoverLocalSkills(options)
  ]);
  const {migrations, refused} = await decoratePlan(inspection, options);
  return {
    createdAt: new Date().toISOString(),
    adapters: OPTIMIZE_ADAPTERS,
    before: {directTools: inspection.summary.directTools, contextTokens: inspection.summary.contextTokens},
    after: {directTools: inspection.summary.directTools ? inspection.summary.capEntryTools : 0, contextTokens: inspection.summary.directTools ? 180 : 0},
    reductionPercent: inspection.summary.estimatedReductionPercent,
    migrations,
    refused,
    retained: inspection.items.filter((item) => item.capSurface).map((item) => ({name: item.name, source: item.source})),
    reload: 'Restart the Agent to reload its configuration.',
    skills: skillPlan(overlayLocalSkills(catalog, skills)),
    rollback: ROLLBACK
  };
}

function applyMessage({changed, refused, skillMsg}) {
  if (changed.length) {
    const refuseNote = refused.length ? ` ${refused.length} unsupported source(s) were left unchanged.` : '';
    return `Migration applied. Restart the Agent to reload its configuration.${refuseNote}${skillMsg}`;
  }
  if (refused.length) return `No supported config was mutated. Unsupported formats were refused.${skillMsg}`;
  if (skillMsg) return skillMsg.trim();
  return 'No supported JSON or Codex TOML MCP configuration was found.';
}

export async function applyOptimization(options = {}) {
  const plan = await buildOptimizationPlan(options);
  const state = await loadState(options);
  const skills = await registerLocalSkills(options, state);
  const skillMsg = skills.registered.length
    ? ` Indexed ${skills.registered.length} local skill(s) for cap search / add / use.`
    : '';
  const applySources = [...new Set(plan.migrations.filter((item) => item.apply).map((item) => item.source))];
  const refused = [...plan.refused];
  const changed = [];
  const stamp = stampNow();
  for (const source of applySources) {
    try {
      const result = source.endsWith('.toml')
        ? await applyTomlSource(source, state, stamp)
        : await applyJsonSource(source, state, stamp);
      if (result.refused) refused.push(result.refused);
      else if (result.changed) changed.push(result.changed);
    } catch (error) {
      refused.push({
        source,
        adapter: source.endsWith('.toml') ? 'codex-toml' : 'json-mcp',
        apply: false,
        reason: 'validate-failed',
        guidance: error.message,
        restored: true
      });
    }
  }
  state.external_providers = [...new Map(state.external_providers.map((item) => [`${item.originalSource}:${item.name}`, item])).values()];
  await saveState(state, options);
  return {
    plan,
    changed,
    refused,
    skills,
    message: applyMessage({changed, refused, skillMsg})
  };
}

export async function writeOptimizationPlan(file, options = {}) {
  const plan = await buildOptimizationPlan(options);
  await fs.mkdir(path.dirname(path.resolve(file)), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(plan, null, 2)}\n`);
  return path.resolve(file);
}
