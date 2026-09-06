import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from '../src/inspector.js';
import { applyOptimization } from '../src/optimize.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-inspect-'));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const stateHome = path.join(root, 'state');
  await fs.mkdir(path.join(userHome, '.claude', 'skills', 'reviewer'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.claude.json'), JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}, {name: 'comment_pr'}]},
    postgres: {command: 'postgres-mcp', toolCount: 12}
  }}, null, 2));
  await fs.writeFile(path.join(userHome, '.claude', 'skills', 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: Review code\n---\n');
  return {root, userHome, projectRoot, home: stateHome, jsonConfigs: [[path.join(userHome, '.claude.json'), 'Claude Code']], skillRoots: [[path.join(userHome, '.claude', 'skills'), 'Claude Code']], codexConfig: path.join(root, 'missing.toml')};
}

test('inspect counts MCP tools, skills, and context', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await inspectLocal(options);
  assert.equal(result.summary.mcpServers, 2);
  assert.equal(result.summary.skills, 1);
  assert.equal(result.summary.directTools, 14);
  assert.equal(result.recommendations.length, 2);
  assert.ok(result.summary.contextTokens > 0);
});

test('optimize backs up JSON config and moves providers into CAP state', async (t) => {
  const options = await fixture();
  t.after(() => fs.rm(options.root, {recursive: true, force: true}));
  const result = await applyOptimization(options);
  assert.equal(result.changed.length, 1);
  const config = JSON.parse(await fs.readFile(path.join(options.userHome, '.claude.json'), 'utf8'));
  assert.deepEqual(config.mcpServers, {});
  await fs.access(result.changed[0].backup);
  const state = JSON.parse(await fs.readFile(path.join(options.home, 'registry.json'), 'utf8'));
  assert.deepEqual(state.external_providers.map((item) => item.name).sort(), ['github', 'postgres']);
});
