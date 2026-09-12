/** Read local Agent MCP/Skills configs and estimate context footprint. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadState } from './registry.js';
import { exposedCapTools, isCapMcpConfig } from './mcp-tools.js';

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
  const usedIds = new Set((activity ?? []).filter((row) => row.action === 'use' && row.success).map((row) => row.capability_id));
  const injected = inventory.filter((item) => item.direct).length;
  return {
    installed: names.size,
    enabled: inventory.length,
    injected,
    configured: injected,
    used: usedIds.size,
    usedUnknown: usedIds.size === 0,
    notes: 'Config/skill scan only. Inspect does not connect to MCP servers or measure the live session.'
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
  const headers = [...text.matchAll(/^\[mcp_servers\.(["']?)([^\]"']+)\1\]\s*$/gm)];
  return headers.map((match, index) => {
    const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(match.index, end);
    const fingerprint = block.replace(/\s+/g, ' ');
    if (isCapMcpConfig({}, block)) {
      return capSurfaceItem({name: match[2], file, agent: 'Codex', options, fingerprint});
    }
    const cost = itemCost({schemaTokens: estimateTokens(block), estimated: true});
    return decorate({
      kind: 'mcp', agent: 'Codex', name: match[2], source: file, direct: true,
      toolCount: 1, toolCountEstimated: true, contextTokens: cost.totalTokens, cost,
      fingerprint
    });
  });
}

async function walkSkills(root, agent) {
  let entries;
  try { entries = await fs.readdir(root, {withFileTypes: true}); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, 'SKILL.md');
    try {
      const text = await fs.readFile(file, 'utf8');
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? text.slice(0, 800);
      const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? entry.name;
      const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
      const identityTokens = estimateTokens([name, description].filter(Boolean).join('\n'));
      const cost = itemCost({
        descriptionTokens: identityTokens,
        instructionTokens: estimateTokens(body),
        estimated: true,
        instructionOnDemand: true
      });
      skills.push(decorate({
        kind: 'skill', agent, name, source: file, direct: true,
        toolCount: 0, contextTokens: identityTokens, cost,
        fingerprint: `${name.toLowerCase()}:${identityTokens}`
      }));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return skills;
}

export async function inspectLocal(options = {}) {
  const home = options.userHome ?? os.homedir();
  const project = path.resolve(options.projectRoot ?? process.cwd());
  const jsonConfigs = options.jsonConfigs ?? [
    [path.join(home, '.claude.json'), 'Claude Code'],
    [path.join(home, '.claude', 'settings.json'), 'Claude Code'],
    [path.join(project, '.mcp.json'), 'Project']
  ];
  const skillRoots = options.skillRoots ?? [
    [path.join(home, '.claude', 'skills'), 'Claude Code'],
    [path.join(home, '.codex', 'skills'), 'Codex'],
    [path.join(project, '.claude', 'skills'), 'Claude Code'],
    [path.join(project, '.codex', 'skills'), 'Codex'],
    [path.join(project, '.agents', 'skills'), 'Shared']
  ];
  const batches = await Promise.all([
    ...jsonConfigs.map(([file, agent]) => inspectJsonConfig(file, agent, options)),
    inspectCodexToml(options.codexConfig ?? path.join(home, '.codex', 'config.toml'), options),
    ...skillRoots.map(([root, agent]) => walkSkills(root, agent))
  ]);
  const items = batches.flat();
  const state = await loadState(options);
  const managedNames = new Set(state.external_providers.map((item) => item.name));
  for (const item of items) {
    if (managedNames.has(item.name) && !item.capSurface) item.direct = false;
    decorate(item);
  }
  const grouped = items.filter((item) => item.kind !== 'warning').reduce((all, item) => {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    (all[key] ??= []).push(item);
    return all;
  }, {});
  const duplicateGroups = Object.values(grouped).filter((group) => group.length > 1);
  const inventory = items.filter((item) => item.kind !== 'warning');
  const warnings = items.filter((item) => item.kind === 'warning');
  const direct = inventory.filter((item) => item.direct);
  const managed = inventory.filter((item) => !item.direct);
  const directTools = direct.reduce((sum, item) => sum + item.toolCount, 0);
  const contextTokens = direct.reduce((sum, item) => sum + item.contextTokens, 0);
  const capSurface = inventory.some((item) => item.capSurface);
  const capEntryTools = exposedCapTools(options).length;
  const migrateable = direct.filter((item) => item.kind === 'mcp' && !item.capSurface);
  const migrateableTools = migrateable.reduce((sum, item) => sum + item.toolCount, 0);
  const recommendations = migrateable
    .map((item) => ({provider: item.name, action: 'Move to CAP', source: item.source, estimatedTokensSaved: item.contextTokens}))
    .sort((a, b) => b.estimatedTokensSaved - a.estimatedTokensSaved);
  const reclaimableTokens = recommendations.reduce((sum, item) => sum + item.estimatedTokensSaved, 0);
  const budget = resolveBudget(options);
  const pressure = classifyPressure(contextTokens, budget.effectiveBudget);
  const funnel = buildFunnel({items, activity: state.activity});
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
      duplicateGroups: duplicateGroups.length,
      capSurface,
      registryCapabilities: state.managed_capabilities.length,
      capEntryTools,
      estimatedReductionPercent: migrateableTools > capEntryTools ? Math.round((1 - capEntryTools / migrateableTools) * 100) : 0
    },
    budget,
    pressure,
    funnel,
    items,
    duplicates: duplicateGroups.map((group) => ({name: group[0].name, sources: group.map((item) => item.source)})),
    recommendations
  };
}
