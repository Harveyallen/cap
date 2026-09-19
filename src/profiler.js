/** Capability Context Profiler — value / cost from Registry activity.
 *  User-facing name: Value Analysis / 价值分析. JSON key stays `profiler`. */

/** REC-04 default: 14 UTC calendar days from first local Activity. */
export const OBSERVATION_PERIOD_DAYS = 14;
/** Minimum distinct UTC days with search/select/add/use before frequency verdicts. */
export const OBSERVATION_EVIDENCE_SESSION_DAYS = 3;

/** UTC calendar day used as a coarse session key. */
export function sessionKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

function intOpt(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function utcDayMs(iso) {
  const key = sessionKey(iso);
  if (key === 'unknown') return null;
  return Date.parse(`${key}T00:00:00.000Z`);
}

export function calendarDaysBetween(fromIso, toIso) {
  const start = utcDayMs(fromIso);
  const end = utcDayMs(toIso);
  if (start == null || end == null) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function oldestActivityAt(activity = []) {
  let oldest = null;
  for (const row of activity) {
    if (!row?.at || utcDayMs(row.at) == null) continue;
    if (!oldest || Date.parse(row.at) < Date.parse(oldest)) oldest = row.at;
  }
  return oldest;
}

export function resolveObservationStart(state = {}) {
  if (state.observation_started_at && utcDayMs(state.observation_started_at) != null) {
    return state.observation_started_at;
  }
  return oldestActivityAt(state.activity);
}

/**
 * Phase 2 readiness: 14 UTC days elapsed AND 3 distinct activity days.
 * Wall-clock alone is not enough; a silent install must not age into a verdict.
 */
export function assessObservation(state = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const periodDays = Math.max(1, intOpt(options.periodDays, OBSERVATION_PERIOD_DAYS));
  const evidenceRequired = Math.max(1, intOpt(options.evidenceSessionDays, OBSERVATION_EVIDENCE_SESSION_DAYS));
  const startedAt = resolveObservationStart(state);
  const sessionDays = new Set(
    (state.activity ?? []).map((row) => sessionKey(row.at)).filter((key) => key !== 'unknown')
  ).size;
  if (!startedAt) {
    return {
      ready: false,
      frequencyVerdicts: false,
      startedAt: null,
      now,
      periodDays,
      elapsedDays: 0,
      remainingDays: periodDays,
      evidenceSessionDaysRequired: evidenceRequired,
      evidenceSessionDays: 0,
      reasons: ['no_activity']
    };
  }
  const elapsedDays = calendarDaysBetween(startedAt, now);
  const reasons = [];
  if (elapsedDays < periodDays) reasons.push('duration_unmet');
  if (sessionDays < evidenceRequired) reasons.push('evidence_unmet');
  const ready = reasons.length === 0;
  return {
    ready,
    frequencyVerdicts: ready,
    startedAt,
    now,
    periodDays,
    elapsedDays,
    remainingDays: Math.max(0, periodDays - elapsedDays),
    evidenceSessionDaysRequired: evidenceRequired,
    evidenceSessionDays: sessionDays,
    reasons: ready ? ['ready'] : reasons
  };
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

function providerNamesFor(capabilityId, catalog) {
  const capability = catalog.capabilities.find((item) => item.capability_id === capabilityId);
  const refs = new Set(capability?.provider_refs ?? []);
  const names = new Set();
  for (const provider of catalog.providers) {
    if (!refs.has(provider.provider_id)) continue;
    names.add(provider.provider_id.toLowerCase());
    names.add(provider.name.toLowerCase());
    if (provider.mcp_server) names.add(String(provider.mcp_server).toLowerCase());
    const short = provider.provider_id.split('.').pop();
    if (short) names.add(short.toLowerCase());
  }
  return names;
}

function duplicationSignal(capabilityId, catalog, duplicates) {
  const names = providerNamesFor(capabilityId, catalog);
  const match = (duplicates ?? []).find((group) => names.has(String(group.name).toLowerCase()));
  if (!match) return {duplicate: false};
  return {duplicate: true, name: match.name, sources: match.sources ?? []};
}

function recencySignal(item, now) {
  if (!item.lastUsedAt) return {lastUsedAt: null, daysSinceLastUse: null, neverUsed: true};
  return {
    lastUsedAt: item.lastUsedAt,
    daysSinceLastUse: calendarDaysBetween(item.lastUsedAt, now),
    neverUsed: false
  };
}

function needsAdvice(item) {
  return item.managed && (item.successes === 0 || (item.contextCost >= 400 && (item.valuePerCost ?? 0) < 0.05));
}

function buildAdvice({capabilities, catalog, duplicates, observation, now}) {
  if (!observation.ready) return [];
  return capabilities
    .filter(needsAdvice)
    .map((item) => ({
      capability_id: item.capability_id,
      frequency: item.successes === 0 ? 'low' : 'observed',
      action: 'prefer_on_demand',
      signals: {
        cost: {contextCost: item.contextCost, estimated: true},
        duplication: duplicationSignal(item.capability_id, catalog, duplicates),
        usage: {
          successes: item.successes,
          attempts: item.attempts,
          sessions: item.sessions,
          unused: item.successes === 0
        },
        recency: recencySignal(item, now)
      }
    }))
    .sort((a, b) => Number(b.frequency === 'low') - Number(a.frequency === 'low') || a.capability_id.localeCompare(b.capability_id))
    .slice(0, 10);
}

function notesFor(observation) {
  const gate = observation.ready
    ? 'Observation Period is ready (14 UTC days and 3 activity days). Frequency/value advice lists cost, duplication, usage, and recency separately. Advice is prefer_on_demand — never unused→remove.'
    : 'Frequency verdicts stay off until Observation Period readiness (14 UTC days and 3 distinct activity days). underused is a value signal only; do not recommend removal from unused or day-one data.';
  return `Value Analysis is derived from Registry activity (successful uses + distinct UTC days as sessions). Search and select events are stored for observation; they do not create value scores. ${gate} valuePerCost = value / catalog context_cost. Not a live-session measurement.`;
}

/**
 * Build V3 profiler from catalog + registry state. Mutates item.cost.value
 * when an inventory row can be linked to a profiled capability/provider.
 */
export function buildProfiler({
  catalog,
  state,
  items = [],
  duplicates = [],
  now,
  periodDays,
  evidenceSessionDays
} = {}) {
  const activity = state.activity ?? [];
  const managed = new Set(state.managed_capabilities ?? []);
  const useRows = activity.filter((row) => row.action === 'use');
  const searchRows = activity.filter((row) => row.action === 'search');
  const selectRows = activity.filter((row) => row.action === 'select');
  const observation = assessObservation(state, {now, periodDays, evidenceSessionDays});
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
    .filter(needsAdvice)
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

  const advice = buildAdvice({capabilities, catalog, duplicates, observation, now: observation.now});

  return {
    version: 3,
    tracked: capabilities.length,
    used: capabilities.filter((item) => item.successes > 0).length,
    unusedManaged: capabilities.filter((item) => item.managed && item.successes === 0).length,
    useAttempts: useRows.length,
    searchEvents: searchRows.length,
    selectEvents: selectRows.length,
    frequencyVerdicts: observation.frequencyVerdicts,
    observation,
    capabilities,
    ranked: ranked.slice(0, 10),
    underused: underused.slice(0, 10),
    advice,
    notes: notesFor(observation)
  };
}
