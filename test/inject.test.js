import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planInjection } from '../src/inject.js';
import { addCapability } from '../src/registry.js';
import { handleMcpMessage } from '../src/mcp-server.js';
import { main } from '../src/cli.js';

async function isolated(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-inject-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  await fs.mkdir(userHome, {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  return {
    root,
    home,
    userHome,
    projectRoot,
    jsonConfigs: extra.jsonConfigs ?? [],
    skillRoots: extra.skillRoots ?? [],
    codexConfig: extra.codexConfig ?? path.join(root, 'missing.toml'),
    env: extra.env ?? {}
  };
}

async function captureMain(args, options) {
  const chunks = [];
  const orig = console.log;
  console.log = (value) => chunks.push(value);
  try {
    await main(args, options);
  } finally {
    console.log = orig;
  }
  return chunks.join('\n');
}

test('postgres task loads explain and is smaller than the full catalog', async (t) => {
  const options = await isolated(t);
  const plan = await planInjection('分析 PostgreSQL 慢查询', options);
  assert.equal(plan.version, 4);
  assert.equal(plan.mutates, false);
  assert.equal(plan.task, '分析 PostgreSQL 慢查询');
  assert.equal(plan.load[0].capability_id, 'postgres.query.explain');
  assert.ok(plan.load.length < plan.comparison.catalogCount);
  assert.ok(plan.comparison.catalogCount >= 6);
  assert.equal(plan.comparison.loadCount, plan.load.length);
  assert.equal(plan.comparison.deferCount, plan.defer.length);
  assert.equal(plan.comparison.loadCount + plan.comparison.deferCount, plan.comparison.catalogCount);
  assert.ok(plan.comparison.savedVsCatalog > 0);
  assert.equal(plan.comparison.loadTokens, 740);
  assert.ok(plan.defer.some((item) => item.capability_id === 'git.repository.status'));
  assert.ok(plan.defer.every((item) => item.capability_id !== 'postgres.query.explain'));
  assert.deepEqual(plan.keepResident.tools, ['cap.search', 'cap.add', 'cap.use']);
});

test('PDF task drops weak substring matches like git.repository.status', async (t) => {
  const options = await isolated(t);
  const plan = await planInjection('PDF to markdown', options);
  assert.equal(plan.load[0].capability_id, 'document.pdf.to_markdown');
  assert.equal(plan.load.length, 1);
  assert.equal(plan.load.some((item) => item.capability_id === 'git.repository.status'), false);
  assert.ok(plan.defer.some((item) => item.capability_id === 'git.repository.status'));
  assert.ok(plan.comparison.loadCount < plan.comparison.catalogCount);
});

test('GitHub security task includes the high-relevance review ids', async (t) => {
  const options = await isolated(t);
  const plan = await planInjection('review GitHub PR security', options);
  const ids = plan.load.map((item) => item.capability_id);
  assert.ok(ids.includes('github.pr.security_review'));
  assert.ok(plan.load.length <= 3);
  assert.ok(plan.load.length < plan.comparison.catalogCount);
  assert.equal(plan.defer.some((item) => item.capability_id === 'postgres.query.explain'), true);
});

test('unrelated task injects nothing extra', async (t) => {
  const options = await isolated(t);
  const plan = await planInjection('hello world xyzzy', options);
  assert.equal(plan.load.length, 0);
  assert.equal(plan.defer.length, plan.comparison.catalogCount);
  assert.equal(plan.comparison.savedVsCatalog, plan.comparison.catalogTokens);
  assert.equal(plan.comparison.catalogTokens, 3360);
});

test('empty query is rejected', async () => {
  await assert.rejects(() => planInjection('  '), /Inject query is required/);
});

test('managed capability next-step is use, not add', async (t) => {
  const options = await isolated(t);
  await addCapability('git.repository.status', undefined, options);
  const plan = await planInjection('check git status', options);
  assert.equal(plan.load[0].capability_id, 'git.repository.status');
  assert.equal(plan.load[0].installed, true);
  assert.equal(plan.load[0].next.action, 'use');
});

test('resident MCP larger than the task set reports savings vs inspect', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-inject-resident-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  await fs.mkdir(userHome, {recursive: true});
  const claudeJson = path.join(userHome, '.claude.json');
  const fatTools = Array.from({length: 20}, (_, i) => ({
    name: `tool_${i}`,
    description: 'Direct-exposed schema that bloats resident context. '.repeat(8),
    inputSchema: {type: 'object', properties: {query: {type: 'string'}, path: {type: 'string'}}}
  }));
  await fs.writeFile(claudeJson, JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: fatTools},
    postgres: {command: 'postgres-mcp', tools: fatTools}
  }}, null, 2));
  const options = {
    home: path.join(root, 'state'),
    userHome,
    projectRoot: path.join(root, 'project'),
    jsonConfigs: [[claudeJson, 'Claude Code']],
    skillRoots: [],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  };
  const plan = await planInjection('分析 PostgreSQL 慢查询', options);
  assert.equal(plan.load[0].capability_id, 'postgres.query.explain');
  assert.ok(plan.comparison.residentTokens > plan.comparison.afterTokens);
  assert.ok(plan.comparison.savedVsResident > 0);
  assert.equal(plan.comparison.afterTokens, plan.keepResident.contextTokens);
});

test('CLI inject --json returns the plan', async (t) => {
  const options = await isolated(t);
  const output = await captureMain(['inject', '分析 PostgreSQL 慢查询', '--json'], options);
  const plan = JSON.parse(output);
  assert.equal(plan.load[0].capability_id, 'postgres.query.explain');
  assert.ok(plan.comparison.loadCount < plan.comparison.catalogCount);
});

test('CLI inject human text names the task and load id', async (t) => {
  const options = await isolated(t);
  const output = await captureMain(['inject', '分析 PostgreSQL 慢查询'], options);
  assert.match(output, /按任务装载/);
  assert.match(output, /postgres\.query\.explain/);
  assert.match(output, /分析 PostgreSQL 慢查询/);
});

test('MCP inject is opt-in and returns the plan', async (t) => {
  const options = await isolated(t);
  const listed = await handleMcpMessage({jsonrpc: '2.0', id: 1, method: 'tools/list'}, options);
  assert.equal(listed.result.tools.some((tool) => tool.name === 'cap.inject'), false);
  const blocked = await handleMcpMessage({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'cap.inject', arguments: {query: 'PDF to markdown'}}}, options);
  assert.equal(blocked.error.message, 'Tool is not exposed: cap.inject');
  const enabled = {...options, exposeInject: true};
  const listedOn = await handleMcpMessage({jsonrpc: '2.0', id: 3, method: 'tools/list'}, enabled);
  assert.ok(listedOn.result.tools.some((tool) => tool.name === 'cap.inject'));
  const called = await handleMcpMessage({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'cap.inject', arguments: {query: 'PDF to markdown'}}}, enabled);
  assert.equal(called.result.structuredContent.load[0].capability_id, 'document.pdf.to_markdown');
  assert.ok(called.result.structuredContent.comparison.loadCount < called.result.structuredContent.comparison.catalogCount);
});
