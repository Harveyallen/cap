import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { searchCapabilities } from '../src/search.js';
import { addCapability, loadState, sanitizeSearchQuery } from '../src/registry.js';
import { useCapability } from '../src/use.js';
import { planInjection } from '../src/inject.js';
import { handleMcpMessage } from '../src/mcp-server.js';
import { main } from '../src/cli.js';
import { createWebServer } from '../src/web-server.js';

function isolated(home) {
  return {
    home,
    userHome: home,
    projectRoot: path.join(home, 'empty-project'),
    skillRoots: [],
    jsonConfigs: [],
    env: {}
  };
}

test('intent-first search ranks DingTalk send first', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-dt-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const results = await searchCapabilities('发送钉钉消息', isolated(home));
  assert.equal(results[0].capability_id, 'dingtalk.im.message.send');
  assert.equal(results[0].installed, false);
  assert.equal(results[0].use_registers, true);
  assert.equal(results[0].schema_source, 'catalog');
  assert.equal(results[0].input_schema.type, 'object');
  assert.equal(results[0].input_schema.properties.msgKey.type, 'string');
  assert.equal(results[0].input_schema.properties.msgKey.enum, undefined);
  assert.deepEqual(results[0].input_schema.required, ['id', 'msgKey', 'msgParam']);
});

test('natural DingTalk send phrasing still ranks the send capability first', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-dt-cjk-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  for (const query of ['帮我发钉钉消息', '发钉钉消息', '发送钉钉消息', '请帮我发一条钉钉消息']) {
    const results = await searchCapabilities(query, isolated(home));
    assert.ok(results.length > 0, `expected a hit for ${query}`);
    assert.equal(results[0].capability_id, 'dingtalk.im.message.send', query);
  }
});

test('builtin search exposes catalog JSON Schema for cap.use', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-git-schema-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const [git] = await searchCapabilities('check git status', isolated(home));
  assert.equal(git.capability_id, 'git.repository.status');
  assert.equal(git.schema_source, 'catalog');
  assert.equal(git.input_schema.properties.path.type, 'string');
  assert.equal(git.input_schema.properties.path.description, 'Filesystem path');
  assert.equal(git.input_schema.required, undefined);

  const [files] = await searchCapabilities('search files', isolated(home));
  assert.equal(files.capability_id, 'local.files.search');
  assert.equal(files.schema_source, 'catalog');
  assert.deepEqual(files.input_schema.required, ['query']);
  assert.equal(files.input_schema.properties.path.description, 'Filesystem path');
});

test('intent-first search ranks PostgreSQL analysis first', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const results = await searchCapabilities('分析 PostgreSQL 慢查询', isolated(home));
  assert.equal(results[0].capability_id, 'postgres.query.explain');
  assert.equal(results[0].installed, false);
  assert.equal(results[0].schema_source, 'catalog');
  assert.equal(results[0].input_schema.properties.query.type, 'string');
  assert.equal(results[0].input_schema.properties.connection.type, 'string');
  assert.equal(results[0].input_schema.properties.connection.description, 'Secret; do not log');
  assert.deepEqual(results[0].input_schema.required, ['query', 'connection']);
});

test('add persists managed capability and affects search', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  await addCapability('git.repository.status', undefined, isolated(home));
  const [result] = await searchCapabilities('check git status', isolated(home));
  assert.equal(result.capability_id, 'git.repository.status');
  assert.equal(result.installed, true);
  assert.equal(result.use_registers, undefined);
  assert.equal(result.providers[0].status, 'CAP Managed');
  const state = await loadState(isolated(home));
  assert.equal(state.activity[0].action, 'search');
  assert.ok(state.activity.some((row) => row.action === 'add' && row.capability_id === 'git.repository.status'));
});

test('CLI add registers a capability; acquire is not an alias', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-cli-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  await main(['add', 'git.repository.status'], isolated(home));
  const state = await loadState(isolated(home));
  assert.ok(state.managed_capabilities.includes('git.repository.status'));
  assert.equal(state.activity[0].action, 'add');
  await assert.rejects(() => main(['acquire', 'git.repository.status'], {home}), /Unknown command: acquire/);
});

test('web API add replaces acquire', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-web-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const server = createWebServer(isolated(home));
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const {port} = server.address();
  const missing = await fetch(`http://127.0.0.1:${port}/api/acquire`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({capability_id: 'git.repository.status'})});
  assert.equal(missing.status, 404);
  const added = await fetch(`http://127.0.0.1:${port}/api/add`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({capability_id: 'git.repository.status'})});
  assert.equal(added.status, 201);
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html, /Search、Add、Use/);
  assert.match(html, /onclick="add\(\\''\+x\.capability_id\+'\\'\)">添加/);
  assert.doesNotMatch(html, /Acquire|\/api\/acquire|acquire\(/);
  assert.match(html, /Capability Health/);
  assert.match(html, /问题与建议/);
  assert.match(html, /健康分数/);
  assert.match(html, /只读本地配置/);
  assert.doesNotMatch(html, /本地发现/);
  assert.doesNotMatch(html, /会暴露/);
  assert.match(html, /频率结论未就绪/);
  assert.match(html, /频率 \/ 价值建议（信号分列，不是移除）/);
  assert.match(html, /id="inv-filters"/);
  assert.match(html, /Skill 重叠/);
  const inspect = await fetch(`http://127.0.0.1:${port}/api/inspect`);
  const report = await inspect.json();
  assert.equal(typeof report.pressure.band, 'string');
  assert.equal(typeof report.funnel.installed, 'number');
  assert.ok(report.budget.effectiveBudget > 0);
  const filtered = await (await fetch(`http://127.0.0.1:${port}/api/inspect?type=skill`)).json();
  assert.equal(filtered.filters.type, 'skill');
  assert.ok(Array.isArray(filtered.filtered));
  assert.ok((filtered.filtered ?? []).every((item) => item.kind === 'skill'));
});

test('sanitizeSearchQuery keeps intent and strips secrets paths and tokens', () => {
  assert.equal(sanitizeSearchQuery('  check git status  '), 'check git status');
  const dirty = 'check git status /home/alice/.ssh/id_rsa token=sk-abcdefghijklmnopqrstuvwxyz contact=dev@example.com';
  const clean = sanitizeSearchQuery(dirty);
  assert.match(clean, /check git status/);
  assert.doesNotMatch(clean, /alice|id_rsa|sk-abcdefghijklmnopqrstuvwxyz|dev@example\.com/);
  assert.match(clean, /\[path\]/);
  assert.match(clean, /\[redacted\]|\[secret\]|\[email\]/);
});

test('search then use records search select add and use activity', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-activity-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const options = isolated(home);
  const results = await searchCapabilities('check git status', options);
  assert.equal(results[0].capability_id, 'git.repository.status');

  let state = await loadState(options);
  const search = state.activity.find((row) => row.action === 'search');
  assert.ok(search);
  assert.equal(search.query, 'check git status');
  assert.ok(search.hit_count >= 1);
  assert.ok(search.hits.includes('git.repository.status'));
  assert.equal(search.top_id, 'git.repository.status');
  assert.ok(search.at);
  if (search.hit_count === 1) assert.equal(search.selected_id, 'git.repository.status');
  else assert.equal(search.selected_id, undefined);

  const used = await useCapability('git.repository.status', {path: process.cwd()}, options);
  assert.equal(used.status, 'completed');
  state = await loadState(options);
  const actions = state.activity.map((row) => row.action);
  assert.deepEqual(actions.filter((action) => ['search', 'select', 'add', 'use'].includes(action)).sort(), ['add', 'search', 'select', 'use']);
  const select = state.activity.find((row) => row.action === 'select');
  assert.equal(select.capability_id, 'git.repository.status');
  assert.equal(select.query, search.query);
  assert.equal(state.activity.filter((row) => row.action === 'select').length, 1);
  assert.ok(state.activity.some((row) => row.action === 'use' && row.capability_id === 'git.repository.status' && row.success === true));
  assert.doesNotMatch(JSON.stringify(state.activity), /SKILL\.md[\s\S]{80,}|mcpServers|input_schema/);
});

test('search activity redacts secrets and does not store raw config', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-privacy-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const options = isolated(home);
  await searchCapabilities('check git status /etc/shadow token=ghp-notarealtokenvalue contact=ops@example.com', options);
  const state = await loadState(options);
  const search = state.activity[0];
  assert.equal(search.action, 'search');
  assert.doesNotMatch(search.query, /shadow|ghp-notarealtokenvalue|ops@example\.com/);
  assert.match(search.query, /check git status/);
});

test('inject ranking does not write search activity', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-inject-no-search-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const options = isolated(home);
  await planInjection('check git status', options);
  const state = await loadState(options);
  assert.equal((state.activity ?? []).some((row) => row.action === 'search'), false);
});

test('MCP cap.search writes the same search activity', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-search-activity-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {name: 'cap.search', arguments: {query: 'check git status'}}
  }, isolated(home));
  assert.equal(response.result.structuredContent[0].capability_id, 'git.repository.status');
  const state = await loadState(isolated(home));
  assert.equal(state.activity[0].action, 'search');
  assert.equal(state.activity[0].query, 'check git status');
  assert.ok(state.activity[0].hits.includes('git.repository.status'));
});

test('CLI activity lists a search event after cap search', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-cli-search-activity-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const options = isolated(home);
  const chunks = [];
  const orig = console.log;
  console.log = (value) => chunks.push(value);
  try {
    await main(['search', 'check', 'git', 'status'], options);
    await main(['activity'], options);
  } finally {
    console.log = orig;
  }
  const text = chunks.join('\n');
  assert.match(text, /search\s+q=check git status\s+hits=/);
});
