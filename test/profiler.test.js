import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProfiler, scoreValue, sessionKey, valuePerCost } from '../src/profiler.js';
import { inspectLocal, buildFunnel } from '../src/inspector.js';
import { addCapability, loadCatalog, loadState, saveState } from '../src/registry.js';
import { useCapability } from '../src/use.js';
import { inspectText } from '../src/cli.js';

test('scoreValue and valuePerCost are explainable', () => {
  assert.equal(scoreValue({successes: 0, sessions: 0, attempts: 0}), null);
  assert.equal(scoreValue({successes: 1, sessions: 1, attempts: 1}), 20);
  assert.equal(scoreValue({successes: 4, sessions: 2, attempts: 4}), 64);
  assert.equal(valuePerCost(20, 96), 0.208);
  assert.equal(valuePerCost(null, 96), null);
  assert.equal(sessionKey('2026-09-12T07:04:24.882Z'), '2026-09-12');
});

test('buildProfiler ranks used capabilities and marks underused', async () => {
  const catalog = await loadCatalog();
  const state = {
    managed_capabilities: ['git.repository.status', 'github.pr.review'],
    managed_providers: ['builtin.git', 'github.mcp'],
    activity: [
      {at: '2026-09-12T10:00:00.000Z', action: 'use', capability_id: 'git.repository.status', provider_id: 'builtin.git', success: true},
      {at: '2026-09-12T11:00:00.000Z', action: 'use', capability_id: 'git.repository.status', provider_id: 'builtin.git', success: true},
      {at: '2026-09-11T09:00:00.000Z', action: 'use', capability_id: 'git.repository.status', provider_id: 'builtin.git', success: true},
      {at: '2026-09-12T12:00:00.000Z', action: 'add', capability_id: 'github.pr.review', provider_id: 'github.mcp', success: true},
      {at: '2026-09-12T09:00:00.000Z', action: 'search', query: 'review github pr', hit_count: 1, hits: ['github.pr.review'], selected_id: 'github.pr.review', success: true},
      {at: '2026-09-12T09:00:01.000Z', action: 'select', capability_id: 'github.pr.review', query: 'review github pr', success: true}
    ]
  };
  const profiler = buildProfiler({catalog, state, items: []});
  assert.equal(profiler.version, 3);
  assert.equal(profiler.tracked, 2);
  assert.equal(profiler.used, 1);
  assert.equal(profiler.unusedManaged, 1);
  assert.equal(profiler.useAttempts, 3);
  assert.equal(profiler.searchEvents, 1);
  assert.equal(profiler.selectEvents, 1);
  assert.equal(profiler.frequencyVerdicts, false);
  const git = profiler.capabilities.find((item) => item.capability_id === 'git.repository.status');
  assert.equal(git.successes, 3);
  assert.equal(git.sessions, 2);
  assert.equal(git.value, 52);
  assert.equal(git.valuePerCost, valuePerCost(52, 96));
  assert.equal(profiler.ranked[0].capability_id, 'git.repository.status');
  assert.equal(profiler.underused[0].capability_id, 'github.pr.review');
});

test('funnel usedUnknown is false after failed use attempts', () => {
  const funnel = buildFunnel({
    items: [{kind: 'mcp', name: 'cap', direct: true}],
    activity: [
      {at: '2026-09-12T10:00:00.000Z', action: 'use', capability_id: 'github.pr.review', success: false, status: 'connection_required'}
    ]
  });
  assert.equal(funnel.used, 0);
  assert.equal(funnel.usedUnknown, false);
  assert.equal(funnel.useAttempts, 1);
});

test('inspectLocal attaches profiler and fills cost.value after use', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-profiler-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  await fs.mkdir(path.join(userHome, '.claude', 'skills', 'reviewer'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}, {name: 'comment_pr'}]}
  }}, null, 2));
  await fs.writeFile(path.join(userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: Review code\n---\n');
  const options = {
    userHome,
    projectRoot,
    home,
    jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']],
    skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  };

  await addCapability('git.repository.status', undefined, {home});
  await addCapability('github.pr.review', undefined, {
    home,
    userHome: path.join(root, 'no-mcp'),
    jsonConfigs: [],
    skillRoots: [],
    codexConfig: path.join(root, 'missing.toml')
  });
  const used = await useCapability('git.repository.status', {path: process.cwd()}, {home});
  assert.equal(used.status, 'completed');
  const blocked = await useCapability('github.pr.review', {}, {
    home,
    userHome: path.join(root, 'no-mcp'),
    jsonConfigs: [],
    skillRoots: [],
    codexConfig: path.join(root, 'missing.toml')
  });
  assert.equal(blocked.status, 'connection_required');

  const state = await loadState({home});
  assert.ok(state.activity.some((row) => row.action === 'use' && row.capability_id === 'github.pr.review' && row.success === false));

  const report = await inspectLocal(options);
  assert.ok(report.profiler);
  assert.equal(report.profiler.tracked, 2);
  assert.equal(report.profiler.used, 1);
  assert.equal(report.summary.profilerUsed, 1);
  assert.equal(report.funnel.used, 1);
  assert.equal(report.funnel.usedUnknown, false);
  assert.ok(report.funnel.useAttempts >= 2);

  const git = report.profiler.capabilities.find((item) => item.capability_id === 'git.repository.status');
  assert.ok(git.value > 0);
  assert.ok(git.valuePerCost > 0);

  const text = inspectText(report, options);
  assert.match(text, /价值分析/);
  assert.match(text, /git\.repository\.status/);
  assert.match(text, /性价比排行/);
  assert.match(text, /建议减负/);
  assert.match(text, /频率结论：未就绪/);
  assert.equal(report.profiler.frequencyVerdicts, false);
});

test('profiler leaves cost.value null without activity', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-profiler-empty-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  await fs.mkdir(path.join(userHome, '.claude', 'skills', 'reviewer'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}]}
  }}, null, 2));
  await fs.writeFile(path.join(userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: Review code\n---\n');
  const report = await inspectLocal({
    userHome,
    projectRoot,
    home,
    jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']],
    skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  });
  assert.equal(report.profiler.tracked, 0);
  assert.equal(report.funnel.usedUnknown, true);
  assert.equal(report.items.find((item) => item.name === 'github').cost.value, null);
});
