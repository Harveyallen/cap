/** Intent/keyword capability ranking over the seed catalog plus local skills. */
import { attachInputSchemas } from './input-schema.js';
import { loadEffectiveCatalog, loadState, recordSearchActivity } from './registry.js';

function terms(value) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}_.+-]+/gu) ?? [];
}

function hasHan(value) {
  return /\p{Script=Han}/u.test(value);
}

function catalogNeedles(capability) {
  return [...capability.keywords, ...capability.intents]
    .map((item) => String(item).toLowerCase().trim())
    .filter((item) => item.length >= 2);
}

function scoreCapability(query, capability) {
  const queryTerms = terms(query);
  const id = capability.capability_id.toLowerCase();
  const name = capability.name.toLowerCase();
  const summary = capability.summary.toLowerCase();
  const intents = capability.intents.join(' ').toLowerCase();
  const keywords = capability.keywords.join(' ').toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  let score = 0;
  for (const term of queryTerms) {
    if (id.includes(term)) score += 7;
    if (name.includes(term)) score += 6;
    if (keywords.includes(term)) score += 5;
    if (intents.includes(term)) score += 4;
    if (summary.includes(term)) score += 2;
  }
  if (intents.includes(normalizedQuery)) score += 15;
  // CJK (and longer Latin) catalog needles inside the query: 「帮我发钉钉消息」
  // tokenizes as one term, but still contains keywords 钉钉 / 消息.
  for (const needle of catalogNeedles(capability)) {
    if (!normalizedQuery.includes(needle)) continue;
    if (!hasHan(needle) && needle.length < 4) continue;
    if (capability.intents.some((intent) => intent.toLowerCase() === needle)) {
      if (needle !== normalizedQuery) score += 8;
    } else {
      score += 5;
    }
  }
  return score;
}

export async function searchCapabilities(query, options = {}) {
  if (!query?.trim()) throw new Error('Search query is required');
  const [catalog, state] = await Promise.all([loadEffectiveCatalog(options), loadState(options)]);
  const providers = new Map(catalog.providers.map((item) => [item.provider_id, item]));
  const registered = new Set((state.local_skills ?? []).map((item) => item.capability_id));
  const ranked = catalog.capabilities
    .map((capability) => {
      const installed = state.managed_capabilities.includes(capability.capability_id);
      return {
        ...capability,
        score: scoreCapability(query, capability),
        installed,
        ...(installed ? {} : {use_registers: true}),
        registered: registered.has(capability.capability_id) || capability.origin === 'local-skill',
        providers: capability.provider_refs.map((id) => {
          const provider = providers.get(id);
          if (!provider) return {provider_id: id, name: id, status: 'Unknown'};
          return {...provider, status: state.managed_providers.includes(id) ? 'CAP Managed' : provider.status};
        })
      };
    })
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || a.context_cost - b.context_cost)
    .slice(0, options.limit ?? 5);
  if (options.record !== false) await recordSearchActivity(query, ranked, options);
  return attachInputSchemas(ranked, {catalog, state, options});
}
