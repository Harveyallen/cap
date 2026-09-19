/** Pin (Direct Exposure) and exclude-from-recommendation preferences. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultMcpJsonConfigs, namesMatch } from './mcp-bind.js';
import { isCapMcpConfig } from './mcp-tools.js';
import { loadEffectiveCatalog, loadState, saveState } from './registry.js';

function now() {
  return new Date().toISOString();
}

function stamp() {
  return now().replace(/[:.]/g, '-');
}

export function normalizePreference(entry) {
  if (typeof entry === 'string') return {name: entry};
  return entry && typeof entry === 'object' ? entry : {};
}

export function preferenceKeys(entries = []) {
  const keys = new Set();
  for (const entry of entries) {
    const rec = normalizePreference(entry);
    for (const value of [rec.name, rec.provider_id, rec.server]) {
      if (value) keys.add(String(value).trim().toLowerCase());
    }
  }
  return keys;
}

export function matchesPreference(entries, ...values) {
  const keys = preferenceKeys(entries);
  for (const value of values) {
    if (value == null || value === '') continue;
    const key = String(value).trim().toLowerCase();
    if (keys.has(key)) return true;
    for (const alias of keys) {
      if (namesMatch(alias, value)) return true;
    }
  }
  return false;
}

function ensureLists(state) {
  state.pinned_providers ??= [];
  state.excluded_providers ??= [];
  state.external_providers ??= [];
  state.managed_providers ??= [];
  state.managed_capabilities ??= [];
  state.mcp_bindings ??= {};
  state.activity ??= [];
}

function recordActivity(state, action, ref) {
  state.activity.unshift({
    at: now(),
    action,
    success: true,
    name: ref.name,
    provider_id: ref.provider_id
  });
  state.activity = state.activity.slice(0, 100);
}

function upsertPreference(list, rec) {
  const next = list.filter((entry) => !matchesPreference([entry], rec.name, rec.provider_id, rec.server));
  next.push(rec);
  return next;
}

function removePreference(list, ref) {
  return list.filter((entry) => !matchesPreference([entry], ref.name, ref.provider_id, ref.server, ref.needle));
}

async function resolveRef(needle, options, state) {
  const catalog = await loadEffectiveCatalog(options);
  const raw = String(needle ?? '').trim();
  if (!raw) throw new Error('Provider name, provider_id, or capability_id is required');

  const capability = catalog.capabilities.find((item) => item.capability_id === raw);
  const preferredId = options.providerId ?? capability?.provider_refs?.[0];
  const fromCapability = preferredId
    ? catalog.providers.find((item) => item.provider_id === preferredId)
    : null;
  const provider = fromCapability
    ?? catalog.providers.find((item) => item.provider_id === raw || namesMatch(item.name, raw) || namesMatch(item.mcp_server, raw));
  const migrated = (state.external_providers ?? []).find((item) => namesMatch(item.name, raw) || namesMatch(item.name, provider?.mcp_server));
  const name = migrated?.name ?? provider?.mcp_server ?? raw;
  const kind = provider?.type === 'Skill' ? 'skill' : provider?.type === 'CLI' ? 'cli' : 'mcp';
  return {needle: raw, name, provider_id: provider?.provider_id, provider, capability, kind};
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function jsonKey(config) {
  if (config?.mcp_servers && !config.mcpServers) return 'mcp_servers';
  return 'mcpServers';
}

async function backupIfExists(file) {
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  const backup = `${file}.${stamp()}.cap-backup`;
  await fs.copyFile(file, backup);
  return backup;
}

async function writeAtomic(file, text) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.cap-tmp`;
  await fs.writeFile(temp, text);
  await fs.rename(temp, file);
}

function jsonTargets(options) {
  const userHome = options.userHome ?? os.homedir();
  const project = path.resolve(options.projectRoot ?? process.cwd());
  return options.jsonConfigs ?? defaultMcpJsonConfigs(userHome, project);
}

async function findJsonServer(files, name) {
  for (const [file, agent] of files) {
    const value = await readJson(file);
    if (!value) continue;
    const key = value.mcpServers ? 'mcpServers' : value.mcp_servers ? 'mcp_servers' : null;
    if (!key) continue;
    for (const [entryName, config] of Object.entries(value[key])) {
      if (namesMatch(entryName, name)) return {file, agent, key, name: entryName, config};
    }
  }
  return null;
}

async function findTomlServer(file, name) {
  if (!file) return null;
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const headers = [...text.matchAll(/^\[mcp_servers\.(["']?)([^\]"']+)\1\]\s*$/gm)];
  for (const match of headers) {
    if (namesMatch(match[2], name)) return {file, agent: 'Codex', name: match[2], toml: true};
  }
  return null;
}

async function upsertServer(file, name, config) {
  const existing = await readJson(file) ?? {};
  const key = jsonKey(existing);
  existing[key] ??= {};
  const backup = await backupIfExists(file);
  existing[key][name] = config;
  await writeAtomic(file, `${JSON.stringify(existing, null, 2)}\n`);
  return {file, backup, name};
}

async function removeServer(file, name) {
  const existing = await readJson(file);
  if (!existing) return null;
  const key = existing.mcpServers ? 'mcpServers' : existing.mcp_servers ? 'mcp_servers' : null;
  if (!key || !existing[key]) return null;
  const match = Object.keys(existing[key]).find((entry) => namesMatch(entry, name));
  if (!match) return null;
  const config = existing[key][match];
  if (isCapMcpConfig(config)) throw new Error('Cannot unpin the CAP surface');
  const backup = await backupIfExists(file);
  delete existing[key][match];
  await writeAtomic(file, `${JSON.stringify(existing, null, 2)}\n`);
  return {file, backup, name: match, config};
}

function launchFromBinding(binding) {
  if (!binding?.command) return null;
  const config = {command: binding.command, args: binding.args ?? []};
  if (binding.env) config.env = binding.env;
  if (binding.cwd) config.cwd = binding.cwd;
  return config;
}

async function pickWriteTarget(targets, migrated) {
  if (migrated?.originalSource && String(migrated.originalSource).endsWith('.json')) return migrated.originalSource;
  for (const [file] of targets) {
    if (await readJson(file)) return file;
  }
  return targets[0]?.[0];
}

function rememberProvider(state, ref) {
  if (ref.provider_id && !state.managed_providers.includes(ref.provider_id)) {
    state.managed_providers.push(ref.provider_id);
  }
  if (ref.capability && !state.managed_capabilities.includes(ref.capability.capability_id)) {
    state.managed_capabilities.push(ref.capability.capability_id);
  }
}

export async function pinProvider(needle, options = {}) {
  const state = await loadState(options);
  ensureLists(state);
  const ref = await resolveRef(needle, options, state);
  if (ref.kind === 'cli' && !ref.provider?.mcp_server) {
    throw new Error(`CLI provider ${ref.provider_id} has no Agent Direct Exposure surface; it stays CAP-managed via cap.use`);
  }

  const targets = jsonTargets(options);
  const located = await findJsonServer(targets, ref.name);
  if (located && isCapMcpConfig(located.config)) throw new Error('Cannot pin the CAP surface');
  const toml = located ? null : await findTomlServer(options.codexConfig ?? path.join(options.userHome ?? os.homedir(), '.codex', 'config.toml'), ref.name);
  const migrated = state.external_providers.find((item) => namesMatch(item.name, ref.name));
  const binding = ref.provider_id ? state.mcp_bindings[ref.provider_id] : null;
  const launch = located?.config ?? migrated?.config ?? launchFromBinding(binding);
  const writes = [];

  if (located) {
    ref.name = located.name;
    ref.source = located.file;
  } else if (toml) {
    ref.name = toml.name;
    ref.source = toml.file;
  } else if (ref.kind === 'skill') {
    ref.source = ref.capability?.skill_path;
  } else if (launch) {
    const dest = await pickWriteTarget(targets, migrated);
    if (!dest) throw new Error(`No Agent JSON MCP config to write Direct Exposure for ${ref.name}`);
    const written = await upsertServer(dest, migrated?.name ?? ref.name, launch);
    writes.push(written);
    ref.name = written.name;
    ref.source = written.file;
  } else {
    throw new Error(`No launch config to write as Direct Exposure for ${ref.name}. Add a local mcpServers entry or cap add --server first.`);
  }

  rememberProvider(state, ref);
  const rec = {
    name: ref.name,
    ...(ref.provider_id ? {provider_id: ref.provider_id} : {}),
    kind: ref.kind,
    ...(ref.source ? {source: ref.source} : {}),
    pinnedAt: now()
  };
  state.pinned_providers = upsertPreference(state.pinned_providers, rec);
  recordActivity(state, 'pin', rec);
  const statePath = await saveState(state, options);
  return {
    action: 'pin',
    exposure: 'direct',
    provider: rec,
    writes,
    statePath,
    message: `${rec.name} is pinned as Direct Exposure. Optimize will not migrate it.`
  };
}

export async function unpinProvider(needle, options = {}) {
  const state = await loadState(options);
  ensureLists(state);
  const ref = await resolveRef(needle, options, state);
  if (!matchesPreference(state.pinned_providers, ref.name, ref.provider_id, ref.needle)) {
    throw new Error(`Provider is not pinned: ${needle}`);
  }

  const targets = jsonTargets(options);
  const located = await findJsonServer(targets, ref.name);
  const toml = located ? null : await findTomlServer(options.codexConfig ?? path.join(options.userHome ?? os.homedir(), '.codex', 'config.toml'), ref.name);
  const writes = [];
  let exposure = 'managed';
  let note = `${ref.name} is CAP-managed and no longer Direct Exposure.`;

  if (located) {
    const removed = await removeServer(located.file, located.name);
    if (removed) {
      writes.push(removed);
      rememberProvider(state, ref);
      const already = state.external_providers.some((item) => item.name === removed.name && item.originalSource === removed.file);
      if (!already) {
        state.external_providers.push({
          name: removed.name,
          type: 'MCP',
          originalSource: removed.file,
          config: removed.config,
          migratedAt: now()
        });
      }
    }
  } else if (ref.kind === 'skill') {
    exposure = 'direct';
    note = `${ref.name} pin removed. Skill identity remains resident.`;
  } else if (toml) {
    exposure = 'direct';
    note = `${ref.name} pin removed. Codex TOML Direct Exposure is inspect-only and was not rewritten.`;
  }

  state.pinned_providers = removePreference(state.pinned_providers, ref);
  recordActivity(state, 'unpin', {name: ref.name, provider_id: ref.provider_id});
  const statePath = await saveState(state, options);
  return {
    action: 'unpin',
    exposure,
    provider: {name: ref.name, provider_id: ref.provider_id},
    writes,
    statePath,
    message: note
  };
}

export async function excludeProvider(needle, options = {}) {
  const state = await loadState(options);
  ensureLists(state);
  const ref = await resolveRef(needle, options, state);
  const rec = {
    name: ref.name,
    ...(ref.provider_id ? {provider_id: ref.provider_id} : {}),
    excludedAt: now()
  };
  state.excluded_providers = upsertPreference(state.excluded_providers, rec);
  recordActivity(state, 'exclude', rec);
  const statePath = await saveState(state, options);
  return {
    action: 'exclude',
    provider: rec,
    statePath,
    message: `${rec.name} is excluded from optimize recommendations. It is not uninstalled.`
  };
}

export async function includeProvider(needle, options = {}) {
  const state = await loadState(options);
  ensureLists(state);
  const ref = await resolveRef(needle, options, state);
  if (!matchesPreference(state.excluded_providers, ref.name, ref.provider_id, ref.needle)) {
    throw new Error(`Provider is not excluded: ${needle}`);
  }
  state.excluded_providers = removePreference(state.excluded_providers, ref);
  recordActivity(state, 'include', {name: ref.name, provider_id: ref.provider_id});
  const statePath = await saveState(state, options);
  return {
    action: 'include',
    provider: {name: ref.name, provider_id: ref.provider_id},
    statePath,
    message: `${ref.name} can appear in optimize recommendations again.`
  };
}
