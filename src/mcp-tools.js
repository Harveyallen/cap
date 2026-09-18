/** Stable CAP MCP tool surface. Shared by the stdio server and inspect (no cycle). */

export const CAP_ENTRY_TOOLS = [
  {name: 'cap.search', description: 'Find capabilities for a task or intent.', inputSchema: {type: 'object', properties: {query: {type: 'string'}, limit: {type: 'integer', minimum: 1, maximum: 20}}, required: ['query']}},
  {name: 'cap.add', description: 'Add or connect a capability behind CAP. Optional server binds an MCP provider to a local mcpServers name without exposing that server to the LLM.', inputSchema: {type: 'object', properties: {capability_id: {type: 'string'}, provider_id: {type: 'string'}, server: {type: 'string'}}, required: ['capability_id']}},
  {name: 'cap.use', description: 'Execute a CAP-managed capability.', inputSchema: {type: 'object', properties: {capability_id: {type: 'string'}, input: {type: 'object'}}, required: ['capability_id']}},
  {name: 'cap.inject', description: 'Plan a minimal capability set to load for a task (V4 Dynamic Injection). Does not mutate Agent configs.', inputSchema: {type: 'object', properties: {query: {type: 'string'}, limit: {type: 'integer', minimum: 1, maximum: 10}}, required: ['query']}},
  {name: 'cap.inspect', description: 'Inspect local Agent capability health.', inputSchema: {type: 'object', properties: {}}}
];

const CAP_MCP_RE = /(^|[\\/])cap-mcp(\.js)?$/i;

export function exposedCapTools(options = {}) {
  const env = options.env ?? process.env;
  const includeInspect = options.exposeInspect ?? env.CAP_MCP_INSPECT === '1';
  const includeInject = options.exposeInject ?? env.CAP_MCP_INJECT === '1';
  return CAP_ENTRY_TOOLS.filter((tool) => {
    if (tool.name === 'cap.inspect') return includeInspect;
    if (tool.name === 'cap.inject') return includeInject;
    return true;
  });
}

/** True when a scanned MCP config is this package's cap-mcp entry (not a third-party server named "cap"). */
export function isCapMcpConfig(config = {}, text = '') {
  const parts = [config.command, ...(Array.isArray(config.args) ? config.args : [])]
    .filter((part) => part != null && part !== '')
    .map((part) => String(part).replace(/\\/g, '/'));
  if (parts.some((part) => CAP_MCP_RE.test(part))) return true;
  return Boolean(text) && /(?:^|[\\/\s"'=])cap-mcp(?:\.js)?(?:\s|"|'|$)/i.test(text);
}
