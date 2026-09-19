import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { inspectLocal } from '../src/inspector.js';
import { addCapability, loadState } from '../src/registry.js';
import { cleanupTrial, tryCapability } from '../src/try.js';
import { cleanupText, main, tryText } from '../src/cli.js';
import { createWebServer } from '../src/web-server.js';
import { handleMcpMessage } from '../src/mcp-server.js';

const mockMcp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mock-mcp-server.js');

async function isolated(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-try-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  await fs.mkdir(userHome, {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}]}
  }}, null, 2));
  return {
    root,
    home: path.join(root, 'state'),
    userHome,
    projectRoot,
    jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']],
    skillRoots: [],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  };
}

function mockLaunch() {
  return {
    command: process.execPath,
    args: [mockMcp],
    env: {CAP_MOCK_MCP_TOOL: 'send_message'}
  };
}

test('try creates a temporary ManagedBinding without Direct Exposure', async (t) => {
  const options = await isolated(t);
  const before = await inspectLocal(options);
  const githubBefore = before.items.find((item) => item.name === 'github');
  assert.equal(githubBefore.status, 'direct');

  const tried = await tryCapability('git.repository.status', {path: process.cwd()}, options);
  assert.equal(tried.action, 'try');
  assert.equal(tried.trial, true);
  assert.equal(tried.exposure, 'managed');
  assert.equal(tried.persistent, false);
  assert.equal(tried.outcome.anonymous, true);
  assert.equal(tried.outcome.local, true);
  assert.equal(tried.outcome.telemetry, false);
  assert.equal(tried.outcome.status, 'completed');
  assert.equal(tried.result.status, 'completed');
  assert.match(tried.result.stdout, /##/);

  const state = await loadState(options);
  assert.ok(state.managed_capabilities.includes('git.repository.status'));
  assert.ok(state.managed_providers.includes('builtin.git'));
  assert.equal(state.trial_bindings.length, 1);
  assert.equal(state.trial_bindings[0].created_capability, true);
  const tryRow = state.activity.find((row) => row.action === 'try');
  assert.equal(tryRow.anonymous, true);
  assert.equal(tryRow.local, true);
  assert.equal(tryRow.input, undefined);
  assert.equal(tryRow.path, undefined);
  assert.equal(tryRow.stdout, undefined);
  assert.ok(state.activity.some((row) => row.action === 'use' && row.capability_id === 'git.repository.status'));
  assert.equal(state.activity.some((row) => row.action === 'add'), false);

  const after = await inspectLocal(options);
  const githubAfter = after.items.find((item) => item.name === 'github');
  assert.equal(githubAfter.status, 'direct');
  assert.equal(after.summary.directTools, before.summary.directTools);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.mcpServers), ['github']);
});

test('cleanup removes trial binding and keeps an anonymous local outcome', async (t) => {
  const options = await isolated(t);
  await tryCapability('git.repository.status', {path: process.cwd()}, options);
  const cleaned = await cleanupTrial('git.repository.status', options);
  assert.equal(cleaned.action, 'cleanup');
  assert.equal(cleaned.exposure, 'none');
  assert.equal(cleaned.outcome_retained, true);
  assert.equal(cleaned.telemetry, false);
  assert.equal(cleaned.writes.length, 0);
  assert.ok(cleaned.removed.includes('managed_capability'));
  assert.ok(cleaned.removed.includes('managed_provider'));
  assert.ok(cleaned.outcomes.some((row) => row.action === 'try' && row.anonymous === true && row.local === true));

  const state = await loadState(options);
  assert.deepEqual(state.managed_capabilities, []);
  assert.deepEqual(state.managed_providers, []);
  assert.deepEqual(state.trial_bindings, []);
  assert.ok(state.activity.some((row) => row.action === 'try' && row.capability_id === 'git.repository.status' && row.anonymous));
  assert.ok(state.activity.some((row) => row.action === 'use' && row.capability_id === 'git.repository.status'));
  assert.equal(state.activity[0].action, 'cleanup');
  assert.equal(state.activity[0].outcome_retained, true);

  const report = await inspectLocal(options);
  const github = report.items.find((item) => item.name === 'github');
  assert.equal(github.status, 'direct');
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.ok(config.mcpServers.github);
});

test('cleanup removes a trial MCP launch binding without writing Agent config', async (t) => {
  const options = await isolated(t);
  const tried = await tryCapability('dingtalk.im.message.send', {
    id: 'user-1',
    msgKey: 'sampleText',
    msgParam: {content: 'hello'}
  }, {...options, launch: mockLaunch()});
  assert.equal(tried.outcome.status, 'completed');
  const bound = await loadState(options);
  assert.equal(bound.mcp_bindings['dingtalk.mcp'].command, process.execPath);
  assert.equal(bound.trial_bindings[0].created_binding, true);

  const beforeInspect = await inspectLocal(options);
  assert.equal(beforeInspect.items.some((item) => item.name === 'dingtalk'), false);

  const cleaned = await cleanupTrial('dingtalk.im.message.send', options);
  assert.ok(cleaned.removed.includes('mcp_binding'));
  const state = await loadState(options);
  assert.equal(state.mcp_bindings['dingtalk.mcp'], undefined);
  assert.deepEqual(state.managed_capabilities, []);
  assert.ok(state.activity.some((row) => row.action === 'try' && row.anonymous && row.capability_id === 'dingtalk.im.message.send'));
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.mcpServers), ['github']);
});

test('cleanup keeps a persistent add and still retains the try outcome', async (t) => {
  const options = await isolated(t);
  await addCapability('git.repository.status', undefined, options);
  const tried = await tryCapability('git.repository.status', {path: process.cwd()}, options);
  assert.equal(tried.persistent, true);
  const cleaned = await cleanupTrial('git.repository.status', options);
  assert.equal(cleaned.removed.includes('managed_capability'), false);
  const state = await loadState(options);
  assert.deepEqual(state.managed_capabilities, ['git.repository.status']);
  assert.deepEqual(state.managed_providers, ['builtin.git']);
  assert.ok(state.activity.some((row) => row.action === 'try' && row.anonymous));
});

test('explicit add during a trial promotes the binding so cleanup keeps it', async (t) => {
  const options = await isolated(t);
  await tryCapability('git.repository.status', {path: process.cwd()}, options);
  await addCapability('git.repository.status', undefined, options);
  const promoted = await loadState(options);
  assert.equal(promoted.trial_bindings[0].promoted, true);
  await cleanupTrial('git.repository.status', options);
  const state = await loadState(options);
  assert.deepEqual(state.managed_capabilities, ['git.repository.status']);
  assert.deepEqual(state.trial_bindings, []);
});

test('cleanup without try fails closed', async (t) => {
  const options = await isolated(t);
  await assert.rejects(() => cleanupTrial('git.repository.status', options), /No trial binding/);
});

test('remote catalog try is refused until Phase 3', async (t) => {
  const options = await isolated(t);
  await assert.rejects(
    () => tryCapability('git.repository.status', {path: process.cwd()}, {...options, remote: true}),
    /Phase 3/
  );
  const state = await loadState(options);
  assert.deepEqual(state.managed_capabilities, []);
  assert.deepEqual(state.trial_bindings ?? [], []);
});

test('CLI try and cleanup write JSON the Agent can parse', async (t) => {
  const options = await isolated(t);
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['try', 'git.repository.status', '--input', JSON.stringify({path: process.cwd()}), '--json'], options);
  await main(['cleanup', 'git.repository.status', '--json'], options);
  const tried = JSON.parse(logs[0]);
  const cleaned = JSON.parse(logs[1]);
  assert.equal(tried.action, 'try');
  assert.equal(tried.outcome.telemetry, false);
  assert.equal(cleaned.action, 'cleanup');
  assert.equal(cleaned.outcome_retained, true);
  assert.match(tryText(tried), /Temporary ManagedBinding/);
  assert.match(cleanupText(cleaned), /Outcomes retained/);
});

test('web try and cleanup APIs keep a local outcome without Agent config writes', async (t) => {
  const options = await isolated(t);
  const server = createWebServer(options);
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const {port} = server.address();
  const tried = await fetch(`http://127.0.0.1:${port}/api/try`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({capability_id: 'git.repository.status', input: {path: process.cwd()}})
  });
  assert.equal(tried.status, 200);
  const body = await tried.json();
  assert.equal(body.trial, true);
  const cleaned = await fetch(`http://127.0.0.1:${port}/api/cleanup`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({capability_id: 'git.repository.status'})
  });
  assert.equal(cleaned.status, 200);
  const done = await cleaned.json();
  assert.equal(done.outcome_retained, true);
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html, /tryCap/);
  assert.match(html, /\/api\/try/);
  assert.match(html, /\/api\/cleanup/);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.ok(config.mcpServers.github);
});

test('try of a local skill does not delete SKILL.md on cleanup', async (t) => {
  const options = await isolated(t);
  const skillDir = path.join(options.userHome, '.cursor', 'skills', 'system-blueprint');
  await fs.mkdir(skillDir, {recursive: true});
  const skillFile = path.join(skillDir, 'SKILL.md');
  await fs.writeFile(skillFile, '---\nname: system-blueprint\ndescription: Draw architecture diagrams\n---\n\n# Body\nSECRET_BODY\n');
  options.skillRoots = [[path.join(options.userHome, '.cursor', 'skills'), 'Cursor']];
  const tried = await tryCapability('skill.system-blueprint', {}, options);
  assert.equal(tried.outcome.status, 'completed');
  assert.equal(tried.result.skill.body, undefined);
  await cleanupTrial('skill.system-blueprint', options);
  const text = await fs.readFile(skillFile, 'utf8');
  assert.match(text, /SECRET_BODY/);
  const state = await loadState(options);
  assert.deepEqual(state.managed_capabilities, []);
  assert.ok(state.activity.some((row) => row.action === 'try' && row.anonymous && row.capability_id === 'skill.system-blueprint'));
});

test('default MCP surface does not gain try or cleanup tools', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-try-mcp-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const listed = await handleMcpMessage({jsonrpc: '2.0', id: 1, method: 'tools/list'}, {home, env: {}});
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['cap.search', 'cap.add', 'cap.use']);
  const blocked = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {name: 'cap.try', arguments: {capability_id: 'git.repository.status'}}
  }, {home, env: {}});
  assert.equal(blocked.error.message, 'Tool is not exposed: cap.try');
});
