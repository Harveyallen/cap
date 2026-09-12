import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyPressure, estimateTokens, inspectLocal, resolveBudget } from '../src/inspector.js';
import { applyOptimization } from '../src/optimize.js';
import { compactTokens, inspectText, main } from '../src/cli.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-inspect-'));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const stateHome = path.join(root, 'state');
  await fs.mkdir(path.join(userHome, '.claude', 'skills', 'reviewer'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}, {name: 'comment_pr'}]},
    postgres: {command: 'postgres-mcp', toolCount: 12}
  }}, null, 2));
  await fs.writeFile(path.join(userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: Review code\n---\n');
  return {root, userHome, projectRoot, home: stateHome, jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']], skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']], codexConfig: path.join(root, 'missing.toml')};
}

test('inspect counts MCP tools, skills, and context', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await inspectLocal({...options, env: {}});
  assert.equal(result.summary.mcpServers, 2);
  assert.equal(result.summary.skills, 1);
  assert.equal(result.summary.directTools, 14);
  assert.equal(result.recommendations.length, 2);
  assert.ok(result.summary.contextTokens > 0);
  assert.equal(result.summary.warnings, 0);
  assert.equal(result.summary.managed, 0);
  assert.ok(result.summary.reclaimableTokens > 0);
  assert.ok(result.budget.nominalWindow > 0);
  assert.ok(result.budget.effectiveBudget > 0);
  assert.equal(result.budget.nominalWindow, 200000);
  assert.equal(result.budget.effectiveBudget, 168000);
  assert.equal(result.pressure.injectedTokens, result.summary.contextTokens);
  assert.equal(result.pressure.band, 'healthy');
  assert.ok(result.pressure.healthScore > 90);
  assert.equal(result.funnel.installed, 3);
  assert.equal(result.funnel.enabled, 3);
  assert.equal(result.funnel.injected, 3);
  assert.equal(result.funnel.used, 0);
  assert.equal(result.funnel.usedUnknown, true);
  const github = result.items.find((item) => item.name === 'github');
  assert.equal(github.status, 'direct');
  assert.ok(github.cost.totalTokens > 0);
  assert.equal(github.cost.estimated, true);
  assert.equal(github.cost.value, null);
  const postgres = result.items.find((item) => item.name === 'postgres');
  assert.equal(postgres.toolCount, 12);
  assert.equal(result.recommendations[0].estimatedTokensSaved >= result.recommendations[1].estimatedTokensSaved, true);
});

test('budget env overrides and pressure bands', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const tight = await inspectLocal({...options, env: {CAP_NOMINAL_WINDOW: '1000000', CAP_EFFECTIVE_BUDGET: '1'}});
  assert.equal(tight.budget.nominalWindow, 1_000_000);
  assert.equal(tight.budget.effectiveBudget, 1);
  assert.ok(tight.pressure.percent >= 85);
  assert.equal(tight.pressure.band, 'emergency');
  assert.equal(tight.pressure.healthScore, 0);
  assert.equal(resolveBudget({nominalWindow: 200000, harnessSoftLimit: 200000, reserveTokens: 32000, env: {}}).effectiveBudget, 168000);
  assert.equal(classifyPressure(0, 168000).band, 'healthy');
  assert.equal(classifyPressure(50_400, 168000).band, 'moderate');
  assert.equal(classifyPressure(84_000, 168000).band, 'high');
  assert.equal(classifyPressure(117_600, 168000).band, 'critical');
  assert.equal(classifyPressure(142_800, 168000).band, 'emergency');
  assert.equal(classifyPressure(100, 0).band, 'unknown');
  assert.equal(classifyPressure(0, 0).band, 'unknown');
  assert.equal(classifyPressure(50, -1).band, 'unknown');
  const zeroBudget = await inspectLocal({...options, env: {CAP_EFFECTIVE_BUDGET: '0'}});
  assert.equal(zeroBudget.pressure.band, 'unknown');
  assert.equal(zeroBudget.pressure.healthScore, 0);
});

test('skill body is on-demand and excluded from injected tokens', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const body = `${'On-demand instruction body. '.repeat(80)}\n`;
  await fs.writeFile(path.join(options.userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), `---\nname: reviewer\ndescription: Review code\n---\n${body}`);
  const result = await inspectLocal({...options, env: {}});
  const skill = result.items.find((item) => item.name === 'reviewer');
  const identity = estimateTokens('reviewer\nReview code');
  assert.equal(skill.contextTokens, identity);
  assert.equal(skill.cost.descriptionTokens, identity);
  assert.equal(skill.cost.instructionOnDemand, true);
  assert.ok(skill.cost.instructionTokens > identity);
  assert.equal(skill.cost.instructionTokens, estimateTokens(body));
  assert.equal(skill.cost.totalTokens, skill.cost.descriptionTokens + skill.cost.instructionTokens);
  assert.equal(result.pressure.injectedTokens, result.summary.contextTokens);
  const injected = result.items.filter((item) => item.direct).reduce((sum, item) => sum + item.contextTokens, 0);
  assert.equal(result.summary.contextTokens, injected);
  assert.ok(result.summary.contextTokens < injected + skill.cost.instructionTokens);
  assert.ok(result.summary.contextTokens < skill.cost.totalTokens + result.items.filter((item) => item.name !== 'reviewer' && item.direct).reduce((sum, item) => sum + item.contextTokens, 0));
});

test('funnel.installed is local scan names, not seed catalog', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await inspectLocal({...options, env: {}});
  const local = new Set(result.items.filter((item) => item.kind !== 'warning').map((item) => item.name.toLowerCase()));
  assert.equal(result.funnel.installed, local.size);
  assert.equal(result.funnel.installed, 3);
  assert.equal(local.has('builtin.git'), false);
  assert.equal(local.has('pdf.skill'), false);
});

test('CLI inspect prints Context Health sections', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const report = await inspectLocal(options);
  const text = inspectText(report, options);
  assert.match(text, /CAP Inspect · /);
  assert.match(text, /Pressure\s+Healthy/);
  assert.match(text, /Funnel\s+\d+ local installed → 3 enabled → 3 injected → used unknown/);
  assert.match(text, /建议迁移/);
  assert.match(text, /MCP \/ Skills（Claude Code）/);
  assert.match(text, /tip: cap optimize/);
  assert.equal(compactTokens(37800), '~37.8k');
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['inspect'], options);
  assert.match(logs.join('\n'), /3 CAP entry tools/);
});

test('optimize backs up JSON config and moves providers into CAP state', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await applyOptimization(options);
  assert.equal(result.changed.length, 1);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(config.mcpServers, {});
  await fs.access(result.changed[0].backup);
  const state = JSON.parse(await fs.readFile(path.join(options.home, 'registry.json'), 'utf8'));
  assert.deepEqual(state.external_providers.map((item) => item.name).sort(), ['github', 'postgres']);
});
