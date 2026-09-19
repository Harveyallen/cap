import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from '../src/inspector.js';
import { applyOptimization, buildOptimizationPlan, validateOptimizationOutcome } from '../src/optimize.js';
import { pinProvider } from '../src/pin.js';
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
  assert.equal(inspect.items.some((item) => item.name === 'github'), false);
  assert.equal(inspect.recommendations.some((item) => item.provider === 'github'), false);
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

test('optimize apply re-inspects and reports actual vs projected estimated savings', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, CODEX_TOML);
  const before = await inspectLocal({...ctx.options, jsonConfigs: [], env: {}});
  const result = await applyOptimization({...ctx.options, jsonConfigs: []});
  const after = await inspectLocal({...ctx.options, jsonConfigs: [], env: {}});
  const validation = result.validation;
  assert.equal(validation.ok, true);
  assert.equal(validation.estimated, true);
  assert.match(validation.note, /estimat/i);
  assert.match(validation.note, /characters\/4|tokenizer/i);
  assert.equal(validation.projected.before.contextTokens, before.summary.contextTokens);
  assert.equal(validation.projected.before.directTools, before.summary.directTools);
  assert.equal(validation.actual.after.contextTokens, after.summary.contextTokens);
  assert.equal(validation.actual.after.directTools, after.summary.directTools);
  assert.equal(validation.actual.tokensSaved, before.summary.contextTokens - after.summary.contextTokens);
  assert.equal(validation.projected.tokensSaved, before.summary.contextTokens - result.plan.after.contextTokens);
  assert.equal(validation.actual.capSurface, true);
  assert.ok(after.summary.contextTokens < before.summary.contextTokens);
  assert.match(result.message, /estimat/i);
});

test('post-optimize validation fails when config is invalid or CAP surface is gone', () => {
  const source = '/tmp/.claude.json';
  const plan = {
    before: {directTools: 5, contextTokens: 1000},
    after: {directTools: 3, contextTokens: 180},
    reductionPercent: 40,
    retained: [{name: 'cap', source}]
  };
  const changed = [{source, adapter: 'json-mcp', providers: ['github']}];
  const state = {
    external_providers: [{name: 'github', originalSource: source, type: 'MCP', config: {command: 'github-mcp'}}]
  };
  const invalid = validateOptimizationOutcome({
    plan,
    changed,
    inspection: {
      summary: {directTools: 3, contextTokens: 180, capSurface: true, reclaimableTokens: 0, pinned: 0, excluded: 0},
      items: [{kind: 'warning', source, message: 'Unexpected token'}]
    },
    state
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.estimated, true);
  assert.equal(invalid.failures[0].code, 'config_invalid');
  assert.match(invalid.failures[0].message, /Unexpected token/);

  const broken = validateOptimizationOutcome({
    plan,
    changed,
    inspection: {
      summary: {directTools: 0, contextTokens: 0, capSurface: false, reclaimableTokens: 0, pinned: 0, excluded: 0},
      items: []
    },
    state
  });
  assert.equal(broken.ok, false);
  assert.ok(broken.failures.some((item) => item.code === 'cap_surface_broken'));
  assert.match(broken.failures.find((item) => item.code === 'cap_surface_broken').message, /cap-mcp|CAP surface/i);
});

test('CLI optimize apply prints estimated savings and fails closed on validation errors', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.codexConfig, CODEX_TOML);
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['optimize', '--apply', '--yes', '--json'], {...ctx.options, jsonConfigs: []});
  const payload = JSON.parse(logs[0]);
  assert.equal(payload.validation.ok, true);
  assert.equal(payload.validation.estimated, true);
  assert.ok(payload.validation.actual.tokensSaved > 0);

  logs.length = 0;
  await assert.rejects(
    () => main(['optimize', '--apply', '--yes'], {
      ...ctx.options,
      jsonConfigs: [],
      afterInspect: async () => ({
        summary: {directTools: 0, contextTokens: 0, capSurface: false, reclaimableTokens: 0, pinned: 0, excluded: 0},
        items: []
      })
    }),
    /validation failed|CAP surface|cap-mcp/i
  );
});

test('optimize apply validation keeps pin/exclude remaining Direct Exposure as success', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.claudeJson, JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}, {name: 'comment_pr'}]},
    cap: {command: 'node', args: ['/tmp/bin/cap-mcp.js']}
  }}, null, 2));
  await pinProvider('github', ctx.options);
  const result = await applyOptimization(ctx.options);
  assert.equal(result.validation.ok, true);
  assert.equal(result.changed.length, 0);
  const config = JSON.parse(await fs.readFile(ctx.claudeJson, 'utf8'));
  assert.ok(config.mcpServers.github);
  assert.ok(config.mcpServers.cap);
  assert.equal(result.validation.actual.pinned, 1);
});
