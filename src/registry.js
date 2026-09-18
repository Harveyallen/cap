/** Catalog loading, CAP Registry persistence, and add. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCatalog } from './catalog-schema.js';
import { describeBinding, resolveMcpBinding, storeBinding } from './mcp-bind.js';
import { capHome, packageRoot } from './paths.js';

export async function loadCatalog() {
  const root = packageRoot();
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const schema = JSON.parse(await fs.readFile(path.join(root, 'data', 'catalog.schema.json'), 'utf8'));
  return validateCatalog(catalog, schema);
}

export async function loadState(options = {}) {
  const home = options.home ?? capHome(options.env);
  const statePath = path.join(home, 'registry.json');
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {version: 1, managed_capabilities: [], managed_providers: [], external_providers: [], mcp_bindings: {}, activity: []};
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

export async function addCapability(capabilityId, providerId, options = {}) {
  const catalog = await loadCatalog();
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
  if (provider.type === 'MCP') {
    const resolved = await resolveMcpBinding(provider, options, state);
    if (resolved) {
      state.mcp_bindings[selected] = storeBinding(resolved);
      binding = describeBinding(state.mcp_bindings[selected]);
    } else {
      delete state.mcp_bindings[selected];
      binding = describeBinding(null);
    }
  }
  state.activity.unshift({at: new Date().toISOString(), action: 'add', capability_id: capabilityId, provider_id: selected, success: true});
  state.activity = state.activity.slice(0, 100);
  const statePath = await saveState(state, options);
  return {capability, provider: {...provider, status: 'CAP Managed'}, statePath, binding};
}
