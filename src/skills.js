/** Discover local Agent SKILL.md files and map them to catalog capabilities. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

const TOKEN_CHARS = 4;
const MAX_WALK_DEPTH = 3;

function estimateTokens(value) {
  if (value == null || value === '') return 0;
  return Math.ceil(String(value).length / TOKEN_CHARS);
}

function unique(values) {
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

export function defaultSkillRoots(home, project) {
  return [
    [path.join(home, '.claude', 'skills'), 'Claude Code'],
    [path.join(home, '.codex', 'skills'), 'Codex'],
    [path.join(home, '.cursor', 'skills'), 'Cursor'],
    [path.join(home, '.agents', 'skills'), 'Shared'],
    [path.join(project, '.claude', 'skills'), 'Claude Code'],
    [path.join(project, '.codex', 'skills'), 'Codex'],
    [path.join(project, '.cursor', 'skills'), 'Cursor'],
    [path.join(project, '.agents', 'skills'), 'Shared']
  ];
}

export function parseSkillMarkdown(text, options = {}) {
  const raw = String(text ?? '');
  const fence = raw.match(/^---\n([\s\S]*?)\n---/);
  const fields = {};
  let current = null;
  for (const line of (fence?.[1] ?? '').split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      current = pair[1];
      let value = pair[2];
      if (value === '>' || value === '|' || value === '>-' || value === '|-') value = '';
      else value = value.replace(/^['"]|['"]$/g, '');
      fields[current] = value;
      continue;
    }
    if (current && /^\s+/.test(line)) {
      const extra = line.trim().replace(/^['"]|['"]$/g, '');
      fields[current] = [fields[current], extra].filter(Boolean).join(' ');
    }
  }
  const name = String(fields.name ?? options.nameFallback ?? '').trim();
  const description = String(fields.description ?? '').trim();
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return {name, description, body, fields};
}

export function skillSearchTerms({name, description, folder} = {}) {
  const blobs = [name, description, folder].filter(Boolean).map(String);
  const text = blobs.join(' ');
  const terms = new Set();
  for (const blob of blobs) {
    const trimmed = blob.trim();
    if (trimmed.length >= 2) terms.add(trimmed.toLowerCase());
  }
  for (const token of text.toLocaleLowerCase().match(/[\p{L}\p{N}_.+-]+/gu) ?? []) {
    if (token.length >= 2) terms.add(token);
  }
  for (const han of text.match(/\p{Script=Han}{2,}/gu) ?? []) {
    terms.add(han);
    if (han.length < 3) continue;
    for (let i = 0; i <= han.length - 2; i += 1) {
      terms.add(han.slice(i, i + 2));
      if (i + 3 <= han.length) terms.add(han.slice(i, i + 3));
    }
  }
  const hay = text.toLowerCase();
  if (/\barchitect(?:ure|ural)?s?\b|\bdiagrams?\b/.test(hay) || /架构图|画架构图/.test(text)) {
    for (const extra of ['architecture', 'diagram', 'architecture diagram', '架构图', '画架构图', '架构']) {
      terms.add(extra);
    }
  }
  return [...terms];
}

function slugify(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function shortHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

export function skillIds(skill, taken = {}) {
  const caps = taken.caps ?? taken.capabilities ?? new Set();
  const provs = taken.provs ?? taken.providers ?? new Set();
  const base = slugify(skill.folder) || slugify(skill.name) || `local-${shortHash(skill.source ?? skill.name)}`;
  let id = `skill.${base}`;
  if (caps.has(id) || provs.has(id)) id = `skill.${base}.${shortHash(skill.source ?? id)}`;
  return {capability_id: id, provider_id: id};
}

export function catalogEntriesForSkill(skill, taken = {}) {
  const {capability_id, provider_id} = skillIds(skill, taken);
  const terms = skillSearchTerms(skill);
  const summary = (skill.description || `Local Agent skill ${skill.name}`).trim();
  const capability = {
    capability_id,
    name: skill.name,
    summary: summary.slice(0, 240),
    intents: unique([skill.name, skill.description, ...terms]).slice(0, 24),
    keywords: unique(terms).slice(0, 32),
    inputs: {include_body: 'boolean'},
    outputs: {name: 'string', summary: 'string', path: 'path'},
    context_cost: Math.max(1, estimateTokens([skill.name, skill.description].filter(Boolean).join('\n'))),
    risk: 'low',
    permissions: ['read local skill'],
    provider_refs: [provider_id],
    origin: 'local-skill',
    skill_path: skill.source
  };
  const provider = {
    provider_id,
    name: skill.name,
    type: 'Skill',
    source: skill.source,
    version: 'local',
    maintenance: 'local',
    trust: 'local',
    status: 'Discovered',
    capabilities: [capability_id]
  };
  return {capability, provider};
}

export function overlayLocalSkills(catalog, skills = []) {
  const capabilities = [...(catalog.capabilities ?? [])];
  const providers = [...(catalog.providers ?? [])];
  const takenCaps = new Set(capabilities.map((item) => item.capability_id));
  const takenProvs = new Set(providers.map((item) => item.provider_id));
  const seenNames = new Set();
  const local = [];
  for (const skill of skills) {
    const nameKey = String(skill.name ?? '').toLowerCase();
    if (!nameKey || seenNames.has(nameKey)) continue;
    const {capability, provider} = catalogEntriesForSkill(skill, {caps: takenCaps, provs: takenProvs});
    if (takenCaps.has(capability.capability_id) || takenProvs.has(provider.provider_id)) continue;
    seenNames.add(nameKey);
    takenCaps.add(capability.capability_id);
    takenProvs.add(provider.provider_id);
    capabilities.push(capability);
    providers.push(provider);
    local.push(capability);
  }
  return {capabilities, providers, local};
}

export async function walkSkillFiles(root, agent, options = {}) {
  const includeBody = options.includeBody !== false;
  const maxDepth = options.maxDepth ?? MAX_WALK_DEPTH;
  return walkSkillTree(root, agent, 0, {includeBody, maxDepth});
}

async function walkSkillTree(root, agent, depth, options) {
  let entries;
  try {
    entries = await fs.readdir(root, {withFileTypes: true});
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const skills = [];
  let foundHere = false;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name !== 'SKILL.md') continue;
    foundHere = true;
    const file = path.join(root, entry.name);
    const text = await fs.readFile(file, 'utf8');
    const parsed = parseSkillMarkdown(text, {nameFallback: path.basename(root)});
    skills.push({
      name: parsed.name || path.basename(root),
      description: parsed.description,
      folder: path.basename(root),
      source: file,
      agent,
      ...(options.includeBody ? {body: parsed.body} : {})
    });
  }
  if (foundHere || depth >= options.maxDepth) return skills;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    skills.push(...await walkSkillTree(path.join(root, entry.name), agent, depth + 1, options));
  }
  return skills;
}

export async function discoverLocalSkills(options = {}) {
  const home = options.userHome ?? os.homedir();
  const project = path.resolve(options.projectRoot ?? process.cwd());
  const skillRoots = options.skillRoots ?? defaultSkillRoots(home, project);
  const batches = await Promise.all(skillRoots.map(([root, agent]) => walkSkillFiles(root, agent, {
    includeBody: options.includeBody === true,
    maxDepth: options.maxDepth
  })));
  return batches.flat();
}
