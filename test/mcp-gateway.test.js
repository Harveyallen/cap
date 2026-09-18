import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {addCapability, loadState} from '../src/registry.js';
import {useCapability} from '../src/use.js';
import {handleMcpMessage} from '../src/mcp-server.js';
import {applyOptimization} from '../src/optimize.js';
import {main} from '../src/cli.js';

const mockMcp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mock-mcp-server.js');

async function isolated(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-gw-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  await fs.mkdir(userHome, {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  return {
    root,
    home: path.join(root, 'state'),
    userHome,
    projectRoot,
    jsonConfigs: [],
    skillRoots: [],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  };
}

function mockLaunch(extraEnv) {
  return {
    command: process.execPath,
    args: [mockMcp],
    env: extraEnv
  };
}

test('mock MCP tool is callable via cap.use after add', async (t) => {
  const options = await isolated(t);
  const added = await addCapability('dingtalk.im.message.send', undefined, {
    ...options,
    launch: mockLaunch({CAP_MOCK_MCP_TOOL: 'send_message'})
  });
  assert.equal(added.binding.bound, true);
  assert.equal(added.binding.command, process.execPath);
  assert.deepEqual(added.binding.envKeys, ['CAP_MOCK_MCP_TOOL']);
  assert.equal(added.binding.env, undefined);

  const result = await useCapability('dingtalk.im.message.send', {id: 'user-1', msgKey: 'sampleText', msgParam: {content: 'hello'}}, options);
  assert.equal(result.status, 'completed');
  assert.equal(result.mcp_tool, 'send_message');
  assert.equal(result.result.ok, true);
  assert.equal(result.result.arguments.id, 'user-1');
  assert.equal(result.result.arguments.msgParam.content, 'hello');

  const listed = await handleMcpMessage({jsonrpc: '2.0', id: 1, method: 'tools/list'}, {...options, env: {}});
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['cap.search', 'cap.add', 'cap.use']);
});

test('matching local mcpServers binds at add without exposing the server', async (t) => {
  const options = await isolated(t);
  const claudeJson = path.join(options.userHome, '.claude.json');
  await fs.writeFile(claudeJson, JSON.stringify({mcpServers: {
    dingtalk: {command: process.execPath, args: [mockMcp], env: {DINGTALK_APP_SECRET: 's3cret'}}
  }}, null, 2));
  options.jsonConfigs = [[claudeJson, 'Claude Code']];
  const added = await addCapability('dingtalk.im.message.send', undefined, options);
  assert.equal(added.binding.bound, true);
  assert.equal(added.binding.server, 'dingtalk');
  assert.deepEqual(added.binding.envKeys, ['DINGTALK_APP_SECRET']);

  const state = await loadState(options);
  assert.equal(state.mcp_bindings['dingtalk.mcp'].env.DINGTALK_APP_SECRET, 's3cret');

  const result = await useCapability('dingtalk.im.message.send', {text: 'ping'}, options);
  assert.equal(result.status, 'completed');
  assert.equal(result.result.arguments.text, 'ping');
});

test('optimize migrates the MCP out of Agent tools but cap.use still reaches it', async (t) => {
  const options = await isolated(t);
  const claudeJson = path.join(options.userHome, '.claude.json');
  await fs.writeFile(claudeJson, JSON.stringify({mcpServers: {
    dingtalk: {command: process.execPath, args: [mockMcp]}
  }}, null, 2));
  options.jsonConfigs = [[claudeJson, 'Claude Code']];
  const migrated = await applyOptimization(options);
  assert.equal(migrated.changed.length, 1);
  const config = JSON.parse(await fs.readFile(claudeJson, 'utf8'));
  assert.equal(config.mcpServers.dingtalk, undefined);

  await addCapability('dingtalk.im.message.send', undefined, options);
  const result = await useCapability('dingtalk.im.message.send', {channel: 'chat'}, options);
  assert.equal(result.status, 'completed');
  assert.equal(result.result.ok, true);
  assert.equal(result.result.arguments.channel, 'chat');
});

test('missing MCP launch stays connection_required', async (t) => {
  const options = await isolated(t);
  await addCapability('dingtalk.im.message.send', undefined, options);
  const result = await useCapability('dingtalk.im.message.send', {text: 'nope'}, options);
  assert.equal(result.status, 'connection_required');
  assert.equal(result.reason, 'missing_launch');
  assert.match(result.message, /dingtalk/);
  assert.notEqual(result.status, 'completed');

  await addCapability('github.pr.review', undefined, options);
  const github = await useCapability('github.pr.review', {repository: 'Harveyallen/cap'}, options);
  assert.equal(github.status, 'connection_required');
  assert.equal(github.reason, 'missing_launch');
});

test('skill providers stay connection_required', async (t) => {
  const options = await isolated(t);
  await addCapability('document.pdf.to_markdown', undefined, options);
  const result = await useCapability('document.pdf.to_markdown', {file: 'x.pdf'}, options);
  assert.equal(result.status, 'connection_required');
  assert.equal(result.reason, 'unsupported_type');
});

test('wrong downstream tool is failed, not fake success', async (t) => {
  const options = await isolated(t);
  await addCapability('dingtalk.im.message.send', undefined, {
    ...options,
    launch: mockLaunch({CAP_MOCK_MCP_TOOL: 'other_tool'})
  });
  const result = await useCapability('dingtalk.im.message.send', {text: 'x'}, options);
  assert.equal(result.status, 'failed');
  assert.match(result.message, /Unknown tool: send_message/);
});

test('CLI --server selects a local MCP entry', async (t) => {
  const options = await isolated(t);
  const claudeJson = path.join(options.userHome, '.claude.json');
  await fs.writeFile(claudeJson, JSON.stringify({mcpServers: {
    other: {command: 'false', args: []},
    dingtalk: {command: process.execPath, args: [mockMcp]}
  }}, null, 2));
  options.jsonConfigs = [[claudeJson, 'Claude Code']];
  const chunks = [];
  const orig = console.log;
  console.log = (value) => chunks.push(value);
  try {
    await main(['add', 'dingtalk.im.message.send', '--server', 'dingtalk', '--json'], options);
  } finally {
    console.log = orig;
  }
  const added = JSON.parse(chunks.join('\n'));
  assert.equal(added.binding.server, 'dingtalk');
  const result = await useCapability('dingtalk.im.message.send', {ok: true}, options);
  assert.equal(result.status, 'completed');
});
