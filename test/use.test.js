import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addCapability, loadState } from '../src/registry.js';
import { useCapability } from '../src/use.js';

async function isolatedHome(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-use-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return {root, home: path.join(root, 'state')};
}

test('managed Git capability executes without a shell', async (t) => {
  const {home} = await isolatedHome(t);
  await addCapability('git.repository.status', undefined, {home});
  const result = await useCapability('git.repository.status', {path: process.cwd()}, {home});
  assert.equal(result.status, 'completed');
  assert.match(result.stdout, /##/);
});

test('use without prior add registers then executes', async (t) => {
  const {home} = await isolatedHome(t);
  const before = await loadState({home});
  assert.equal(before.managed_capabilities.includes('git.repository.status'), false);
  const result = await useCapability('git.repository.status', {path: process.cwd()}, {home});
  assert.equal(result.status, 'completed');
  assert.match(result.stdout, /##/);
  const state = await loadState({home});
  assert.ok(state.managed_capabilities.includes('git.repository.status'));
  assert.ok(state.managed_providers.includes('builtin.git'));
  assert.ok(state.activity.some((row) => row.action === 'add' && row.capability_id === 'git.repository.status' && row.success));
  assert.equal(state.activity[0].action, 'use');
  assert.equal(state.activity[0].success, true);
});

test('reuse after implicit add is idempotent', async (t) => {
  const {home} = await isolatedHome(t);
  await useCapability('git.repository.status', {path: process.cwd()}, {home});
  const again = await useCapability('git.repository.status', {path: process.cwd()}, {home});
  assert.equal(again.status, 'completed');
  const state = await loadState({home});
  assert.deepEqual(state.managed_capabilities, ['git.repository.status']);
  assert.deepEqual(state.managed_providers, ['builtin.git']);
  assert.equal(state.activity.filter((row) => row.action === 'add').length, 1);
  assert.equal(state.activity.filter((row) => row.action === 'use').length, 2);
});

test('explicit add still works before use', async (t) => {
  const {home} = await isolatedHome(t);
  const added = await addCapability('git.repository.status', undefined, {home});
  assert.equal(added.provider.status, 'CAP Managed');
  const result = await useCapability('git.repository.status', {path: process.cwd()}, {home});
  assert.equal(result.status, 'completed');
  const state = await loadState({home});
  assert.deepEqual(state.managed_capabilities, ['git.repository.status']);
  assert.equal(state.activity.filter((row) => row.action === 'add').length, 1);
});
