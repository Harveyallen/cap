import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchCapabilities } from '../src/search.js';
import { addCapability, loadEffectiveCatalog, loadState, registerLocalSkills } from '../src/registry.js';
import { validateCatalog } from '../src/catalog-schema.js';
import { useCapability } from '../src/use.js';
import { applyOptimization, buildOptimizationPlan } from '../src/optimize.js';
import { inspectLocal } from '../src/inspector.js';
import { discoverLocalSkills, isDiagramSkillText } from '../src/skills.js';
import { planInjection } from '../src/inject.js';
import { main } from '../src/cli.js';

const FIXTURE_SKILL = `---
name: system-blueprint
description: Draw architecture diagrams for software systems when the user wants a design picture.
---

# Architecture diagrams

Do not put this secret body in search results: UNIQUE_SKILL_BODY_MARKER
`;

const ARCHITECT_SKILL = `---
name: architect
description: Sketch types, signatures, and module structure before code. Use for /architect or design this.
---

# Architect
`;

const IMPROVE_ARCH_SKILL = `---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
---

# Improve Codebase Architecture
`;

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-skills-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  const skillDir = path.join(userHome, '.cursor', 'skills', 'system-blueprint');
  await fs.mkdir(skillDir, {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  const skillFile = path.join(skillDir, 'SKILL.md');
  await fs.writeFile(skillFile, FIXTURE_SKILL);
  const skillRoots = [[path.join(userHome, '.cursor', 'skills'), 'Cursor']];
  return {
    root,
    userHome,
    projectRoot,
    home,
    skillFile,
    skillRoots,
    options: {
      home,
      userHome,
      projectRoot,
      skillRoots,
      jsonConfigs: [],
      codexConfig: path.join(root, 'missing.toml'),
      env: {}
    }
  };
}

test('effective catalog overlay stays schema-valid', async (t) => {
  const ctx = await fixture(t);
  const catalog = await loadEffectiveCatalog(ctx.options);
  const schema = JSON.parse(await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalog.schema.json'), 'utf8'));
  validateCatalog(catalog, schema);
  assert.ok(catalog.capabilities.some((item) => item.capability_id === 'skill.system-blueprint'));
  const capability = catalog.capabilities.find((item) => item.capability_id === 'skill.system-blueprint');
  const provider = catalog.providers.find((item) => item.provider_id === capability.provider_refs[0]);
  assert.equal(provider.capabilities.includes(capability.capability_id), true);
});

test('discover finds SKILL.md under Cursor skills', async (t) => {
  const ctx = await fixture(t);
  const skills = await discoverLocalSkills(ctx.options);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'system-blueprint');
  assert.match(skills[0].description, /architecture diagrams/i);
  assert.equal(skills[0].source, ctx.skillFile);
});

test('search 画架构图 hits a local architecture-diagram skill', async (t) => {
  const ctx = await fixture(t);
  const results = await searchCapabilities('画架构图', ctx.options);
  assert.ok(results.length > 0);
  assert.equal(results[0].capability_id, 'skill.system-blueprint');
  assert.equal(results[0].origin, 'local-skill');
  assert.equal(results[0].skill_path, ctx.skillFile);
  assert.match(results[0].summary, /architecture diagrams/i);
  assert.equal(JSON.stringify(results).includes('UNIQUE_SKILL_BODY_MARKER'), false);
  assert.equal(results[0].input_schema.properties.include_body.type, 'boolean');
  assert.equal(results[0].input_schema.required, undefined);
});

test('English architecture-diagram phrasing also ranks the local skill', async (t) => {
  const ctx = await fixture(t);
  const results = await searchCapabilities('draw architecture diagrams', ctx.options);
  assert.equal(results[0].capability_id, 'skill.system-blueprint');
});

test('search 架构图 also hits a description-only diagram skill', async (t) => {
  const ctx = await fixture(t);
  const results = await searchCapabilities('架构图', ctx.options);
  assert.equal(results[0].capability_id, 'skill.system-blueprint');
});

test('default Cursor skill root is scanned without an explicit skillRoots override', async (t) => {
  const ctx = await fixture(t);
  const options = {
    home: ctx.home,
    userHome: ctx.userHome,
    projectRoot: ctx.projectRoot,
    jsonConfigs: [],
    codexConfig: path.join(ctx.root, 'missing.toml'),
    env: {}
  };
  const report = await inspectLocal(options);
  assert.ok(report.items.some((item) => item.kind === 'skill' && item.name === 'system-blueprint'));
  const results = await searchCapabilities('画架构图', options);
  assert.equal(results[0].capability_id, 'skill.system-blueprint');
});

test('add and use surface the local skill path without the body', async (t) => {
  const ctx = await fixture(t);
  const added = await addCapability('skill.system-blueprint', undefined, ctx.options);
  assert.equal(added.capability.origin, 'local-skill');
  assert.equal(added.provider.type, 'Skill');
  assert.equal(added.provider.source, ctx.skillFile);
  const used = await useCapability('skill.system-blueprint', {}, ctx.options);
  assert.equal(used.status, 'completed');
  assert.equal(used.skill.path, ctx.skillFile);
  assert.match(used.skill.summary, /architecture diagrams/i);
  assert.equal(used.skill.body, undefined);
  assert.equal(JSON.stringify(used).includes('UNIQUE_SKILL_BODY_MARKER'), false);
  const withBody = await useCapability('skill.system-blueprint', {include_body: true}, ctx.options);
  assert.match(withBody.skill.body, /UNIQUE_SKILL_BODY_MARKER/);
});

test('use works from search overlay without a prior add', async (t) => {
  const ctx = await fixture(t);
  const used = await useCapability('skill.system-blueprint', {}, ctx.options);
  assert.equal(used.status, 'completed');
  assert.equal(used.skill.path, ctx.skillFile);
  const state = await loadState(ctx.options);
  assert.ok(state.managed_capabilities.includes('skill.system-blueprint'));
  assert.ok(state.activity.some((row) => row.action === 'add' && row.capability_id === 'skill.system-blueprint'));
});

test('optimize preview and apply index local skills', async (t) => {
  const ctx = await fixture(t);
  const plan = await buildOptimizationPlan(ctx.options);
  assert.equal(plan.skills.discovered, 1);
  assert.equal(plan.skills.register[0].capability_id, 'skill.system-blueprint');
  assert.equal(plan.skills.register[0].source, ctx.skillFile);
  const applied = await applyOptimization(ctx.options);
  assert.equal(applied.skills.registered[0].capability_id, 'skill.system-blueprint');
  const state = await loadState(ctx.options);
  assert.equal(state.local_skills[0].name, 'system-blueprint');
  assert.equal(state.local_skills[0].source, ctx.skillFile);
});

test('registerLocalSkills persists the index used by setup/optimize', async (t) => {
  const ctx = await fixture(t);
  const result = await registerLocalSkills(ctx.options);
  assert.equal(result.discovered, 1);
  assert.equal(result.registered[0].capability_id, 'skill.system-blueprint');
  const state = await loadState(ctx.options);
  assert.equal(state.local_skills.length, 1);
});

test('inject loads the local skill for 画架构图', async (t) => {
  const ctx = await fixture(t);
  const plan = await planInjection('画架构图', ctx.options);
  assert.ok(plan.load.some((item) => item.capability_id === 'skill.system-blueprint'));
});

test('CLI search --json returns the local skill for 画架构图', async (t) => {
  const ctx = await fixture(t);
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['search', '画架构图', '--json'], ctx.options);
  const results = JSON.parse(logs.join('\n'));
  assert.equal(results[0].capability_id, 'skill.system-blueprint');
  assert.equal(JSON.stringify(results).includes('UNIQUE_SKILL_BODY_MARKER'), false);
});

test('diagram alias is description-based, not a hardcoded skill name', () => {
  assert.equal(isDiagramSkillText('Draw architecture diagrams for software systems'), true);
  assert.equal(isDiagramSkillText('画架构图 / mermaid C4'), true);
  assert.equal(isDiagramSkillText('Sketch types, signatures, and module structure before code. Use for /architect'), false);
  assert.equal(isDiagramSkillText('Scan a codebase for deepening opportunities, present them as a visual HTML report'), false);
  assert.equal(isDiagramSkillText('improve-codebase-architecture'), false);
});

test('project .agents/skills are searchable by their own text, not 画架构图', async (t) => {
  const ctx = await fixture(t);
  const skillDir = path.join(ctx.projectRoot, '.agents', 'skills', 'improve-codebase-architecture');
  await fs.mkdir(skillDir, {recursive: true});
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), IMPROVE_ARCH_SKILL);
  const options = {
    home: ctx.home,
    userHome: path.join(ctx.root, 'empty-user'),
    projectRoot: ctx.projectRoot,
    jsonConfigs: [],
    codexConfig: path.join(ctx.root, 'missing.toml'),
    env: {}
  };
  const hits = await searchCapabilities('deepening opportunities visual HTML report', options);
  assert.equal(hits[0].capability_id, 'skill.improve-codebase-architecture');
  const diagram = await searchCapabilities('画架构图', options);
  assert.equal(diagram.some((item) => item.capability_id === 'skill.improve-codebase-architecture'), false);
});

test('Cursor plugin cache SKILL.md is discovered without a hardcoded name', async (t) => {
  const ctx = await fixture(t);
  const pluginSkill = path.join(
    ctx.userHome, '.cursor', 'plugins', 'cache', 'cursor-public', '9717366', 'deadbeef', 'skills', 'whiteboard-arch'
  );
  await fs.mkdir(pluginSkill, {recursive: true});
  const file = path.join(pluginSkill, 'SKILL.md');
  await fs.writeFile(file, `---
name: whiteboard-arch
description: 画架构图 with Mermaid when reviewing a service map.
---

# Whiteboard
`);
  const options = {
    home: ctx.home,
    userHome: ctx.userHome,
    projectRoot: path.join(ctx.root, 'empty-project'),
    jsonConfigs: [],
    codexConfig: path.join(ctx.root, 'missing.toml'),
    env: {}
  };
  const skills = await discoverLocalSkills(options);
  assert.ok(skills.some((item) => item.name === 'whiteboard-arch' && item.source === file));
  const results = await searchCapabilities('架构图', options);
  assert.ok(results.some((item) => item.capability_id === 'skill.whiteboard-arch'));
});

test('pstack-style architect skill is not a 画架构图 hit', async (t) => {
  const ctx = await fixture(t);
  const skillDir = path.join(ctx.userHome, '.cursor', 'plugins', 'cache', 'cursor-public', '1', 'abc', 'skills', 'architect');
  await fs.mkdir(skillDir, {recursive: true});
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), ARCHITECT_SKILL);
  const options = {
    home: ctx.home,
    userHome: ctx.userHome,
    projectRoot: path.join(ctx.root, 'empty-project'),
    jsonConfigs: [],
    codexConfig: path.join(ctx.root, 'missing.toml'),
    env: {}
  };
  const byName = await searchCapabilities('architect this design', options);
  assert.ok(byName.some((item) => item.capability_id === 'skill.architect'));
  const diagram = await searchCapabilities('画架构图', options);
  assert.equal(diagram.some((item) => item.capability_id === 'skill.architect'), false);
  const short = await searchCapabilities('架构图', options);
  assert.equal(short.some((item) => item.capability_id === 'skill.architect'), false);
});
