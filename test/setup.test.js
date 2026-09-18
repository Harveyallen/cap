import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOptimization } from '../src/optimize.js';
import { isCapMcpConfig } from '../src/mcp-tools.js';
import { main } from '../src/cli.js';
import { capMcpLaunch, renderCodexSnippet, setupCap } from '../src/setup.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-setup-'));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  const home = path.join(root, 'state');
  await fs.mkdir(userHome, {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(projectRoot, '.mcp.json'), `${JSON.stringify({mcpServers: {
    cap: {command: 'node', args: ['./bin/cap-mcp.js']}
  }}, null, 2)}\n`);
  const claudeJson = path.join(userHome, '.claude.json');
  const claudeSkills = path.join(userHome, '.claude', 'skills');
  const codexConfig = path.join(userHome, '.codex', 'config.toml');
  const options = {
    userHome,
    projectRoot,
    home,
    claudeConfig: claudeJson,
    claudeSkillRoot: claudeSkills,
    codexConfig,
    jsonConfigs: [[claudeJson, 'Claude Code']],
    skillRoots: [[claudeSkills, 'Claude Code'], [path.join(userHome, '.codex', 'skills'), 'Codex']],
    env: {}
  };
  return {root, userHome, projectRoot, home, claudeJson, claudeSkills, codexConfig, options};
}

test('isCapMcpConfig keys off cap-mcp, not a server named cap', () => {
  assert.equal(isCapMcpConfig({command: 'node', args: [path.join(repoRoot, 'bin', 'cap-mcp.js')]}), true);
  assert.equal(isCapMcpConfig({command: 'npx', args: ['-y', '-p', '@harvey2008/cap', 'cap-mcp']}), true);
  assert.equal(isCapMcpConfig({command: 'other-cap', args: ['--name', 'cap']}), false);
  assert.equal(isCapMcpConfig({}, '[mcp_servers.cap]\ncommand = "node"\nargs = ["/tmp/bin/cap-mcp.js"]\n'), true);
  assert.equal(isCapMcpConfig({}, '[mcp_servers.cap]\ncommand = "other"\n'), false);
});

test('setup backs up JSON, writes CAP MCP, and installs the Skill', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.writeFile(ctx.claudeJson, `${JSON.stringify({mcpServers: {
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}]}
  }}, null, 2)}\n`);
  const projectBefore = await fs.readFile(path.join(ctx.projectRoot, '.mcp.json'), 'utf8');
  const result = await setupCap({...ctx.options, agent: 'claude'});
  const config = JSON.parse(await fs.readFile(ctx.claudeJson, 'utf8'));
  assert.equal(config.mcpServers.github.command, 'github-mcp');
  assert.equal(config.mcpServers.cap.command, 'node');
  assert.equal(config.mcpServers.cap.args.at(-1), path.join(repoRoot, 'bin', 'cap-mcp.js'));
  assert.equal(config.mcpServers.cap.env.CAP_MCP_INSPECT, '1');
  assert.equal(result.writes.some((item) => item.path === ctx.claudeJson && item.backup), true);
  await fs.access(result.writes.find((item) => item.path === ctx.claudeJson).backup);
  const skill = await fs.readFile(path.join(ctx.claudeSkills, 'cap-context-health', 'SKILL.md'), 'utf8');
  assert.match(skill, /cap-context-health/);
  assert.match(skill, /cap\.inspect/);
  assert.equal(await fs.readFile(path.join(ctx.projectRoot, '.mcp.json'), 'utf8'), projectBefore);
  assert.equal(result.inspection.recommendations.some((item) => item.provider === 'cap'), false);
  assert.equal(result.inspection.recommendations.some((item) => item.provider === 'github'), true);
  assert.ok(result.inspection.items.some((item) => item.name === 'cap-context-health'));
  const again = await setupCap({...ctx.options, agent: 'claude'});
  assert.equal(again.skipped.some((item) => item.reason === 'already-installed'), true);
});

test('setup --agent selects claude or codex', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.mkdir(path.join(ctx.userHome, '.claude'), {recursive: true});
  await fs.mkdir(path.join(ctx.userHome, '.codex'), {recursive: true});
  await fs.writeFile(ctx.codexConfig, '[mcp_servers.other]\ncommand = "other"\n');

  const claudeOnly = await setupCap({...ctx.options, agent: 'claude'});
  assert.deepEqual(claudeOnly.targets, ['claude']);
  JSON.parse(await fs.readFile(ctx.claudeJson, 'utf8'));
  assert.equal(await fs.readFile(ctx.codexConfig, 'utf8'), '[mcp_servers.other]\ncommand = "other"\n');
  await fs.access(path.join(ctx.claudeSkills, 'cap-context-health', 'SKILL.md'));
  await assert.rejects(() => fs.access(path.join(ctx.userHome, '.codex', 'skills', 'cap-context-health', 'SKILL.md')));

  const codexOnly = await setupCap({...ctx.options, agent: 'codex'});
  assert.deepEqual(codexOnly.targets, ['codex']);
  const toml = await fs.readFile(ctx.codexConfig, 'utf8');
  assert.match(toml, /\[mcp_servers\.other\]/);
  assert.match(toml, /\[mcp_servers\.cap\]/);
  assert.match(toml, /cap-mcp\.js/);
  await fs.access(path.join(ctx.userHome, '.codex', 'skills', 'cap-context-health', 'SKILL.md'));
  assert.equal(codexOnly.writes.some((item) => item.path === ctx.codexConfig && item.backup), true);

  await assert.rejects(() => setupCap({...ctx.options, agent: 'both'}), /Unknown --agent/);
});

test('setup auto detects Codex and falls back to Claude when none exist', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  await fs.mkdir(path.join(ctx.userHome, '.codex'), {recursive: true});
  await fs.writeFile(ctx.codexConfig, '# empty-ish\n');
  const detected = await setupCap({...ctx.options, agent: 'auto'});
  assert.deepEqual(detected.targets, ['codex']);
  await fs.access(path.join(ctx.userHome, '.codex', 'skills', 'cap-context-health', 'SKILL.md'));
  await assert.rejects(() => fs.access(ctx.claudeJson));

  const empty = await fixture();
  t.after(() => fs.rm(empty.root, {recursive: true, force: true}));
  const created = await setupCap({...empty.options, agent: 'auto'});
  assert.deepEqual(created.targets, ['claude']);
  JSON.parse(await fs.readFile(empty.claudeJson, 'utf8'));
});

test('Codex unsafe TOML prints a snippet, still writes Skill and inspects', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  const unsafe = 'mcp_servers = { other = { command = "x" } }\n';
  await fs.mkdir(path.dirname(ctx.codexConfig), {recursive: true});
  await fs.writeFile(ctx.codexConfig, unsafe);
  const result = await setupCap({...ctx.options, agent: 'codex'});
  assert.equal(await fs.readFile(ctx.codexConfig, 'utf8'), unsafe);
  assert.equal(result.writes.some((item) => item.path === ctx.codexConfig), false);
  assert.equal(result.manual.length, 1);
  assert.match(result.manual[0].snippet, /\[mcp_servers\.cap\]/);
  assert.match(result.manual[0].snippet, /CAP_MCP_INSPECT/);
  assert.equal(result.manual[0].reason, 'inline-table');
  const skill = await fs.readFile(path.join(ctx.userHome, '.codex', 'skills', 'cap-context-health', 'SKILL.md'), 'utf8');
  assert.match(skill, /Context Pressure/);
  assert.ok(result.inspection);
  assert.equal(typeof result.inspection.pressure.band, 'string');
});

test('CLI setup prints inspect and does not expose acquire', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  t.after(() => { console.log = original; });
  await main(['setup', '--agent', 'claude'], ctx.options);
  const text = logs.join('\n');
  assert.match(text, /CAP Setup/);
  assert.match(text, /cap-context-health/);
  assert.match(text, /CAP Inspect/);
  assert.doesNotMatch(text, /acquire/i);
  await assert.rejects(() => main(['acquire'], ctx.options), /Unknown command: acquire/);
});

test('optimize keeps cap-mcp and does not wipe project-style CAP entries', async (t) => {
  const ctx = await fixture();
  t.after(() => fs.rm(ctx.root, {recursive: true, force: true}));
  const launch = capMcpLaunch();
  await fs.writeFile(ctx.claudeJson, `${JSON.stringify({mcpServers: {
    cap: launch,
    github: {command: 'github-mcp', tools: [{name: 'get_pr'}]}
  }}, null, 2)}\n`);
  const result = await applyOptimization(ctx.options);
  const config = JSON.parse(await fs.readFile(ctx.claudeJson, 'utf8'));
  assert.deepEqual(config.mcpServers.cap, launch);
  assert.equal(config.mcpServers.github, undefined);
  assert.deepEqual(result.changed[0].providers, ['github']);
  assert.equal(await fs.readFile(path.join(ctx.projectRoot, '.mcp.json'), 'utf8').then((text) => JSON.parse(text).mcpServers.cap.command), 'node');
  assert.match(renderCodexSnippet(launch), /cap-mcp\.js/);
});
