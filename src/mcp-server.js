import readline from 'node:readline';
import { searchCapabilities } from './search.js';
import { acquireCapability } from './registry.js';
import { useCapability } from './use.js';
import { inspectLocal } from './inspector.js';

const tools = [
  {name: 'cap.search', description: 'Find capabilities for a task or intent.', inputSchema: {type: 'object', properties: {query: {type: 'string'}, limit: {type: 'integer', minimum: 1, maximum: 20}}, required: ['query']}},
  {name: 'cap.acquire', description: 'Add or connect a capability behind CAP.', inputSchema: {type: 'object', properties: {capability_id: {type: 'string'}, provider_id: {type: 'string'}}, required: ['capability_id']}},
  {name: 'cap.use', description: 'Execute a CAP-managed capability.', inputSchema: {type: 'object', properties: {capability_id: {type: 'string'}, input: {type: 'object'}}, required: ['capability_id']}},
  {name: 'cap.inspect', description: 'Inspect local Agent capability health.', inputSchema: {type: 'object', properties: {}}}
];

function exposedTools(options = {}) {
  const includeInspect = options.exposeInspect ?? process.env.CAP_MCP_INSPECT === '1';
  return includeInspect ? tools : tools.filter((tool) => tool.name !== 'cap.inspect');
}

async function callTool(name, args, options) {
  if (name === 'cap.search') return searchCapabilities(args.query, {...options, limit: args.limit});
  if (name === 'cap.acquire') return acquireCapability(args.capability_id, args.provider_id, options);
  if (name === 'cap.use') return useCapability(args.capability_id, args.input, options);
  if (name === 'cap.inspect') return inspectLocal(options);
  throw new Error(`Unknown tool: ${name}`);
}

export async function handleMcpMessage(message, options = {}) {
  const base = {jsonrpc: '2.0', id: message.id};
  try {
    if (message.method === 'initialize') return {...base, result: {protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'cap', version: '0.1.0'}}};
    if (message.method === 'notifications/initialized') return null;
    if (message.method === 'ping') return {...base, result: {}};
    if (message.method === 'tools/list') return {...base, result: {tools: exposedTools(options)}};
    if (message.method === 'tools/call') {
      if (!exposedTools(options).some((tool) => tool.name === message.params?.name)) throw new Error(`Tool is not exposed: ${message.params?.name}`);
      const result = await callTool(message.params?.name, message.params?.arguments ?? {}, options);
      return {...base, result: {content: [{type: 'text', text: JSON.stringify(result, null, 2)}], structuredContent: result}};
    }
    return {...base, error: {code: -32601, message: `Method not found: ${message.method}`}};
  } catch (error) {
    return {...base, error: {code: -32000, message: error.message}};
  }
}

export async function startMcpServer(options = {}) {
  const input = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
  for await (const line of input) {
    if (!line.trim()) continue;
    let response;
    try { response = await handleMcpMessage(JSON.parse(line), options); }
    catch (error) { response = {jsonrpc: '2.0', id: null, error: {code: -32700, message: error.message}}; }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
