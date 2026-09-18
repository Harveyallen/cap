#!/usr/bin/env node
/** Local fake MCP for tests. Line-delimited JSON-RPC; no network, no credentials. */
import readline from 'node:readline';

const toolName = process.env.CAP_MOCK_MCP_TOOL || 'send_message';

async function handle(message) {
  const base = {jsonrpc: '2.0', id: message.id};
  if (message.method === 'initialize') {
    return {...base, result: {protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'cap-mock-mcp', version: '0.0.0'}}};
  }
  if (message.method === 'notifications/initialized') return null;
  if (message.method === 'ping') return {...base, result: {}};
  if (message.method === 'tools/list') {
    return {...base, result: {tools: [{name: toolName, description: 'Mock downstream MCP tool', inputSchema: {type: 'object'}}]}};
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    if (name !== toolName) return {...base, error: {code: -32000, message: `Unknown tool: ${name}`}};
    const args = message.params?.arguments ?? {};
    const payload = {ok: true, tool: name, arguments: args};
    return {...base, result: {content: [{type: 'text', text: JSON.stringify(payload)}], structuredContent: payload}};
  }
  if (message.id == null) return null;
  return {...base, error: {code: -32601, message: `Method not found: ${message.method}`}};
}

const input = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
for await (const line of input) {
  if (!line.trim()) continue;
  let response;
  try { response = await handle(JSON.parse(line)); }
  catch (error) { response = {jsonrpc: '2.0', id: null, error: {code: -32700, message: error.message}}; }
  if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
}
