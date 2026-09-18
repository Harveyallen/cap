/** Execute CAP-managed providers: local builtins (git / ripgrep) or stdio MCP gateway. */
import {spawn} from 'node:child_process';
import path from 'node:path';
import {callMcpTool} from './mcp-client.js';
import {describeBinding, missingLaunchMessage, resolveMcpBinding, storeBinding} from './mcp-bind.js';
import {loadCatalog, loadState, saveState} from './registry.js';

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {cwd: options.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    const max = options.maxOutput ?? 100_000;
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeout ?? 15_000);
    child.stdout.on('data', (chunk) => { if (stdout.length < max) stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < max) stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({code, stdout: stdout.slice(0, max), stderr: stderr.slice(0, max)});
    });
  });
}

async function record(state, row, options) {
  state.activity.unshift({at: new Date().toISOString(), ...row});
  state.activity = state.activity.slice(0, 100);
  await saveState(state, options);
}

function connectionRequired({capability, providerId, reason, message}) {
  return {
    status: 'connection_required',
    reason,
    capability_id: capability.capability_id,
    provider_id: providerId,
    permissions: capability.permissions,
    mcp_tool: capability.mcp_tool,
    message
  };
}

async function bindMcp(provider, state, options) {
  const stored = state.mcp_bindings?.[provider.provider_id];
  if (stored?.command) return stored;
  const resolved = await resolveMcpBinding(provider, options, state);
  if (!resolved) return stored ?? null;
  state.mcp_bindings ??= {};
  state.mcp_bindings[provider.provider_id] = storeBinding(resolved);
  return state.mcp_bindings[provider.provider_id];
}

async function useBuiltin(capabilityId, provider, input) {
  if (capabilityId === 'git.repository.status') {
    const cwd = path.resolve(input.path ?? process.cwd());
    return run(provider.executable, ['status', '--short', '--branch'], {cwd});
  }
  if (capabilityId === 'local.files.search') {
    if (!input.query) throw new Error('input.query is required');
    const cwd = path.resolve(input.path ?? process.cwd());
    return run(provider.executable, ['--line-number', '--color', 'never', '--', String(input.query), '.'], {cwd});
  }
  throw new Error(`No local executor is implemented for ${capabilityId}`);
}

async function useMcp(capability, provider, input, state, options) {
  if (!capability.mcp_tool) {
    const result = connectionRequired({
      capability,
      providerId: provider.provider_id,
      reason: 'missing_mcp_tool',
      message: `Capability ${capability.capability_id} has no mcp_tool mapping to a downstream MCP method.`
    });
    await record(state, {action: 'use', capability_id: capability.capability_id, provider_id: provider.provider_id, success: false, status: 'connection_required', reason: result.reason}, options);
    return result;
  }
  const binding = await bindMcp(provider, state, options);
  if (binding?.transport === 'http' && !binding.command) {
    const result = connectionRequired({
      capability,
      providerId: provider.provider_id,
      reason: 'unsupported_transport',
      message: `MCP provider ${provider.provider_id} is HTTP-only (${binding.url}). v1 gateway supports stdio JSON-RPC.`
    });
    await record(state, {action: 'use', capability_id: capability.capability_id, provider_id: provider.provider_id, success: false, status: 'connection_required', reason: result.reason}, options);
    return result;
  }
  if (!binding?.command) {
    const result = connectionRequired({
      capability,
      providerId: provider.provider_id,
      reason: 'missing_launch',
      message: missingLaunchMessage(provider)
    });
    await record(state, {action: 'use', capability_id: capability.capability_id, provider_id: provider.provider_id, success: false, status: 'connection_required', reason: result.reason}, options);
    return result;
  }
  try {
    const rpc = await callMcpTool(binding, capability.mcp_tool, input, {timeout: options.timeout});
    const success = !rpc.isError;
    await record(state, {
      action: 'use',
      capability_id: capability.capability_id,
      provider_id: provider.provider_id,
      success,
      mcp_tool: capability.mcp_tool,
      server: binding.server ?? binding.name
    }, options);
    return {
      status: success ? 'completed' : 'failed',
      capability_id: capability.capability_id,
      provider_id: provider.provider_id,
      mcp_tool: capability.mcp_tool,
      binding: describeBinding(binding),
      result: rpc.result,
      content: rpc.content
    };
  } catch (error) {
    await record(state, {
      action: 'use',
      capability_id: capability.capability_id,
      provider_id: provider.provider_id,
      success: false,
      mcp_tool: capability.mcp_tool,
      status: 'failed'
    }, options);
    return {
      status: 'failed',
      capability_id: capability.capability_id,
      provider_id: provider.provider_id,
      mcp_tool: capability.mcp_tool,
      binding: describeBinding(binding),
      message: error.message
    };
  }
}

export async function useCapability(capabilityId, input = {}, options = {}) {
  const [catalog, state] = await Promise.all([loadCatalog(), loadState(options)]);
  if (!state.managed_capabilities.includes(capabilityId)) throw new Error(`${capabilityId} is not CAP Managed. Run cap add ${capabilityId} first.`);
  const capability = catalog.capabilities.find((item) => item.capability_id === capabilityId);
  if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
  const providerId = capability.provider_refs.find((id) => state.managed_providers.includes(id));
  const provider = catalog.providers.find((item) => item.provider_id === providerId);
  if (provider?.executable) {
    const result = await useBuiltin(capabilityId, provider, input);
    const success = result.code === 0 || (capabilityId === 'local.files.search' && result.code === 1);
    await record(state, {action: 'use', capability_id: capabilityId, provider_id: providerId, success}, options);
    return {status: success ? 'completed' : 'failed', capability_id: capabilityId, provider_id: providerId, ...result};
  }
  if (provider?.type === 'MCP') {
    return useMcp(capability, provider, input, state, options);
  }
  const blocked = connectionRequired({
    capability,
    providerId,
    reason: 'unsupported_type',
    message: 'The provider is registered but needs its MCP/OAuth connection before use.'
  });
  await record(state, {
    action: 'use',
    capability_id: capabilityId,
    provider_id: providerId,
    success: false,
    status: 'connection_required',
    reason: blocked.reason
  }, options);
  return blocked;
}
