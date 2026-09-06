import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { searchCapabilities } from '../src/search.js';
import { acquireCapability } from '../src/registry.js';

test('intent-first search ranks PostgreSQL analysis first', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-search-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const results = await searchCapabilities('分析 PostgreSQL 慢查询', {home});
  assert.equal(results[0].capability_id, 'postgres.query.explain');
  assert.equal(results[0].installed, false);
});

test('acquire persists managed capability and affects search', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-acquire-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  await acquireCapability('git.repository.status', undefined, {home});
  const [result] = await searchCapabilities('check git status', {home});
  assert.equal(result.capability_id, 'git.repository.status');
  assert.equal(result.installed, true);
  assert.equal(result.providers[0].status, 'CAP Managed');
});
