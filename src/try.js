/** Temporary try mode: trial ManagedBinding + cleanup, local anonymous outcome. */
import { loadEffectiveCatalog, loadState, maybeRecordSelect, pushActivity, saveState } from './registry.js';
import { useCapability } from './use.js';

function ensureTrials(state) {
  state.trial_bindings ??= [];
  state.managed_capabilities ??= [];
  state.managed_providers ??= [];
  state.mcp_bindings ??= {};
  state.activity ??= [];
}

function findTrial(state, capabilityId) {
  return (state.trial_bindings ?? []).find((row) => row.capability_id === capabilityId);
}

/** Remote public-catalog Providers are Phase 3 ACQ-*. Seed / local / managed only. */
export function isRemoteProvider(provider = {}, options = {}) {
  if (options.remote === true) return true;
  const source = String(provider.source ?? '').toLowerCase();
  return Boolean(
    provider.remote ||
    provider.download_url ||
    provider.catalog_url ||
    source === 'public-catalog' ||
    source === 'remote-catalog'
  );
}

function outcomeRow(result, capabilityId, providerId) {
  return {
    action: 'try',
    capability_id: capabilityId,
    provider_id: providerId,
    success: result.status === 'completed',
    status: result.status,
    ...(result.reason ? {reason: result.reason} : {}),
    anonymous: true,
    local: true
  };
}

function retainedOutcomes(state, capabilityId) {
  return (state.activity ?? [])
    .filter((row) => (row.action === 'try' || row.action === 'use') && row.capability_id === capabilityId)
    .map((row) => ({
      at: row.at,
      action: row.action,
      success: row.success,
      status: row.status,
      anonymous: row.anonymous ?? true,
      local: true
    }));
}

export async function tryCapability(capabilityId, input = {}, options = {}) {
  const catalog = await loadEffectiveCatalog(options);
  const capability = catalog.capabilities.find((item) => item.capability_id === capabilityId);
  if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
  const selected = options.provider_id ?? options.provider ?? capability.provider_refs[0];
  const provider = catalog.providers.find((item) => item.provider_id === selected && item.capabilities.includes(capabilityId));
  if (!provider) throw new Error(`Provider ${selected} does not implement ${capabilityId}`);
  if (isRemoteProvider(provider, options)) {
    throw new Error('Remote catalog try is not available until Phase 3 (ACQ-*). Use a seed or local Provider.');
  }

  const before = await loadState(options);
  ensureTrials(before);
  const hadCapability = before.managed_capabilities.includes(capabilityId);
  const hadProvider = before.managed_providers.includes(selected);
  const hadBinding = Boolean(before.mcp_bindings?.[selected]);

  const result = await useCapability(capabilityId, input, {...options, provider_id: selected, provider: selected, trial: true});

  const state = await loadState(options);
  ensureTrials(state);
  const createdBinding = !hadBinding && Boolean(state.mcp_bindings?.[selected]);
  const existing = findTrial(state, capabilityId);
  if (existing) {
    if (!existing.created_binding && createdBinding) existing.created_binding = true;
  } else {
    state.trial_bindings.push({
      capability_id: capabilityId,
      provider_id: selected,
      startedAt: new Date().toISOString(),
      created_capability: !hadCapability,
      created_provider: !hadProvider,
      created_binding: createdBinding,
      promoted: false
    });
  }

  maybeRecordSelect(state, capabilityId);
  pushActivity(state, outcomeRow(result, capabilityId, selected));
  const statePath = await saveState(state, options);
  const persistent = hadCapability || Boolean(findTrial(state, capabilityId)?.promoted);
  return {
    action: 'try',
    trial: true,
    exposure: 'managed',
    persistent,
    capability_id: capabilityId,
    provider_id: selected,
    outcome: {
      status: result.status,
      success: result.status === 'completed',
      anonymous: true,
      local: true,
      telemetry: false
    },
    result,
    cleanup: {command: `cap cleanup ${capabilityId}`},
    statePath,
    message: persistent
      ? `Tried ${capabilityId}. Provider was already CAP-managed; cleanup will keep the persistent binding.`
      : `Tried ${capabilityId} via a temporary ManagedBinding (not Direct Exposure). Cleanup with cap cleanup ${capabilityId}.`
  };
}

export async function cleanupTrial(capabilityId, options = {}) {
  if (!capabilityId) throw new Error('Capability id is required');
  const catalog = await loadEffectiveCatalog(options);
  const capability = catalog.capabilities.find((item) => item.capability_id === capabilityId);
  if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);

  const state = await loadState(options);
  ensureTrials(state);
  const trial = findTrial(state, capabilityId);
  if (!trial) throw new Error(`No trial binding for ${capabilityId}. cap try first.`);

  const removed = [];
  if (trial.created_capability && !trial.promoted) {
    state.managed_capabilities = state.managed_capabilities.filter((id) => id !== capabilityId);
    removed.push('managed_capability');
  }
  if (trial.created_provider && !trial.promoted) {
    const stillNeeded = catalog.capabilities.some((item) => (
      state.managed_capabilities.includes(item.capability_id) && item.provider_refs.includes(trial.provider_id)
    ));
    if (!stillNeeded) {
      state.managed_providers = state.managed_providers.filter((id) => id !== trial.provider_id);
      removed.push('managed_provider');
    }
  }
  if (trial.created_binding && !trial.promoted && state.mcp_bindings[trial.provider_id]) {
    delete state.mcp_bindings[trial.provider_id];
    removed.push('mcp_binding');
  }

  state.trial_bindings = state.trial_bindings.filter((row) => row.capability_id !== capabilityId);
  const outcomes = retainedOutcomes(state, capabilityId);
  pushActivity(state, {
    action: 'cleanup',
    capability_id: capabilityId,
    provider_id: trial.provider_id,
    success: true,
    anonymous: true,
    local: true,
    outcome_retained: true,
    removed
  });
  const statePath = await saveState(state, options);
  return {
    action: 'cleanup',
    capability_id: capabilityId,
    provider_id: trial.provider_id,
    exposure: 'none',
    removed,
    writes: [],
    outcome_retained: true,
    outcomes,
    telemetry: false,
    statePath,
    message: `Removed trial binding for ${capabilityId}. Local outcome record retained (no remote telemetry).`
  };
}
