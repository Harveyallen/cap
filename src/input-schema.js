/** On-demand JSON Schema for `cap.use` input. Live MCP `tools/list` when bound; catalog otherwise. */
import {listMcpLaunchCandidates, resolveMcpBinding} from './mcp-bind.js';
import {listMcpTools} from './mcp-client.js';

const CATALOG_TYPES = {
  string: {type: 'string'},
  number: {type: 'number'},
  integer: {type: 'integer'},
  boolean: {type: 'boolean'},
  object: {type: 'object'},
  array: {type: 'array'},
  path: {type: 'string', description: 'Filesystem path'},
  secret: {type: 'string', description: 'Secret; do not log'}
};

function isSchemaObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function propertyFromSpec(spec) {
  if (isSchemaObject(spec) && spec.type) return spec;
  const key = String(spec ?? 'string').toLowerCase();
  return {...(CATALOG_TYPES[key] ?? {type: 'string'})};
}

export function schemaFromCatalogInputs(inputs = {}) {
  const properties = {};
  const required = [];
  for (const [name, spec] of Object.entries(inputs ?? {})) {
    properties[name] = propertyFromSpec(spec);
    if (name !== 'path') required.push(name);
  }
  const schema = {type: 'object', properties};
  if (required.length) schema.required = required;
  return schema;
}

export function catalogInputSchema(capability) {
  return {
    input_schema: schemaFromCatalogInputs(capability?.inputs),
    schema_source: 'catalog'
  };
}

function pickMcpProvider(capability, providers, state = {}) {
  const refs = capability?.provider_refs ?? [];
  const managed = refs.find((id) => state.managed_providers?.includes(id) && providers.get(id)?.type === 'MCP');
  if (managed) return providers.get(managed);
  return refs.map((id) => providers.get(id)).find((item) => item?.type === 'MCP') ?? null;
}

async function resolveLaunch(provider, options, state) {
  const explicit = options.launch;
  if (explicit?.command) return explicit;
  const stored = state?.mcp_bindings?.[provider.provider_id];
  if (stored?.command) return stored;
  let launchCandidates = options.launchCandidates;
  if (typeof launchCandidates === 'function') launchCandidates = await launchCandidates();
  return resolveMcpBinding(provider, {...options, launchCandidates}, state);
}

/**
 * JSON Schema for filling `cap.use` `input`.
 * Prefers the mapped downstream tool's `inputSchema` when a stdio launch exists.
 */
export async function resolveInputSchema(capability, options = {}) {
  const fallback = catalogInputSchema(capability);
  if (options.liveSchema === false || !capability?.mcp_tool) return fallback;
  const state = options.state ?? {};
  const providers = options.providers ?? new Map();
  const provider = options.provider ?? pickMcpProvider(capability, providers, state);
  if (!provider || provider.type !== 'MCP') return fallback;
  let launch;
  try {
    launch = await resolveLaunch(provider, options, state);
  } catch {
    return fallback;
  }
  if (!launch?.command) return fallback;
  try {
    const tools = await listMcpTools(launch, {timeout: options.schemaTimeout ?? 8_000});
    const tool = tools.find((item) => item?.name === capability.mcp_tool);
    const schema = tool?.inputSchema ?? tool?.input_schema;
    if (!isSchemaObject(schema)) return fallback;
    return {input_schema: schema, schema_source: 'mcp'};
  } catch {
    return fallback;
  }
}

export async function attachInputSchemas(items, context = {}) {
  const {catalog, state = {}, options = {}} = context;
  const providers = new Map((catalog?.providers ?? []).map((item) => [item.provider_id, item]));
  let candidatesPromise;
  const launchCandidates = async () => {
    candidatesPromise ??= listMcpLaunchCandidates(options, state);
    return candidatesPromise;
  };
  return Promise.all(items.map(async (item) => {
    const schema = await resolveInputSchema(item, {...options, state, providers, launchCandidates});
    return {...item, ...schema};
  }));
}
