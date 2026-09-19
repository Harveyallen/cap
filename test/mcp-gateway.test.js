import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {searchCapabilities} from '../src/search.js';
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

test('use without prior add registers MCP then executes', async (t) => {
  const options = await isolated(t);
  const before = await loadState(options);
  assert.equal(before.managed_capabilities.includes('dingtalk.im.message.send'), false);
  const result = await useCapability('dingtalk.im.message.send', {id: 'user-1', msgKey: 'sampleText', msgParam: {content: 'hello'}}, {
    ...options,
    launch: mockLaunch({CAP_MOCK_MCP_TOOL: 'send_message'})
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.mcp_tool, 'send_message');
  assert.equal(result.result.ok, true);
  const state = await loadState(options);
  assert.ok(state.managed_capabilities.includes('dingtalk.im.message.send'));
  assert.ok(state.managed_providers.includes('dingtalk.mcp'));
  assert.equal(state.mcp_bindings['dingtalk.mcp'].command, process.execPath);
  assert.ok(state.activity.some((row) => row.action === 'add' && row.capability_id === 'dingtalk.im.message.send'));
  assert.equal(state.activity[0].action, 'use');
});

test('use without add still records missing_launch after implicit register', async (t) => {
  const options = await isolated(t);
  const result = await useCapability('dingtalk.im.message.send', {text: 'nope'}, options);
  assert.equal(result.status, 'connection_required');
  assert.equal(result.reason, 'missing_launch');
  assert.ok(Array.isArray(result.next_steps));
  const state = await loadState(options);
  assert.ok(state.managed_capabilities.includes('dingtalk.im.message.send'));
  assert.ok(state.managed_providers.includes('dingtalk.mcp'));
});

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
  const added = await addCapability('dingtalk.im.message.send', undefined, options);
  assert.equal(added.binding.bound, false);
  assert.equal(added.binding.reason, 'missing_launch');
  assert.ok(Array.isArray(added.next_steps));
  assert.ok(added.next_steps.length > 0);
  assert.ok(added.tried_aliases.includes('dingtalk'));
  assert.match(added.next_steps.join('\n'), /--server|mcpServers|docs\/mcp-gateway\.md/);

  const result = await useCapability('dingtalk.im.message.send', {text: 'nope'}, options);
  assert.equal(result.status, 'connection_required');
  assert.equal(result.reason, 'missing_launch');
  assert.match(result.message, /dingtalk/);
  assert.ok(Array.isArray(result.next_steps));
  assert.ok(result.next_steps.length > 0);
  assert.ok(result.tried_aliases.includes('dingtalk'));
  assert.notEqual(result.status, 'completed');

  await addCapability('github.pr.review', undefined, options);
  const github = await useCapability('github.pr.review', {repository: 'Harveyallen/cap'}, options);
  assert.equal(github.status, 'connection_required');
  assert.equal(github.reason, 'missing_launch');
  assert.ok(github.next_steps.length > 0);
});

test('add binds DingTalk from a dingtalk-mcp mcpServers key', async (t) => {
  const options = await isolated(t);
  const claudeJson = path.join(options.userHome, '.claude.json');
  await fs.writeFile(claudeJson, JSON.stringify({mcpServers: {
    'dingtalk-mcp': {command: process.execPath, args: [mockMcp], env: {DINGTALK_APP_SECRET: 's3cret'}}
  }}, null, 2));
  options.jsonConfigs = [[claudeJson, 'Claude Code']];
  const added = await addCapability('dingtalk.im.message.send', undefined, options);
  assert.equal(added.binding.bound, true);
  assert.equal(added.binding.server, 'dingtalk-mcp');
  assert.deepEqual(added.binding.envKeys, ['DINGTALK_APP_SECRET']);
  const result = await useCapability('dingtalk.im.message.send', {text: 'ping'}, options);
  assert.equal(result.status, 'completed');
});

test('add binds DingTalk from default Cursor mcp.json without jsonConfigs override', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-cursor-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const userHome = path.join(root, 'user');
  const projectRoot = path.join(root, 'project');
  await fs.mkdir(path.join(userHome, '.cursor'), {recursive: true});
  await fs.mkdir(projectRoot, {recursive: true});
  await fs.writeFile(path.join(userHome, '.cursor', 'mcp.json'), JSON.stringify({mcpServers: {
    dingtalk: {command: process.execPath, args: [mockMcp]}
  }}, null, 2));
  const options = {
    home: path.join(root, 'state'),
    userHome,
    projectRoot,
    skillRoots: [],
    codexConfig: path.join(root, 'missing.toml'),
    env: {}
  };
  const added = await addCapability('dingtalk.im.message.send', undefined, options);
  assert.equal(added.binding.bound, true);
  assert.equal(added.binding.server, 'dingtalk');
  const result = await useCapability('dingtalk.im.message.send', {ok: true}, options);
  assert.equal(result.status, 'completed');
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

test('add/search return live MCP input_schema when bound; catalog when not', async (t) => {
  const options = await isolated(t);
  const unbound = await searchCapabilities('发送钉钉消息', options);
  assert.equal(unbound[0].capability_id, 'dingtalk.im.message.send');
  assert.equal(unbound[0].schema_source, 'catalog');
  assert.equal(unbound[0].input_schema.properties.msgKey.enum, undefined);

  const added = await addCapability('dingtalk.im.message.send', undefined, {
    ...options,
    launch: mockLaunch({CAP_MOCK_MCP_TOOL: 'send_message'})
  });
  assert.equal(added.schema_source, 'mcp');
  assert.equal(added.capability.schema_source, 'mcp');
  assert.deepEqual(added.input_schema.properties.msgKey.enum, ['sampleText']);
  assert.deepEqual(added.input_schema.required, ['id', 'msgKey', 'msgParam']);
  assert.equal(added.input_schema.properties.msgParam.properties.content.type, 'string');

  const hits = await searchCapabilities('发送钉钉消息', options);
  assert.equal(hits[0].schema_source, 'mcp');
  assert.deepEqual(hits[0].input_schema.properties.msgKey.enum, ['sampleText']);

  const viaMcp = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {name: 'cap.search', arguments: {query: '发送钉钉消息'}}
  }, options);
  assert.equal(viaMcp.result.structuredContent[0].schema_source, 'mcp');
  assert.deepEqual(viaMcp.result.structuredContent[0].input_schema.properties.msgKey.enum, ['sampleText']);

  const listed = await handleMcpMessage({jsonrpc: '2.0', id: 10, method: 'tools/list'}, {...options, env: {}});
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['cap.search', 'cap.add', 'cap.use']);
});

test('MCP schema falls back to catalog when mapped tool is missing', async (t) => {
  const options = await isolated(t);
  const added = await addCapability('dingtalk.im.message.send', undefined, {
    ...options,
    launch: mockLaunch({CAP_MOCK_MCP_TOOL: 'other_tool'})
  });
  assert.equal(added.schema_source, 'catalog');
  assert.equal(added.input_schema.properties.msgKey.enum, undefined);
  assert.equal(added.input_schema.properties.payload, undefined);
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
  assert.equal(added.schema_source, 'mcp');
  assert.deepEqual(added.input_schema.properties.msgKey.enum, ['sampleText']);
  const result = await useCapability('dingtalk.im.message.send', {ok: true}, options);
  assert.equal(result.status, 'completed');
});
