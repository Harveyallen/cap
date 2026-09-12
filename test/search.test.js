import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { searchCapabilities } from '../src/search.js';
import { addCapability, loadState } from '../src/registry.js';
import { main } from '../src/cli.js';
import { createWebServer } from '../src/web-server.js';

test('intent-first search ranks PostgreSQL analysis first', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const results = await searchCapabilities('分析 PostgreSQL 慢查询', {home});
  assert.equal(results[0].capability_id, 'postgres.query.explain');
  assert.equal(results[0].installed, false);
});

test('add persists managed capability and affects search', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  await addCapability('git.repository.status', undefined, {home});
  const [result] = await searchCapabilities('check git status', {home});
  assert.equal(result.capability_id, 'git.repository.status');
  assert.equal(result.installed, true);
  assert.equal(result.providers[0].status, 'CAP Managed');
  const state = await loadState({home});
  assert.equal(state.activity[0].action, 'add');
});

test('CLI add registers a capability; acquire is not an alias', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-cli-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  await main(['add', 'git.repository.status'], {home});
  const state = await loadState({home});
  assert.ok(state.managed_capabilities.includes('git.repository.status'));
  assert.equal(state.activity[0].action, 'add');
  await assert.rejects(() => main(['acquire', 'git.repository.status'], {home}), /Unknown command: acquire/);
});

test('web API add replaces acquire', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-web-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const server = createWebServer({home});
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
  const inspect = await fetch(`http://127.0.0.1:${port}/api/inspect`);
  const report = await inspect.json();
  assert.equal(typeof report.pressure.band, 'string');
  assert.equal(typeof report.funnel.installed, 'number');
  assert.ok(report.budget.effectiveBudget > 0);
});
