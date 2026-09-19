/** Capability Context Profiler — value / cost from Registry activity.
 *  User-facing name: Value Analysis / 价值分析. JSON key stays `profiler`. */

/** UTC calendar day used as a coarse session key. */
export function sessionKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

/**
 * Explainable 0–100 value from successful uses and distinct session days.
 * Returns null when this capability has never been attempted (no signal).
 */
export function scoreValue({successes = 0, sessions = 0, attempts = 0} = {}) {
  if (attempts <= 0 && successes <= 0) return null;
  const raw = successes * 12 + sessions * 8 + Math.min(10, Math.max(0, attempts - successes));
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function valuePerCost(value, contextCost) {
  if (value == null || value === undefined) return null;
  const cost = Number(contextCost);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return Math.round((value / cost) * 1000) / 1000;
}

function emptyEntry(id, catalog, managed) {
  const capability = catalog.capabilities.find((item) => item.capability_id === id);
  return {
    capability_id: id,
    name: capability?.name ?? id,
    contextCost: capability?.context_cost ?? 0,
    managed,
    attempts: 0,
    successes: 0,
    failures: 0,
    sessions: new Set(),
    lastUsedAt: null,
    lastAttemptAt: null
  };
}

function providerIndex(catalog) {
  const map = new Map();
  for (const provider of catalog.providers) {
    map.set(provider.provider_id.toLowerCase(), provider);
    map.set(provider.name.toLowerCase(), provider);
    const short = provider.provider_id.split('.').pop();
    if (short) map.set(short.toLowerCase(), provider);
  }
  return map;
}

/**
 * Build V3 profiler from catalog + registry state. Mutates item.cost.value
 * when an inventory row can be linked to a profiled capability/provider.
 */
export function buildProfiler({catalog, state, items = []}) {
  const activity = state.activity ?? [];
  const managed = new Set(state.managed_capabilities ?? []);
  const useRows = activity.filter((row) => row.action === 'use');
  const searchRows = activity.filter((row) => row.action === 'search');
  const selectRows = activity.filter((row) => row.action === 'select');
  const byId = new Map();

  for (const id of managed) byId.set(id, emptyEntry(id, catalog, true));

  for (const row of useRows) {
    const id = row.capability_id;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, emptyEntry(id, catalog, managed.has(id)));
    const entry = byId.get(id);
    entry.attempts += 1;
    entry.lastAttemptAt = row.at ?? entry.lastAttemptAt;
    if (row.success) {
      entry.successes += 1;
      entry.sessions.add(sessionKey(row.at));
      entry.lastUsedAt = row.at ?? entry.lastUsedAt;
    } else {
      entry.failures += 1;
    }
  }

  const capabilities = [...byId.values()].map((entry) => {
    const sessions = entry.sessions.size;
    const value = scoreValue({successes: entry.successes, sessions, attempts: entry.attempts});
    return {
      capability_id: entry.capability_id,
      name: entry.name,
      managed: entry.managed,
      contextCost: entry.contextCost,
      attempts: entry.attempts,
      successes: entry.successes,
      failures: entry.failures,
      sessions,
      lastUsedAt: entry.lastUsedAt,
      lastAttemptAt: entry.lastAttemptAt,
      value,
      valuePerCost: valuePerCost(value, entry.contextCost)
    };
  });

  const ranked = [...capabilities]
    .filter((item) => item.value != null && item.successes > 0)
    .sort((a, b) => (b.valuePerCost ?? 0) - (a.valuePerCost ?? 0) || (b.value ?? 0) - (a.value ?? 0) || b.successes - a.successes);

  const underused = [...capabilities]
    .filter((item) => item.managed && (item.successes === 0 || (item.contextCost >= 400 && (item.valuePerCost ?? 0) < 0.05)))
    .sort((a, b) => b.contextCost - a.contextCost || a.capability_id.localeCompare(b.capability_id));

  const byCapability = new Map(capabilities.map((item) => [item.capability_id, item]));
  const providers = providerIndex(catalog);

  for (const item of items) {
    if (!item?.cost || item.kind === 'warning') continue;
    if (item.capSurface) {
      const values = capabilities.filter((row) => row.managed && row.value != null).map((row) => row.value);
      if (!values.length) continue;
      const aggregate = Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
      item.cost.value = aggregate;
      item.cost.valuePerCost = valuePerCost(aggregate, item.cost.totalTokens || item.contextTokens || 0);
      continue;
    }
    const provider = providers.get(String(item.name).toLowerCase());
    if (!provider) continue;
    const linked = provider.capabilities.map((id) => byCapability.get(id)).filter((row) => row && row.value != null);
    if (!linked.length) continue;
    const best = linked.sort((a, b) => (b.valuePerCost ?? 0) - (a.valuePerCost ?? 0) || (b.value ?? 0) - (a.value ?? 0))[0];
    item.cost.value = best.value;
    item.cost.valuePerCost = best.valuePerCost;
  }

  capabilities.sort((a, b) => (b.valuePerCost ?? -1) - (a.valuePerCost ?? -1) || b.successes - a.successes || a.capability_id.localeCompare(b.capability_id));

  return {
    version: 3,
    tracked: capabilities.length,
    used: capabilities.filter((item) => item.successes > 0).length,
    unusedManaged: capabilities.filter((item) => item.managed && item.successes === 0).length,
    useAttempts: useRows.length,
    searchEvents: searchRows.length,
    selectEvents: selectRows.length,
    frequencyVerdicts: false,
    capabilities,
    ranked: ranked.slice(0, 10),
    underused: underused.slice(0, 10),
    notes: 'Value Analysis is derived from Registry activity (successful uses + distinct UTC days as sessions). Search and select events are stored for later observation; they do not create value scores or frequency labels. Frequency verdicts stay off until Phase 2 Observation Period readiness. Phase 1 must not recommend removal from unused or day-one data. valuePerCost = value / catalog context_cost. Not a live-session measurement.'
  };
}
