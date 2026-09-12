import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/registry.js';
import { inspectLocal } from '../src/inspector.js';
import * as api from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('catalog matches schema contract and bidirectional refs', async () => {
  const catalog = await loadCatalog();
  const schema = JSON.parse(await fs.readFile(path.join(root, 'data', 'catalog.schema.json'), 'utf8'));
  assert.equal(schema.title, 'CAP Catalog');
  assert.ok(catalog.capabilities.length > 0);
  assert.ok(catalog.providers.length > 0);

  const providerIds = new Set(catalog.providers.map((item) => item.provider_id));
  const capabilityIds = new Set(catalog.capabilities.map((item) => item.capability_id));

  for (const capability of catalog.capabilities) {
    assert.match(capability.capability_id, /^[a-z][a-z0-9_.-]*$/);
    assert.ok(['low', 'medium', 'high'].includes(capability.risk));
    for (const ref of capability.provider_refs) {
      assert.ok(providerIds.has(ref), `missing provider ${ref}`);
      const provider = catalog.providers.find((item) => item.provider_id === ref);
      assert.ok(provider.capabilities.includes(capability.capability_id), `${ref} missing ${capability.capability_id}`);
    }
  }

  for (const provider of catalog.providers) {
    assert.match(provider.provider_id, /^[a-z][a-z0-9_.-]*$/);
    assert.ok(['CLI', 'MCP', 'Skill', 'API'].includes(provider.type));
    for (const capabilityId of provider.capabilities) {
      assert.ok(capabilityIds.has(capabilityId), `unknown capability ${capabilityId}`);
    }
  }
});

test('public API exports stable entry points', () => {
  for (const name of ['runCli', 'searchCapabilities', 'acquireCapability', 'useCapability', 'inspectLocal', 'handleMcpMessage']) {
    assert.equal(typeof api[name], 'function');
  }
});

test('project ships shared agent skills discoverable by inspect', async () => {
  const result = await inspectLocal({
    projectRoot: root,
    userHome: path.join(root, '.missing-user-home'),
    home: path.join(root, '.missing-cap-home'),
    jsonConfigs: [],
    skillRoots: [[path.join(root, '.agents', 'skills'), 'Shared']],
    codexConfig: path.join(root, '.missing-codex.toml')
  });
  assert.ok(result.summary.skills >= 2);
  const names = result.items.filter((item) => item.kind === 'skill').map((item) => item.name).sort();
  assert.deepEqual(names, ['add-capability', 'cap-develop']);
});

test('agent orientation docs exist', async () => {
  for (const relative of ['AGENTS.md', 'CLAUDE.md', 'llms.txt', 'docs/architecture.md', '.mcp.json', '.cursor/rules/cap.mdc']) {
    await fs.access(path.join(root, relative));
  }
});
