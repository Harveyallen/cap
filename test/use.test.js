import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireCapability } from '../src/registry.js';
import { useCapability } from '../src/use.js';

test('managed Git capability executes without a shell', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-use-'));
  const home = path.join(root, 'state');
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, '.git'), 'gitdir: nowhere\n');
  await acquireCapability('git.repository.status', undefined, {home});
  const result = await useCapability('git.repository.status', {path: process.cwd()}, {home});
  assert.equal(result.status, 'completed');
  assert.match(result.stdout, /##/);
});
