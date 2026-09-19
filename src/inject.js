/** V4 Dynamic Injection — plan a minimal capability set for a task.
 *  Ranking reuses search; this module frames load vs defer and token savings.
 *  Plan only: does not mutate Agent configs or connect to third-party MCP. */

import { estimateTokens, inspectLocal } from './inspector.js';
import { exposedCapTools } from './mcp-tools.js';
import { loadEffectiveCatalog } from './registry.js';
import { searchCapabilities } from './search.js';

export const INJECT_VERSION = 4;
const DEFAULT_LIMIT = 3;
/** Drop matches weaker than this fraction of the top score (filters substring noise). */
const RELATIVE_FLOOR = 0.5;

function capEntryTools() {
  return exposedCapTools({env: {}});
}

function loadRow(item) {
  const action = item.installed ? 'use' : 'add';
  return {
    capability_id: item.capability_id,
    name: item.name,
    summary: item.summary,
    score: item.score,
    context_cost: item.context_cost,
    risk: item.risk,
    installed: item.installed,
    providers: item.providers.map((provider) => ({
      provider_id: provider.provider_id,
      name: provider.name,
      status: provider.status
    })),
    next: {action, command: `cap ${action} ${item.capability_id}`}
  };
}

/**
 * Recommend which catalog capabilities to load for `query`, vs injecting the
 * full catalog / currently resident MCP surface.
 */
export async function planInjection(query, options = {}) {
  if (!query?.trim()) throw new Error('Inject query is required');
  const limit = options.limit ?? DEFAULT_LIMIT;
  const task = query.trim();
  const [matches, catalog, inspection] = await Promise.all([
    searchCapabilities(task, {...options, limit: Math.max(limit, 5), liveSchema: false}),
    loadEffectiveCatalog(options),
    inspectLocal(options)
  ]);
  const top = matches[0]?.score ?? 0;
  const floor = top * RELATIVE_FLOOR;
  const load = matches.filter((item) => item.score >= floor).slice(0, limit).map(loadRow);
  const loadIds = new Set(load.map((item) => item.capability_id));
  const defer = catalog.capabilities
    .filter((capability) => !loadIds.has(capability.capability_id))
    .map((capability) => ({
      capability_id: capability.capability_id,
      name: capability.name,
      context_cost: capability.context_cost,
      reason: 'not relevant to this task'
    }));

  const tools = capEntryTools();
  const capSurfaceItem = inspection.items.find((item) => item.capSurface);
  const capSurfaceTokens = capSurfaceItem?.contextTokens ?? estimateTokens(tools);
  const loadTokens = load.reduce((sum, item) => sum + item.context_cost, 0);
  const catalogTokens = catalog.capabilities.reduce((sum, item) => sum + item.context_cost, 0);
  const residentTokens = inspection.pressure.injectedTokens;
  const afterTokens = capSurfaceTokens;

  return {
    version: INJECT_VERSION,
    task,
    mutates: false,
    load,
    defer,
    keepResident: {
      kind: 'cap-surface',
      tools: tools.map((tool) => tool.name),
      contextTokens: capSurfaceTokens,
      note: 'CAP entry tools stay resident. Task capabilities load via cap.add / cap.use instead of injecting every provider schema.'
    },
    comparison: {
      catalogCount: catalog.capabilities.length,
      loadCount: load.length,
      deferCount: defer.length,
      loadTokens,
      catalogTokens,
      savedVsCatalog: catalogTokens - loadTokens,
      residentTokens,
      afterTokens,
      savedVsResident: Math.max(0, residentTokens - afterTokens),
      estimated: true,
      notes: 'catalog tokens are effective catalog context_cost (seed plus local skills). resident/after tokens are inspect estimates: after is CAP surface only because task capabilities go through cap.use, not extra resident schemas. Not a live-session measurement.'
    }
  };
}
