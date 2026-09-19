/** Catalog loading, CAP Registry persistence, and add. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCatalog } from './catalog-schema.js';
import { resolveInputSchema } from './input-schema.js';
import { describeBinding, listMcpLaunchCandidates, missingLaunchHint, resolveMcpBinding, storeBinding } from './mcp-bind.js';
import { capHome, packageRoot } from './paths.js';
import { discoverLocalSkills, overlayLocalSkills } from './skills.js';

const ACTIVITY_LIMIT = 100;
const QUERY_LIMIT = 200;

export async function loadCatalog() {
  const root = packageRoot();
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const schema = JSON.parse(await fs.readFile(path.join(root, 'data', 'catalog.schema.json'), 'utf8'));
  return validateCatalog(catalog, schema);
}

/** Seed catalog plus local SKILL.md overlay. Does not mutate data/catalog.json. */
export async function loadEffectiveCatalog(options = {}) {
  const [catalog, skills] = await Promise.all([loadCatalog(), discoverLocalSkills(options)]);
  const overlay = overlayLocalSkills(catalog, skills);
  return {capabilities: overlay.capabilities, providers: overlay.providers};
}

export async function registerLocalSkills(options = {}, existingState) {
  const [catalog, skills, state] = await Promise.all([
    loadCatalog(),
    discoverLocalSkills(options),
    existingState ? Promise.resolve(existingState) : loadState(options)
  ]);
  const overlay = overlayLocalSkills(catalog, skills);
  const now = new Date().toISOString();
  state.local_skills = overlay.local.map((capability) => ({
    capability_id: capability.capability_id,
    provider_id: capability.provider_refs[0],
    name: capability.name,
    source: capability.skill_path,
    registeredAt: now
  }));
  if (!existingState) await saveState(state, options);
  return {discovered: skills.length, registered: state.local_skills, catalog: overlay, state};
}

export async function loadState(options = {}) {
  const home = options.home ?? capHome(options.env);
  const statePath = path.join(home, 'registry.json');
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {version: 1, managed_capabilities: [], managed_providers: [], external_providers: [], mcp_bindings: {}, pinned_providers: [], excluded_providers: [], activity: []};
  }
}

export async function saveState(state, options = {}) {
  const home = options.home ?? capHome(options.env);
  await fs.mkdir(home, {recursive: true, mode: 0o700});
  const target = path.join(home, 'registry.json');
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, {mode: 0o600});
  await fs.rename(temp, target);
  return target;
}

/** Privacy-safe Capability Intent for local Activity. Never store secrets, paths, or raw config. */
export function sanitizeSearchQuery(query) {
  let text = String(query ?? '').replace(/\s+/g, ' ').trim();
  text = text.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[email]');
  text = text.replace(/\b(?:https?|wss|ftp):\/\/[^\s]+/gi, '[url]');
  text = text.replace(/(?:[A-Za-z]:\\|\/)[^\s]+/g, '[path]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]');
  text = text.replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]{8,}\b/g, '[secret]');
  text = text.replace(/\b[A-Fa-f0-9]{32,}\b/g, '[secret]');
  text = text.replace(/\b(?:password|token|secret|api[_-]?key|authorization|bearer)\s*[:=]\s*\S+/gi, '[redacted]');
  if (text.length > QUERY_LIMIT) text = text.slice(0, QUERY_LIMIT);
  return text;
}

export function pushActivity(state, row) {
  state.activity ??= [];
  const event = {at: new Date().toISOString(), ...row};
  state.activity.unshift(event);
  state.activity = state.activity.slice(0, ACTIVITY_LIMIT);
  if (!state.observation_started_at) {
    let oldest = event.at;
    for (const item of state.activity) {
      if (item?.at && Date.parse(item.at) < Date.parse(oldest)) oldest = item.at;
    }
    state.observation_started_at = oldest;
  }
  return state;
}

/** Record select when add/use chooses a hit from the most recent search. */
export function maybeRecordSelect(state, capabilityId) {
  if (!capabilityId) return false;
  const search = (state.activity ?? []).find((row) => row.action === 'search');
  if (!search || !(search.hits ?? []).includes(capabilityId)) return false;
  const dup = (state.activity ?? []).some((row) => (
    row.action === 'select' && row.capability_id === capabilityId && row.query === search.query
  ));
  if (dup) return false;
  pushActivity(state, {action: 'select', capability_id: capabilityId, query: search.query, success: true});
  return true;
}

export async function recordSearchActivity(query, hits, options = {}) {
  const ids = hits.map((item) => item.capability_id).filter(Boolean);
  const selectedId = ids.length === 1 ? ids[0] : undefined;
  const state = await loadState(options);
  pushActivity(state, {
    action: 'search',
    query: sanitizeSearchQuery(query),
    hit_count: ids.length,
    hits: ids,
    top_id: ids[0] ?? null,
    ...(selectedId ? {selected_id: selectedId, capability_id: selectedId} : {}),
    success: true
  });
  await saveState(state, options);
  return state;
}

export async function addCapability(capabilityId, providerId, options = {}) {
  const catalog = await loadEffectiveCatalog(options);
  const capability = catalog.capabilities.find((item) => item.capability_id === capabilityId);
  if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
  const selected = providerId ?? capability.provider_refs[0];
  const provider = catalog.providers.find((item) => item.provider_id === selected && item.capabilities.includes(capabilityId));
  if (!provider) throw new Error(`Provider ${selected} does not implement ${capabilityId}`);
  const state = await loadState(options);
  if (!state.managed_capabilities.includes(capabilityId)) state.managed_capabilities.push(capabilityId);
  if (!state.managed_providers.includes(selected)) state.managed_providers.push(selected);
  state.mcp_bindings ??= {};
  let binding = null;
  let launch = options.launch;
  let hint = null;
  if (provider.type === 'MCP') {
    const candidates = options.launchCandidates ?? await listMcpLaunchCandidates(options, state);
    const resolved = await resolveMcpBinding(provider, {...options, launchCandidates: candidates}, state);
    if (resolved) {
      state.mcp_bindings[selected] = storeBinding(resolved);
      binding = describeBinding(state.mcp_bindings[selected]);
      launch = state.mcp_bindings[selected];
    } else {
      delete state.mcp_bindings[selected];
      hint = missingLaunchHint(provider, {candidates});
      binding = {...describeBinding(null), reason: hint.reason, server: hint.server};
      launch = undefined;
    }
  }
  maybeRecordSelect(state, capabilityId);
  pushActivity(state, {action: 'add', capability_id: capabilityId, provider_id: selected, success: true});
  const statePath = await saveState(state, options);
  const schema = await resolveInputSchema(capability, {...options, provider, state, launch});
  return {
    capability: {...capability, ...schema},
    provider: {...provider, status: 'CAP Managed'},
    statePath,
    binding,
    input_schema: schema.input_schema,
    schema_source: schema.schema_source,
    ...(hint ? {next_steps: hint.next_steps, tried_aliases: hint.tried_aliases, found_servers: hint.found_servers} : {})
  };
}
