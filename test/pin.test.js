import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from '../src/inspector.js';
import { applyOptimization } from '../src/optimize.js';
import { buildProfiler } from '../src/profiler.js';
import { addCapability, loadCatalog, loadState } from '../src/registry.js';
import { excludeProvider, includeProvider, pinProvider, unpinProvider } from '../src/pin.js';
import { inspectText, main } from '../src/cli.js';
import { createWebServer } from '../src/web-server.js';
import { handleMcpMessage } from '../src/mcp-server.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-pin-'));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  await fs.mkdir(path.join(userHome, '.claude', 'skills', 'reviewer'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}, {name: 'comment_pr'}]},
    postgres: {command: 'postgres-mcp', toolCount: 12}
  }}, null, 2));
  await fs.writeFile(path.join(userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: Review code\n---\n');
  return {
    root,
    userHome,
    projectRoot,
    home,
    jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']],
    skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  };
}

test('pin keeps a Provider as Direct Exposure and drops it from recommendations', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const before = await inspectLocal(options);
  assert.equal(before.items.find((item) => item.name === 'github').status, 'direct');
  assert.equal(before.recommendations.some((item) => item.provider === 'github'), true);

  const pinned = await pinProvider('github', options);
  assert.equal(pinned.exposure, 'direct');
  const report = await inspectLocal(options);
  const github = report.items.find((item) => item.name === 'github');
  assert.equal(github.direct, true);
  assert.equal(github.status, 'direct');
  assert.equal(github.pinned, true);
  assert.equal(report.recommendations.some((item) => item.provider === 'github'), false);
  assert.equal(report.recommendations.some((item) => item.provider === 'postgres'), true);
  assert.equal(report.summary.pinned, 1);
  assert.match(inspectText(report, options), /Direct Exposure · pinned/);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.ok(config.mcpServers.github);
});

test('exclude hides recommendations without uninstalling', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const excluded = await excludeProvider('postgres', options);
  assert.match(excluded.message, /not uninstalled/);
  const report = await inspectLocal(options);
  const postgres = report.items.find((item) => item.name === 'postgres');
  assert.equal(postgres.direct, true);
  assert.equal(postgres.excluded, true);
  assert.equal(report.recommendations.some((item) => item.provider === 'postgres'), false);
  assert.equal(report.recommendations.some((item) => item.provider === 'github'), true);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.ok(config.mcpServers.postgres);
  await includeProvider('postgres', options);
  const again = await inspectLocal(options);
  assert.equal(again.recommendations.some((item) => item.provider === 'postgres'), true);
});

test('unpin restores non-resident CAP-managed behavior', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  await pinProvider('github.mcp', options);
  const unpinned = await unpinProvider('github', options);
  assert.equal(unpinned.exposure, 'managed');
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.equal(config.mcpServers.github, undefined);
  assert.ok(config.mcpServers.postgres);
  const report = await inspectLocal(options);
  assert.equal(report.items.some((item) => item.name === 'github' && item.direct), false);
  const state = await loadState(options);
  assert.equal(state.pinned_providers.length, 0);
  assert.ok(state.external_providers.some((item) => item.name === 'github'));
  assert.ok(state.managed_providers.includes('github.mcp'));
});

test('pin after optimize writes the Provider back as Direct Exposure', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  await applyOptimization(options);
  const migrated = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(migrated.mcpServers, {});
  await pinProvider('github', options);
  const restored = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.equal(restored.mcpServers.github.command, 'github-mcp');
  const report = await inspectLocal(options);
  const github = report.items.find((item) => item.name === 'github');
  assert.equal(github.status, 'direct');
  assert.equal(github.pinned, true);
  await unpinProvider('github', options);
  const after = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.equal(after.mcpServers.github, undefined);
  const later = await inspectLocal(options);
  assert.equal(later.items.some((item) => item.name === 'github' && item.status === 'direct'), false);
});

test('optimize apply leaves pinned and excluded Providers in Agent config', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  await pinProvider('github', options);
  await excludeProvider('postgres', options);
  await applyOptimization(options);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ['github', 'postgres']);
});

test('implicit add does not pin', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  await addCapability('git.repository.status', undefined, options);
  const state = await loadState(options);
  assert.deepEqual(state.pinned_providers ?? [], []);
  await assert.rejects(() => pinProvider('builtin.git', options), /no Agent Direct Exposure surface/);
});

test('exclude removes a Provider from Value Analysis underused recommendations', async () => {
  const catalog = await loadCatalog();
  const state = {
    managed_capabilities: ['github.pr.review'],
    managed_providers: ['github.mcp'],
    excluded_providers: [{name: 'github', provider_id: 'github.mcp'}],
    activity: []
  };
  const profiler = buildProfiler({catalog, state, items: []});
  assert.equal(profiler.underused.some((item) => item.capability_id === 'github.pr.review'), false);
});

test('CLI pin and exclude write JSON the Agent can parse', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['pin', 'github', '--json'], options);
  await main(['exclude', 'postgres', '--json'], options);
  const pin = JSON.parse(logs[0]);
  const exclude = JSON.parse(logs[1]);
  assert.equal(pin.exposure, 'direct');
  assert.equal(exclude.action, 'exclude');
});

test('web pin and exclude APIs update inspect Health', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const server = createWebServer(options);
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const {port} = server.address();
  const pinned = await fetch(`http://127.0.0.1:${port}/api/pin`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({provider: 'github'})
  });
  assert.equal(pinned.status, 200);
  const excluded = await fetch(`http://127.0.0.1:${port}/api/exclude`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({provider: 'postgres'})
  });
  assert.equal(excluded.status, 200);
  const report = await (await fetch(`http://127.0.0.1:${port}/api/inspect`)).json();
  assert.equal(report.items.find((item) => item.name === 'github').pinned, true);
  assert.equal(report.items.find((item) => item.name === 'postgres').excluded, true);
  assert.equal(report.recommendations.length, 0);
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html, /data-act=/);
  assert.match(html, /\/api\/'\+b\.dataset\.act/);
  assert.match(html, /Pin = Direct Exposure/);
});

test('default MCP surface does not gain pin or exclude tools', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-pin-mcp-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const listed = await handleMcpMessage({jsonrpc: '2.0', id: 1, method: 'tools/list'}, {home, env: {}});
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['cap.search', 'cap.add', 'cap.use']);
  const blocked = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {name: 'cap.pin', arguments: {provider: 'github'}}
  }, {home, env: {}});
  assert.equal(blocked.error.message, 'Tool is not exposed: cap.pin');
});
