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
  assert.deepEqual(response.result.tools.map((tool) => tool.name), ['cap.search', 'cap.acquire', 'cap.use']);
});

test('MCP inspect is opt-in', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-inspect-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 3, method: 'tools/list'}, {home, exposeInspect: true});
  assert.equal(response.result.tools.at(-1).name, 'cap.inspect');
});

test('MCP search returns structured capability results', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cap-mcp-search-'));
  t.after(() => fs.rm(home, {recursive: true, force: true}));
  const response = await handleMcpMessage({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'cap.search', arguments: {query: 'PDF to markdown'}}}, {home});
  assert.equal(response.result.structuredContent[0].capability_id, 'document.pdf.to_markdown');
});
