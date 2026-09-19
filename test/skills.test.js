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
import { discoverLocalSkills } from '../src/skills.js';
import { planInjection } from '../src/inject.js';
import { main } from '../src/cli.js';

const FIXTURE_SKILL = `---
name: draw-architecture
description: Draw architecture diagrams for software systems when the user wants a design picture.
---

# Architecture diagrams

Do not put this secret body in search results: UNIQUE_SKILL_BODY_MARKER
`;

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-skills-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  const skillDir = path.join(userHome, '.cursor', 'skills', 'draw-architecture');
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
  assert.ok(catalog.capabilities.some((item) => item.capability_id === 'skill.draw-architecture'));
  const capability = catalog.capabilities.find((item) => item.capability_id === 'skill.draw-architecture');
  const provider = catalog.providers.find((item) => item.provider_id === capability.provider_refs[0]);
  assert.equal(provider.capabilities.includes(capability.capability_id), true);
});

test('discover finds SKILL.md under Cursor skills', async (t) => {
  const ctx = await fixture(t);
  const skills = await discoverLocalSkills(ctx.options);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'draw-architecture');
  assert.match(skills[0].description, /architecture diagrams/i);
  assert.equal(skills[0].source, ctx.skillFile);
});

test('search 画架构图 hits a local architecture-diagram skill', async (t) => {
  const ctx = await fixture(t);
  const results = await searchCapabilities('画架构图', ctx.options);
  assert.ok(results.length > 0);
  assert.equal(results[0].capability_id, 'skill.draw-architecture');
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
  assert.equal(results[0].capability_id, 'skill.draw-architecture');
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
  assert.ok(report.items.some((item) => item.kind === 'skill' && item.name === 'draw-architecture'));
  const results = await searchCapabilities('画架构图', options);
  assert.equal(results[0].capability_id, 'skill.draw-architecture');
});

test('add and use surface the local skill path without the body', async (t) => {
  const ctx = await fixture(t);
  const added = await addCapability('skill.draw-architecture', undefined, ctx.options);
  assert.equal(added.capability.origin, 'local-skill');
  assert.equal(added.provider.type, 'Skill');
  assert.equal(added.provider.source, ctx.skillFile);
  const used = await useCapability('skill.draw-architecture', {}, ctx.options);
  assert.equal(used.status, 'completed');
  assert.equal(used.skill.path, ctx.skillFile);
  assert.match(used.skill.summary, /architecture diagrams/i);
  assert.equal(used.skill.body, undefined);
  assert.equal(JSON.stringify(used).includes('UNIQUE_SKILL_BODY_MARKER'), false);
  const withBody = await useCapability('skill.draw-architecture', {include_body: true}, ctx.options);
  assert.match(withBody.skill.body, /UNIQUE_SKILL_BODY_MARKER/);
});

test('use works from search overlay without a prior add', async (t) => {
  const ctx = await fixture(t);
  const used = await useCapability('skill.draw-architecture', {}, ctx.options);
  assert.equal(used.status, 'completed');
  assert.equal(used.skill.path, ctx.skillFile);
});

test('optimize preview and apply index local skills', async (t) => {
  const ctx = await fixture(t);
  const plan = await buildOptimizationPlan(ctx.options);
  assert.equal(plan.skills.discovered, 1);
  assert.equal(plan.skills.register[0].capability_id, 'skill.draw-architecture');
  assert.equal(plan.skills.register[0].source, ctx.skillFile);
  const applied = await applyOptimization(ctx.options);
  assert.equal(applied.skills.registered[0].capability_id, 'skill.draw-architecture');
  const state = await loadState(ctx.options);
  assert.equal(state.local_skills[0].name, 'draw-architecture');
  assert.equal(state.local_skills[0].source, ctx.skillFile);
});

test('registerLocalSkills persists the index used by setup/optimize', async (t) => {
  const ctx = await fixture(t);
  const result = await registerLocalSkills(ctx.options);
  assert.equal(result.discovered, 1);
  assert.equal(result.registered[0].capability_id, 'skill.draw-architecture');
  const state = await loadState(ctx.options);
  assert.equal(state.local_skills.length, 1);
});

test('inject loads the local skill for 画架构图', async (t) => {
  const ctx = await fixture(t);
  const plan = await planInjection('画架构图', ctx.options);
  assert.ok(plan.load.some((item) => item.capability_id === 'skill.draw-architecture'));
});

test('CLI search --json returns the local skill for 画架构图', async (t) => {
  const ctx = await fixture(t);
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['search', '画架构图', '--json'], ctx.options);
  const results = JSON.parse(logs.join('\n'));
  assert.equal(results[0].capability_id, 'skill.draw-architecture');
  assert.equal(JSON.stringify(results).includes('UNIQUE_SKILL_BODY_MARKER'), false);
});
