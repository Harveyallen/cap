/** Read local Agent MCP/Skills configs and estimate context footprint. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultMcpJsonConfigs } from './mcp-bind.js';
import { listCodexMcpServers } from './codex-toml.js';
import { matchesPreference } from './pin.js';
import { loadCatalog, loadState } from './registry.js';
import { defaultSkillRoots, isPluginSkillTree, walkSkillFiles } from './skills.js';
import { exposedCapTools, isCapMcpConfig } from './mcp-tools.js';
import { buildProfiler } from './profiler.js';

const TOKEN_CHARS = 4;
const DEFAULT_NOMINAL_WINDOW = 200_000;
const DEFAULT_HARNESS_SOFT_LIMIT = 200_000;
const DEFAULT_RESERVE_TOKENS = 32_000;
const CODING_AGENT_SLO = {min: 10, max: 15};

export function estimateTokens(value) {
  if (value == null || value === '') return 0;
  return Math.ceil((typeof value === 'string' ? value.length : JSON.stringify(value).length) / TOKEN_CHARS);
}

function envMap(options) {
  return options.env ?? process.env;
}

function intOpt(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function itemCost({schemaTokens = 0, descriptionTokens = 0, instructionTokens = 0, totalTokens, estimated = true, instructionOnDemand = false}) {
  const total = totalTokens ?? (schemaTokens + descriptionTokens + instructionTokens);
  return {
    schemaTokens, descriptionTokens, instructionTokens, totalTokens: total, estimated, value: null,
    ...(instructionOnDemand ? {instructionOnDemand: true} : {})
  };
}

function itemStatus(item) {
  if (item.kind === 'warning') return 'warning';
  if (item.capSurface) return 'cap';
  if (!item.direct) return 'managed';
  if (item.toolCountEstimated) return 'estimated';
  return 'direct';
}

/** Nominal window vs effective budget. Override via options or CAP_* env. */
export function resolveBudget(options = {}) {
  const env = envMap(options);
  const nominalWindow = intOpt(options.nominalWindow ?? env.CAP_NOMINAL_WINDOW, DEFAULT_NOMINAL_WINDOW);
  const harnessSoftLimit = intOpt(options.harnessSoftLimit ?? env.CAP_HARNESS_SOFT_LIMIT, DEFAULT_HARNESS_SOFT_LIMIT);
  const reserveTokens = intOpt(options.reserveTokens ?? env.CAP_RESERVE_TOKENS, DEFAULT_RESERVE_TOKENS);
  const computed = Math.max(0, Math.min(nominalWindow, harnessSoftLimit) - reserveTokens);
  const effectiveBudget = intOpt(options.effectiveBudget ?? env.CAP_EFFECTIVE_BUDGET, computed);
  return {
    nominalWindow,
    effectiveBudget,
    reserveTokens,
    assumptions: {
      tokenizer: 'character/4',
      harnessSoftLimit,
      reserveFor: 'output and reasoning',
      codingAgentSloPercent: CODING_AGENT_SLO,
      notes: 'Nominal Window defaults to 200000 (set CAP_NOMINAL_WINDOW=1000000 for a typical vendor max). Effective Budget is min(nominal, harness soft limit) minus reserve, unless CAP_EFFECTIVE_BUDGET is set. Not a vendor tokenizer.'
    }
  };
}

/** Context Pressure = injected / effective budget. Bands are an engineering standard. */
export function classifyPressure(injectedTokens, effectiveBudget) {
  const tokens = Math.max(0, Number(injectedTokens) || 0);
  const budget = Number(effectiveBudget);
  if (!Number.isFinite(budget) || budget <= 0) {
    return {injectedTokens: tokens, percent: 0, band: 'unknown', healthScore: 0};
  }
  const percent = Math.round((tokens / budget) * 1000) / 10;
  let band = 'emergency';
  if (percent < 30) band = 'healthy';
  else if (percent < 50) band = 'moderate';
  else if (percent < 70) band = 'high';
  else if (percent < 85) band = 'critical';
  return {injectedTokens: tokens, percent, band, healthScore: Math.max(0, Math.min(100, Math.round(100 - percent)))};
}

export function buildFunnel({items, activity}) {
  const inventory = items.filter((item) => item.kind !== 'warning');
  const names = new Set(inventory.map((item) => item.name.toLowerCase()));
  const useRows = (activity ?? []).filter((row) => row.action === 'use');
  const usedIds = new Set(useRows.filter((row) => row.success).map((row) => row.capability_id));
  const injected = inventory.filter((item) => item.direct).length;
  return {
    installed: names.size,
    enabled: inventory.length,
    injected,
    configured: injected,
    used: usedIds.size,
    usedUnknown: useRows.length === 0,
    useAttempts: useRows.length,
    notes: 'Config/skill scan only. Inspect does not connect to MCP servers or measure the live session. installed = Local Inventory (scanned names). injected/configured = Direct Exposure count. used = Invoked (successful Registry use). usedUnknown is true only when no use attempts were recorded.'
  };
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return {__parseError: error.message};
  }
}

function serverEntries(value) {
  const servers = value?.mcpServers ?? value?.mcp_servers ?? value?.mcp?.servers;
  return servers && typeof servers === 'object' ? Object.entries(servers) : [];
}

function decorate(item) {
  if (item.kind === 'warning') return item;
  item.status = itemStatus(item);
  item.cost ??= itemCost({totalTokens: item.contextTokens, estimated: true});
  item.cost.estimated = true;
  return item;
}

const OVERLAP_STOP = new Set([
  'skill', 'skills', 'code', 'coding', 'agent', 'local', 'file', 'files', 'this', 'that', 'with', 'from',
  'into', 'when', 'will', 'able', 'help', 'make', 'made', 'your', 'you', 'the', 'and', 'for', 'use',
  'using', 'used', 'create', 'creating', 'write', 'writing', 'read', 'reading', 'tool', 'tools',
  '一个', '这个', '可以', '用于', '使用', '帮助', '文件', '本地'
]);
const OVERLAP_NOTE = 'Probable overlap from shared name/description tokens (Jaccard ≥ 0.5 and ≥ 2 content tokens, or 5+ char name containment). Not a path/name duplicate. False positives: skills that share jargon (review, github, 审查) but serve different owners or workflows. Paraphrases with no shared tokens are missed on purpose — not Phase 3 embeddings.';
const FILTER_SCOPES = new Set(['user', 'project', 'shared', 'plugin']);
const FILTER_TYPES = new Set(['mcp', 'skill']);
const FILTER_STATUSES = new Set(['direct', 'estimated', 'managed', 'cap', 'warning']);
const FILTER_REASONS = new Set(['duplicate', 'overlap', 'migrate', 'pinned', 'excluded', 'cap-surface', 'cap-duplicate', 'warning']);

function posixPath(file) {
  return String(file ?? '').replace(/\\/g, '/');
}

function csvValues(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

/** user | project | shared | plugin from scan path (INV-10). */
export function inventoryScope(item, options = {}) {
  if (!item || item.kind === 'warning') return null;
  const file = posixPath(item.source);
  const project = posixPath(options.projectRoot ?? '');
  if (isPluginSkillTree(file) || item.scope === 'plugin') return 'plugin';
  if (item.agent === 'Shared' || /(?:^|\/)\.agents\/skills(?:\/|$)/.test(file)) return 'shared';
  if (item.agent === 'Project') return 'project';
  if (project && (file === project || file.startsWith(`${project}/`))) return 'project';
  return 'user';
}

export function overlapTokens(text) {
  const terms = new Set();
  const value = String(text ?? '');
  for (const token of value.toLocaleLowerCase().match(/[\p{L}\p{N}_.+-]+/gu) ?? []) {
    if (token.length < 4 || OVERLAP_STOP.has(token)) continue;
    terms.add(token);
  }
  for (const han of value.match(/\p{Script=Han}{2,}/gu) ?? []) {
    if (OVERLAP_STOP.has(han)) continue;
    if (han.length <= 4) terms.add(han);
    if (han.length < 2) continue;
    for (let i = 0; i <= han.length - 2; i += 1) {
      const gram = han.slice(i, i + 2);
      if (!OVERLAP_STOP.has(gram)) terms.add(gram);
    }
  }
  return terms;
}

export function skillOverlapScore(a, b) {
  if (!a || !b) return null;
  if (String(a.name).toLowerCase() === String(b.name).toLowerCase()) return null;
  const tokensA = overlapTokens(`${a.name} ${a.description ?? ''}`);
  const tokensB = overlapTokens(`${b.name} ${b.description ?? ''}`);
  const shared = [...tokensA].filter((token) => tokensB.has(token));
  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize ? shared.length / unionSize : 0;
  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  const contained = nameA.length >= 5 && nameB.length >= 5 && (nameA.includes(nameB) || nameB.includes(nameA));
  if (contained && shared.length >= 1) {
    return {method: 'name-containment', jaccard: Math.max(jaccard, 0.5), shared};
  }
  if (shared.length >= 2 && jaccard >= 0.5) return {method: 'token-jaccard', jaccard, shared};
  return null;
}

export function skillOverlapGroups(skills = []) {
  const items = skills.filter((item) => item && item.kind !== 'warning');
  const parent = items.map((_, index) => index);
  const meta = new Map();
  function find(index) {
    return parent[index] === index ? index : (parent[index] = find(parent[index]));
  }
  function union(i, j, score) {
    const a = find(i);
    const b = find(j);
    if (a === b) {
      const prev = meta.get(a);
      if (prev) {
        prev.jaccard = Math.max(prev.jaccard, score.jaccard);
        for (const token of score.shared) prev.shared.add(token);
      }
      return;
    }
    const root = Math.min(a, b);
    const other = Math.max(a, b);
    parent[other] = root;
    const prev = meta.get(root) ?? {method: score.method, jaccard: 0, shared: new Set()};
    const extra = meta.get(other);
    prev.jaccard = Math.max(prev.jaccard, score.jaccard, extra?.jaccard ?? 0);
    if (score.method === 'name-containment' || extra?.method === 'name-containment') prev.method = 'name-containment';
    else prev.method = prev.method || extra?.method || score.method;
    for (const token of score.shared) prev.shared.add(token);
    if (extra) for (const token of extra.shared) prev.shared.add(token);
    meta.set(root, prev);
    if (other !== root) meta.delete(other);
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const score = skillOverlapScore(items[i], items[j]);
      if (score) union(i, j, score);
    }
  }
  const grouped = new Map();
  for (let i = 0; i < items.length; i += 1) {
    const root = find(i);
    if (!meta.has(root)) continue;
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(items[i]);
  }
  return [...grouped.entries()]
    .map(([root, group]) => {
      if (group.length < 2) return null;
      const info = meta.get(root);
      return {
        names: group.map((item) => item.name),
        sources: group.map((item) => item.source),
        method: info.method,
        score: Math.round(info.jaccard * 100) / 100,
        shared: [...info.shared].slice(0, 8),
        note: OVERLAP_NOTE
      };
    })
    .filter(Boolean);
}

export function parseInspectFilters(input = {}) {
  const filters = {};
  const agent = String(input.agent ?? '').trim();
  if (agent) filters.agent = agent;
  const scope = String(input.scope ?? '').trim().toLowerCase();
  if (FILTER_SCOPES.has(scope)) filters.scope = scope;
  const type = String(input.type ?? input.kind ?? '').trim().toLowerCase();
  if (FILTER_TYPES.has(type)) filters.type = type;
  const status = String(input.status ?? '').trim().toLowerCase();
  if (FILTER_STATUSES.has(status)) filters.status = status;
  const source = String(input.source ?? '').trim();
  if (source) filters.source = source;
  const costMin = Number(input.costMin ?? input['cost-min']);
  if (Number.isFinite(costMin) && costMin >= 0) filters.costMin = costMin;
  const costMax = Number(input.costMax ?? input['cost-max']);
  if (Number.isFinite(costMax) && costMax >= 0) filters.costMax = costMax;
  const reasons = csvValues(input.reason ?? input.reasons).map((item) => item.toLowerCase()).filter((item) => FILTER_REASONS.has(item));
  if (reasons.length) filters.reason = reasons;
  return filters;
}

export function filterInventory(items = [], filters = {}) {
  const query = parseInspectFilters(filters);
  if (!Object.keys(query).length) return items.filter((item) => item.kind !== 'warning');
  return items.filter((item) => {
    if (item.kind === 'warning') return query.status === 'warning' || query.reason?.includes('warning');
    if (query.agent && !String(item.agent ?? '').toLowerCase().includes(query.agent.toLowerCase())) return false;
    if (query.scope && item.scope !== query.scope) return false;
    if (query.type && item.kind !== query.type) return false;
    if (query.status && item.status !== query.status) return false;
    if (query.source && !posixPath(item.source).toLowerCase().includes(query.source.toLowerCase())) return false;
    const cost = Number(item.contextTokens ?? item.cost?.totalTokens ?? 0);
    if (query.costMin != null && cost < query.costMin) return false;
    if (query.costMax != null && cost > query.costMax) return false;
    if (query.reason?.length) {
      const reasons = item.reasons ?? [];
      if (!query.reason.some((reason) => reasons.includes(reason))) return false;
    }
    return true;
  });
}

function itemReasons(item, {duplicates, overlaps, recommendations, capDuplicates}) {
  if (item.kind === 'warning') return ['warning'];
  const reasons = [];
  const nameKey = String(item.name ?? '').toLowerCase();
  if (item.capSurface) reasons.push('cap-surface');
  if (capDuplicates.has(item)) reasons.push('cap-duplicate');
  if (duplicates.some((group) => group.reason !== 'cap-surface' && String(group.name).toLowerCase() === nameKey && (group.sources ?? []).includes(item.source))) {
    reasons.push('duplicate');
  }
  if (overlaps.some((group) => (group.sources ?? []).includes(item.source))) reasons.push('overlap');
  if (recommendations.some((row) => row.provider === item.name && row.source === item.source)) reasons.push('migrate');
  if (item.pinned) reasons.push('pinned');
  if (item.excluded) reasons.push('excluded');
  return reasons;
}

function capSurfaceItem({name, file, agent, options, fingerprint}) {
  const tools = exposedCapTools(options);
  const schemaTokens = estimateTokens(tools);
  const cost = itemCost({schemaTokens, estimated: true});
  return decorate({
    kind: 'mcp', agent, name, source: file, direct: true, capSurface: true,
    toolCount: tools.length, toolCountEstimated: false,
    contextTokens: schemaTokens, cost, fingerprint
  });
}

async function inspectJsonConfig(file, agent, options = {}) {
  const value = await readJson(file);
  if (!value) return [];
  if (value.__parseError) return [{kind: 'warning', agent, source: file, message: value.__parseError}];
  return serverEntries(value).map(([name, config]) => {
    const fingerprint = JSON.stringify({command: config.command, args: config.args, url: config.url});
    if (isCapMcpConfig(config)) return capSurfaceItem({name, file, agent, options, fingerprint});
    const schemas = config.tools ?? config.toolSchemas ?? config.schemas ?? [];
    const explicitCount = Array.isArray(schemas) ? schemas.length : Object.keys(schemas).length;
    const descriptionTokens = estimateTokens(config.description ?? '');
    const instructionTokens = estimateTokens(config.instructions ?? config.systemPrompt ?? '');
    const schemaTokens = estimateTokens(explicitCount ? schemas : config);
    const cost = itemCost({
      schemaTokens,
      descriptionTokens,
      instructionTokens,
      totalTokens: explicitCount ? schemaTokens + descriptionTokens + instructionTokens : schemaTokens,
      estimated: true
    });
    return decorate({
      kind: 'mcp', agent, name, source: file, direct: true,
      toolCount: explicitCount || Number(config.toolCount) || 1,
      toolCountEstimated: !explicitCount && !config.toolCount,
      contextTokens: cost.totalTokens,
      cost,
      fingerprint
    });
  });
}

async function inspectCodexToml(file, options = {}) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return listCodexMcpServers(text).map((server) => {
    const fingerprint = server.block.replace(/\s+/g, ' ');
    if (isCapMcpConfig(server.config, server.block)) {
      return capSurfaceItem({name: server.name, file, agent: 'Codex', options, fingerprint});
    }
    const cost = itemCost({schemaTokens: estimateTokens(server.block), estimated: true});
    return decorate({
      kind: 'mcp', agent: 'Codex', name: server.name, source: file, direct: true,
      toolCount: 1, toolCountEstimated: true, contextTokens: cost.totalTokens, cost,
      fingerprint
    });
  });
}

async function inspectSkillRoot(root, agent) {
  const skills = await walkSkillFiles(root, agent, {includeBody: true});
  return skills.map((skill) => {
    const identityTokens = estimateTokens([skill.name, skill.description].filter(Boolean).join('\n'));
    const cost = itemCost({
      descriptionTokens: identityTokens,
      instructionTokens: estimateTokens(skill.body ?? ''),
      estimated: true,
      instructionOnDemand: true
    });
    return decorate({
      kind: 'skill', agent: skill.agent, name: skill.name, source: skill.source, direct: true,
      toolCount: 0, contextTokens: identityTokens, cost,
      description: skill.description || undefined,
      fingerprint: `${skill.name.toLowerCase()}:${identityTokens}`
    });
  });
}

export async function inspectLocal(options = {}) {
  const home = options.userHome ?? os.homedir();
  const project = path.resolve(options.projectRoot ?? process.cwd());
  const jsonConfigs = options.jsonConfigs ?? defaultMcpJsonConfigs(home, project);
  const skillRoots = options.skillRoots ?? defaultSkillRoots(home, project);
  const batches = await Promise.all([
    ...jsonConfigs.map(([file, agent]) => inspectJsonConfig(file, agent, options)),
    inspectCodexToml(options.codexConfig ?? path.join(home, '.codex', 'config.toml'), options),
    ...skillRoots.map(([root, agent]) => inspectSkillRoot(root, agent))
  ]);
  const items = batches.flat();
  const state = await loadState(options);
  const managedNames = new Set((state.external_providers ?? []).map((item) => item.name));
  for (const item of items) {
    item.pinned = matchesPreference(state.pinned_providers, item.name);
    item.excluded = matchesPreference(state.excluded_providers, item.name);
    if (managedNames.has(item.name) && !item.capSurface && !item.pinned) item.direct = false;
    decorate(item);
  }
  const inventory = items.filter((item) => item.kind !== 'warning');
  for (const item of inventory) item.scope = inventoryScope(item, {projectRoot: project, userHome: home});
  const grouped = inventory.reduce((all, item) => {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    (all[key] ??= []).push(item);
    return all;
  }, {});
  const nameDuplicateGroups = Object.values(grouped).filter((group) => group.length > 1);
  const nameDuplicates = nameDuplicateGroups.map((group) => ({name: group[0].name, sources: group.map((item) => item.source)}));
  const capByAgent = inventory.filter((item) => item.capSurface).reduce((all, item) => {
    (all[item.agent] ??= []).push(item);
    return all;
  }, {});
  const capDuplicateItems = new Set();
  const capDuplicateGroups = Object.values(capByAgent).flatMap((group) => {
    if (group.length < 2) return [];
    for (const item of group) capDuplicateItems.add(item);
    return [{
      name: 'CAP Surface',
      sources: group.map((item) => item.source),
      names: group.map((item) => item.name),
      agent: group[0].agent,
      reason: 'cap-surface'
    }];
  });
  const duplicates = [...nameDuplicates, ...capDuplicateGroups];
  const overlaps = skillOverlapGroups(inventory.filter((item) => item.kind === 'skill'));
  const warnings = items.filter((item) => item.kind === 'warning');
  const direct = inventory.filter((item) => item.direct);
  const managed = inventory.filter((item) => !item.direct);
  const directTools = direct.reduce((sum, item) => sum + item.toolCount, 0);
  const contextTokens = direct.reduce((sum, item) => sum + item.contextTokens, 0);
  const capSurfaces = inventory.filter((item) => item.capSurface);
  const capSurface = capSurfaces.length > 0;
  const capEntryTools = exposedCapTools(options).length;
  const migrateable = direct.filter((item) => item.kind === 'mcp' && !item.capSurface && !item.pinned && !item.excluded);
  const migrateableTools = migrateable.reduce((sum, item) => sum + item.toolCount, 0);
  const recommendations = migrateable
    .map((item) => ({provider: item.name, action: 'Move to CAP', source: item.source, estimatedTokensSaved: item.contextTokens}))
    .sort((a, b) => b.estimatedTokensSaved - a.estimatedTokensSaved);
  const reclaimableTokens = recommendations.reduce((sum, item) => sum + item.estimatedTokensSaved, 0);
  for (const item of inventory) {
    item.reasons = itemReasons(item, {duplicates, overlaps, recommendations, capDuplicates: capDuplicateItems});
  }
  const budget = resolveBudget(options);
  const pressure = classifyPressure(contextTokens, budget.effectiveBudget);
  const funnel = buildFunnel({items, activity: state.activity});
  const catalog = await loadCatalog();
  const env = envMap(options);
  const profiler = buildProfiler({
    catalog,
    state,
    items,
    duplicates: nameDuplicates,
    now: options.now,
    periodDays: options.observationDays ?? env.CAP_OBSERVATION_DAYS,
    evidenceSessionDays: options.observationEvidenceDays ?? env.CAP_OBSERVATION_EVIDENCE_DAYS
  });
  const filters = parseInspectFilters(options.filters ?? {});
  const filtered = Object.keys(filters).length ? filterInventory(items, filters) : undefined;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      mcpServers: inventory.filter((item) => item.kind === 'mcp').length,
      skills: inventory.filter((item) => item.kind === 'skill').length,
      providers: inventory.length,
      directTools,
      contextTokens,
      reclaimableTokens,
      warnings: warnings.length,
      managed: managed.length,
      duplicateGroups: duplicates.length,
      overlapGroups: overlaps.length,
      capSurface,
      capSurfaces: capSurfaces.length,
      registryCapabilities: state.managed_capabilities.length,
      capEntryTools,
      estimatedReductionPercent: migrateableTools > capEntryTools ? Math.round((1 - capEntryTools / migrateableTools) * 100) : 0,
      profilerTracked: profiler.tracked,
      profilerUsed: profiler.used,
      observationReady: profiler.observation.ready,
      pinned: inventory.filter((item) => item.pinned).length,
      excluded: inventory.filter((item) => item.excluded).length
    },
    budget,
    pressure,
    funnel,
    profiler,
    items,
    duplicates,
    overlaps,
    recommendations,
    ...(Object.keys(filters).length ? {filters, filtered} : {})
  };
}
