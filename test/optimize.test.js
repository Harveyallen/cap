import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from '../src/inspector.js';
import { applyOptimization, buildOptimizationPlan } from '../src/optimize.js';
import { main } from '../src/cli.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-optimize-'));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  const claudeJson = path.join(userHome, '.claude.json');
  const codexConfig = path.join(userHome, '.codex', 'config.toml');
  await fs.mkdir(path.join(userHome, '.codex'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  return {
    root,
    userHome,
    projectRoot,
    home,
    claudeJson,
    codexConfig,
    options: {
      userHome,
      projectRoot,
      home,
      jsonConfigs: [[claudeJson, 'Claude Code']],
      skillRoots: [],
      codexConfig,
      env: {}
    }
  };
}

const CODEX_TOML = [
  'model = "gpt-5"',
  'approval_policy = "never"',
  '',
  '[projects."/tmp/app"]',
  'trust_level = "trusted"',
  '',
  '[mcp_servers.github]',
  'command = "gh-mcp"',
  'args = ["--stdio"]',
  '',
  '[mcp_servers.github.env]',
  'TOKEN = "secret-token"',
  '',
  '[mcp_servers.cap]',
  'command = "node"',
  'args = ["/tmp/bin/cap-mcp.js"]',
  '',
  '[mcp_servers.cap.env]',
  'CAP_MCP_INSPECT = "1"',
  ''
].join('\n');

test('inspect groups Codex nested env tables under the parent server', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, CODEX_TOML);
  const report = await inspectLocal({...ctx.options, jsonConfigs: [], env: {}});
  const names = report.items.filter((item) => item.kind === 'mcp').map((item) => item.name).sort();
  assert.deepEqual(names, ['cap', 'github']);
  assert.equal(report.items.find((item) => item.name === 'cap').capSurface, true);
  assert.equal(report.recommendations.some((item) => item.provider === 'github'), true);
  assert.equal(report.recommendations.some((item) => item.provider === 'cap.env' || item.provider === 'github.env'), false);
});

test('optimize preview marks dotted-table Codex TOML as apply-supported', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, CODEX_TOML);
  const plan = await buildOptimizationPlan({...ctx.options, jsonConfigs: []});
  assert.deepEqual(plan.adapters.apply.map((item) => item.id), ['json-mcp', 'codex-toml']);
  const github = plan.migrations.find((item) => item.provider === 'github');
  assert.equal(github.adapter, 'codex-toml');
  assert.equal(github.apply, true);
  assert.equal(plan.retained.some((item) => item.name === 'cap'), true);
  assert.match(plan.rollback, /Codex TOML/);
  assert.match(plan.rollback, /not one-click Restore/);
  assert.equal(plan.refused.length, 0);
});

test('optimize apply migrates Codex TOML, keeps cap-mcp, backs up, and validates', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, CODEX_TOML);
  const result = await applyOptimization({...ctx.options, jsonConfigs: []});
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].adapter, 'codex-toml');
  assert.deepEqual(result.changed[0].providers, ['github']);
  assert.equal(result.changed[0].validated, true);
  await fs.access(result.changed[0].backup);
  const after = await fs.readFile(ctx.codexConfig, 'utf8');
  assert.match(after, /model = "gpt-5"/);
  assert.match(after, /\[projects\."\/tmp\/app"\]/);
  assert.match(after, /\[mcp_servers\.cap\]/);
  assert.match(after, /cap-mcp\.js/);
  assert.doesNotMatch(after, /\[mcp_servers\.github\]/);
  assert.doesNotMatch(after, /secret-token/);
  const state = JSON.parse(await fs.readFile(path.join(ctx.home, 'registry.json'), 'utf8'));
  const github = state.external_providers.find((item) => item.name === 'github');
  assert.equal(github.type, 'MCP');
  assert.equal(github.originalSource, ctx.codexConfig);
  assert.deepEqual(github.config, {command: 'gh-mcp', args: ['--stdio'], env: {TOKEN: 'secret-token'}});
  const inspect = await inspectLocal({...ctx.options, jsonConfigs: [], env: {}});
  assert.equal(inspect.items.filter((item) => item.name === 'github')[0].direct, false);
  assert.equal(inspect.items.find((item) => item.name === 'cap').capSurface, true);
});

test('optimize refuses inline-table Codex TOML and leaves the file untouched', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  const unsafe = 'mcp_servers = { github = { command = "gh-mcp" } }\n';
  await fs.writeFile(ctx.codexConfig, unsafe);
  const plan = await buildOptimizationPlan({...ctx.options, jsonConfigs: []});
  assert.equal(plan.refused[0].reason, 'inline-table');
  assert.match(plan.refused[0].guidance, /not rewritten/);
  const result = await applyOptimization({...ctx.options, jsonConfigs: []});
  assert.equal(result.changed.length, 0);
  assert.equal(result.refused[0].reason, 'inline-table');
  assert.equal(await fs.readFile(ctx.codexConfig, 'utf8'), unsafe);
  const siblings = await fs.readdir(path.dirname(ctx.codexConfig));
  assert.equal(siblings.some((name) => name.endsWith('.cap-backup')), false);
});

test('optimize refuses table-form and mcp.servers Codex TOML', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, '[mcp_servers]\ngithub = { command = "gh-mcp" }\n');
  const tableForm = await applyOptimization({...ctx.options, jsonConfigs: []});
  assert.equal(tableForm.changed.length, 0);
  assert.equal(tableForm.refused[0].reason, 'table-form');
  assert.match(await fs.readFile(ctx.codexConfig, 'utf8'), /^\[mcp_servers\]/m);

  await fs.writeFile(ctx.codexConfig, '[mcp.servers.github]\ncommand = "gh-mcp"\n');
  const dotted = await applyOptimization({...ctx.options, jsonConfigs: []});
  assert.equal(dotted.changed.length, 0);
  assert.equal(dotted.refused[0].reason, 'mcp.servers');
  assert.match(await fs.readFile(ctx.codexConfig, 'utf8'), /\[mcp\.servers\.github\]/);
});

test('optimize refuses JSON mcp.servers without rewriting', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  const original = `${JSON.stringify({mcp: {servers: {github: {command: 'gh-mcp'}}}}, null, 2)}\n`;
  await fs.writeFile(ctx.claudeJson, original);
  const result = await applyOptimization(ctx.options);
  assert.equal(result.changed.length, 0);
  assert.equal(result.refused[0].reason, 'mcp.servers');
  assert.equal(result.refused[0].adapter, 'json-mcp.servers');
  assert.equal(await fs.readFile(ctx.claudeJson, 'utf8'), original);
});

test('optimize refuses unparseable Codex tables that lack a quoted command', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  const unsafe = '[mcp_servers.github]\nurl = "https://example.invalid"\n';
  await fs.writeFile(ctx.codexConfig, unsafe);
  const result = await applyOptimization({...ctx.options, jsonConfigs: []});
  assert.equal(result.changed.length, 0);
  assert.equal(result.refused[0].reason, 'unparseable');
  assert.equal(await fs.readFile(ctx.codexConfig, 'utf8'), unsafe);
});

test('CLI optimize requires --apply and --yes together', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, CODEX_TOML);
  await assert.rejects(() => main(['optimize', '--apply'], ctx.options), /both --apply and --yes/);
  assert.match(await fs.readFile(ctx.codexConfig, 'utf8'), /\[mcp_servers\.github\]/);
});
