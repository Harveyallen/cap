import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadState } from './registry.js';

const TOKEN_CHARS = 4;

function estimateTokens(value) {
  return Math.ceil((typeof value === 'string' ? value.length : JSON.stringify(value).length) / TOKEN_CHARS);
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

async function inspectJsonConfig(file, agent) {
  const value = await readJson(file);
  if (!value) return [];
  if (value.__parseError) return [{kind: 'warning', agent, source: file, message: value.__parseError}];
  return serverEntries(value).map(([name, config]) => {
    const schemas = config.tools ?? config.toolSchemas ?? config.schemas ?? [];
    const explicitCount = Array.isArray(schemas) ? schemas.length : Object.keys(schemas).length;
    return {
      kind: 'mcp', agent, name, source: file, direct: true,
      toolCount: explicitCount || Number(config.toolCount) || 1,
      toolCountEstimated: !explicitCount && !config.toolCount,
      contextTokens: estimateTokens(explicitCount ? schemas : config),
      fingerprint: JSON.stringify({command: config.command, args: config.args, url: config.url})
    };
  });
}

async function inspectCodexToml(file) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const headers = [...text.matchAll(/^\[mcp_servers\.(["']?)([^\]"']+)\1\]\s*$/gm)];
  return headers.map((match, index) => {
    const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(match.index, end);
    return {kind: 'mcp', agent: 'Codex', name: match[2], source: file, direct: true, toolCount: 1, toolCountEstimated: true, contextTokens: estimateTokens(block), fingerprint: block.replace(/\s+/g, ' ')};
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
      const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? entry.name;
      skills.push({kind: 'skill', agent, name, source: file, direct: true, toolCount: 0, contextTokens: estimateTokens(frontmatter), fingerprint: `${name.toLowerCase()}:${estimateTokens(frontmatter)}`});
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
    [path.join(project, '.mcp.json'), 'Claude Code']
  ];
  const skillRoots = options.skillRoots ?? [
    [path.join(home, '.claude', 'skills'), 'Claude Code'],
    [path.join(home, '.codex', 'skills'), 'Codex'],
    [path.join(project, '.claude', 'skills'), 'Claude Code'],
    [path.join(project, '.codex', 'skills'), 'Codex'],
    [path.join(project, '.agents', 'skills'), 'Shared']
  ];
  const batches = await Promise.all([
    ...jsonConfigs.map(([file, agent]) => inspectJsonConfig(file, agent)),
    inspectCodexToml(options.codexConfig ?? path.join(home, '.codex', 'config.toml')),
    ...skillRoots.map(([root, agent]) => walkSkills(root, agent))
  ]);
  const items = batches.flat();
  const state = await loadState(options);
  const managedNames = new Set(state.external_providers.map((item) => item.name));
  for (const item of items) if (managedNames.has(item.name)) item.direct = false;
  const grouped = items.filter((item) => item.kind !== 'warning').reduce((all, item) => {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    (all[key] ??= []).push(item);
    return all;
  }, {});
  const duplicateGroups = Object.values(grouped).filter((group) => group.length > 1);
  const direct = items.filter((item) => item.direct);
  const directTools = direct.reduce((sum, item) => sum + item.toolCount, 0);
  const contextTokens = direct.reduce((sum, item) => sum + item.contextTokens, 0);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      mcpServers: items.filter((item) => item.kind === 'mcp').length,
      skills: items.filter((item) => item.kind === 'skill').length,
      providers: items.filter((item) => item.kind !== 'warning').length,
      directTools,
      contextTokens,
      duplicateGroups: duplicateGroups.length,
      capEntryTools: 3,
      estimatedReductionPercent: directTools > 3 ? Math.round((1 - 3 / directTools) * 100) : 0
    },
    items,
    duplicates: duplicateGroups.map((group) => ({name: group[0].name, sources: group.map((item) => item.source)})),
    recommendations: direct.filter((item) => item.kind === 'mcp').map((item) => ({provider: item.name, action: 'Move to CAP', source: item.source, estimatedTokensSaved: item.contextTokens}))
  };
}
