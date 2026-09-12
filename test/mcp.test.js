import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleMcpMessage } from '../src/mcp-server.js';

test('MCP exposes a small stable tool surface', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 1, method: 'tools/list'}, {home});
  assert.deepEqual(response.result.tools.map((tool) => tool.name), ['cap.search', 'cap.add', 'cap.use']);
});

test('MCP acquire tool is removed', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-add-gone-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const listed = await handleMcpMessage({jsonrpc: '2.0', id: 4, method: 'tools/list'}, {home});
  assert.equal(listed.result.tools.some((tool) => tool.name === 'cap.acquire'), false);
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 5, method: 'tools/call', params: {name: 'cap.acquire', arguments: {capability_id: 'git.repository.status'}}}, {home});
  assert.equal(response.error.message, 'Tool is not exposed: cap.acquire');
});

test('MCP inspect is opt-in', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-inspect-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 3, method: 'tools/list'}, {home, exposeInspect: true});
  assert.equal(response.result.tools.at(-1).name, 'cap.inspect');
});

test('MCP add registers a managed capability', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-add-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 6, method: 'tools/call', params: {name: 'cap.add', arguments: {capability_id: 'git.repository.status'}}}, {home});
  assert.equal(response.result.structuredContent.capability.capability_id, 'git.repository.status');
  assert.equal(response.result.structuredContent.provider.status, 'CAP Managed');
});

test('MCP search returns structured capability results', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-search-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'cap.search', arguments: {query: 'PDF to markdown'}}}, {home});
  assert.equal(response.result.structuredContent[0].capability_id, 'document.pdf.to_markdown');
});
