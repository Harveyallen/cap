import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  OBSERVATION_EVIDENCE_SESSION_DAYS,
  OBSERVATION_PERIOD_DAYS,
  assessObservation,
  buildProfiler,
  calendarDaysBetween,
  scoreValue,
  sessionKey,
  valuePerCost
} from '../src/profiler.js';
import { inspectLocal, buildFunnel } from '../src/inspector.js';
import { addCapability, loadCatalog, loadState, pushActivity, saveState } from '../src/registry.js';
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
  assert.equal(profiler.advice.length, 0);
  assert.equal(profiler.observation.ready, false);
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
  assert.match(text, /价值信号（Observation Period 未完成，不是移除建议）/);
  assert.match(text, /频率结论：未就绪/);
  assert.doesNotMatch(text, /建议减负|可考虑卸载/);
  assert.equal(report.profiler.frequencyVerdicts, false);
  assert.match(report.profiler.notes, /Frequency verdicts stay off until Observation Period readiness/);
  assert.equal(report.profiler.advice.length, 0);
  assert.equal(report.summary.observationReady, false);
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

const NOW = '2026-09-19T12:00:00.000Z';

function atDaysAgo(days, hour = '10:00:00.000Z') {
  const ms = Date.parse('2026-09-19T00:00:00.000Z') - days * 86_400_000;
  return `${new Date(ms).toISOString().slice(0, 10)}T${hour}`;
}

function observationState({startDaysAgo, sessionDaysAgo, extra = []}) {
  const start = atDaysAgo(startDaysAgo);
  const activity = [
    {at: start, action: 'add', capability_id: 'github.pr.review', provider_id: 'github.mcp', success: true},
    ...sessionDaysAgo.map((days) => ({
      at: atDaysAgo(days),
      action: 'search',
      query: 'review github pr',
      hit_count: 1,
      hits: ['github.pr.review'],
      success: true
    })),
    ...extra
  ];
  return {
    version: 1,
    managed_capabilities: ['git.repository.status', 'github.pr.review'],
    managed_providers: ['builtin.git', 'github.mcp'],
    external_providers: [],
    mcp_bindings: {},
    observation_started_at: start,
    activity
  };
}

test('calendar day math and default readiness constants', () => {
  assert.equal(OBSERVATION_PERIOD_DAYS, 14);
  assert.equal(OBSERVATION_EVIDENCE_SESSION_DAYS, 3);
  assert.equal(calendarDaysBetween('2026-09-05T23:00:00.000Z', '2026-09-19T01:00:00.000Z'), 14);
});

test('observation is not ready without activity, duration, or evidence', () => {
  assert.deepEqual(assessObservation({activity: []}, {now: NOW}).reasons, ['no_activity']);
  const short = assessObservation(observationState({startDaysAgo: 13, sessionDaysAgo: [13, 7, 0]}), {now: NOW});
  assert.equal(short.ready, false);
  assert.ok(short.reasons.includes('duration_unmet'));
  const thin = assessObservation(observationState({startDaysAgo: 14, sessionDaysAgo: [14, 0]}), {now: NOW});
  assert.equal(thin.ready, false);
  assert.ok(thin.reasons.includes('evidence_unmet'));
  const ready = assessObservation(observationState({startDaysAgo: 14, sessionDaysAgo: [14, 7, 0]}), {now: NOW});
  assert.equal(ready.ready, true);
  assert.equal(ready.frequencyVerdicts, true);
  assert.equal(ready.elapsedDays, 14);
  assert.equal(ready.evidenceSessionDays, 3);
});

test('before readiness low-frequency never becomes a remove recommendation', async () => {
  const catalog = await loadCatalog();
  const state = observationState({startDaysAgo: 13, sessionDaysAgo: [13, 7, 0]});
  const profiler = buildProfiler({catalog, state, now: NOW});
  assert.equal(profiler.frequencyVerdicts, false);
  assert.equal(profiler.advice.length, 0);
  assert.equal(profiler.underused[0].capability_id, 'github.pr.review');
  assert.equal(profiler.underused[0].frequency, undefined);
  assert.match(profiler.notes, /do not recommend removal/);
  assert.doesNotMatch(JSON.stringify(profiler), /"action":"remove"|卸载|unused → remove|unused->remove/);
});

test('after readiness advice separates signals and never says remove', async () => {
  const catalog = await loadCatalog();
  const state = observationState({
    startDaysAgo: 14,
    sessionDaysAgo: [14, 7, 0],
    extra: [
      {at: atDaysAgo(1), action: 'use', capability_id: 'git.repository.status', provider_id: 'builtin.git', success: true}
    ]
  });
  const profiler = buildProfiler({
    catalog,
    state,
    now: NOW,
    duplicates: [{name: 'github', sources: ['~/.claude.json', '.mcp.json']}]
  });
  assert.equal(profiler.frequencyVerdicts, true);
  assert.equal(profiler.observation.ready, true);
  const git = profiler.capabilities.find((item) => item.capability_id === 'git.repository.status');
  assert.ok(git.value > 0);
  assert.ok(!profiler.advice.some((item) => item.capability_id === 'git.repository.status' && item.frequency === 'low'));
  const unused = profiler.advice.find((item) => item.capability_id === 'github.pr.review');
  assert.ok(unused);
  assert.equal(unused.frequency, 'low');
  assert.equal(unused.action, 'prefer_on_demand');
  assert.equal(unused.signals.cost.contextCost, 860);
  assert.equal(unused.signals.cost.estimated, true);
  assert.equal(unused.signals.duplication.duplicate, true);
  assert.equal(unused.signals.usage.successes, 0);
  assert.equal(unused.signals.usage.unused, true);
  assert.equal(unused.signals.recency.neverUsed, true);
  assert.ok(unused.signals.cost && unused.signals.duplication && unused.signals.usage && unused.signals.recency);
  for (const item of profiler.advice) {
    assert.notEqual(item.action, 'remove');
    assert.equal(item.action, 'prefer_on_demand');
  }
  assert.match(profiler.notes, /never unused→remove/);
  assert.doesNotMatch(JSON.stringify(profiler.advice), /remove|uninstall|卸载/);
});

test('search-only evidence does not create value scores but can unlock frequency advice', async () => {
  const catalog = await loadCatalog();
  const state = observationState({startDaysAgo: 14, sessionDaysAgo: [14, 7, 0]});
  const profiler = buildProfiler({catalog, state, now: NOW});
  const unused = profiler.capabilities.find((item) => item.capability_id === 'github.pr.review');
  assert.equal(unused.value, null);
  assert.equal(profiler.frequencyVerdicts, true);
  const advice = profiler.advice.find((item) => item.capability_id === 'github.pr.review');
  assert.equal(advice.frequency, 'low');
  assert.equal(advice.action, 'prefer_on_demand');
});

test('inspect/Web path shows post-readiness advice and keeps day-one copy off remove', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-observe-ready-'));
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
  const state = observationState({
    startDaysAgo: 14,
    sessionDaysAgo: [14, 7, 0],
    extra: [
      {at: atDaysAgo(0), action: 'use', capability_id: 'github.pr.review', provider_id: 'github.mcp', success: false, status: 'connection_required'}
    ]
  });
  await saveState(state, {home});
  const report = await inspectLocal({
    userHome,
    projectRoot,
    home,
    now: NOW,
    jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']],
    skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  });
  assert.equal(report.profiler.frequencyVerdicts, true);
  assert.equal(report.summary.observationReady, true);
  const advice = report.profiler.advice.find((item) => item.capability_id === 'github.pr.review');
  assert.ok(advice);
  assert.equal(advice.frequency, 'low');
  assert.equal(advice.action, 'prefer_on_demand');
  const text = inspectText(report, {userHome, projectRoot});
  assert.match(text, /频率结论：已就绪/);
  assert.match(text, /频率 \/ 价值建议（信号分列，不是移除建议）/);
  assert.match(text, /低频/);
  assert.match(text, /成本 ~/);
  assert.match(text, /重复 /);
  assert.match(text, /用量 /);
  assert.match(text, /近况 /);
  assert.doesNotMatch(text, /建议减负|可考虑卸载|建议移除|建议卸载/);
});

test('pushActivity persists observation_started_at across the activity cap', () => {
  const state = {activity: []};
  pushActivity(state, {at: '2026-08-01T08:00:00.000Z', action: 'search', query: 'git status', hit_count: 0, hits: [], success: true});
  assert.equal(state.observation_started_at, '2026-08-01T08:00:00.000Z');
  for (let i = 0; i < 120; i += 1) {
    pushActivity(state, {at: `2026-09-19T12:00:${String(i % 60).padStart(2, '0')}.000Z`, action: 'search', query: `q${i}`, hit_count: 0, hits: [], success: true});
  }
  assert.equal(state.observation_started_at, '2026-08-01T08:00:00.000Z');
  assert.equal(state.activity.length, 100);
});
