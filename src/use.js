/** Execute CAP-managed builtin providers (git / ripgrep). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadCatalog, loadState, saveState } from './registry.js';

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

export async function useCapability(capabilityId, input = {}, options = {}) {
  const [catalog, state] = await Promise.all([loadCatalog(), loadState(options)]);
  if (!state.managed_capabilities.includes(capabilityId)) throw new Error(`${capabilityId} is not CAP Managed. Run cap add ${capabilityId} first.`);
  const capability = catalog.capabilities.find((item) => item.capability_id === capabilityId);
  if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
  const providerId = capability.provider_refs.find((id) => state.managed_providers.includes(id));
  const provider = catalog.providers.find((item) => item.provider_id === providerId);
  if (!provider?.executable) {
    state.activity.unshift({
      at: new Date().toISOString(),
      action: 'use',
      capability_id: capabilityId,
      provider_id: providerId,
      success: false,
      status: 'connection_required'
    });
    state.activity = state.activity.slice(0, 100);
    await saveState(state, options);
    return {status: 'connection_required', capability_id: capabilityId, provider_id: providerId, permissions: capability.permissions, message: 'The provider is registered but needs its MCP/OAuth connection before use.'};
  }
  let result;
  if (capabilityId === 'git.repository.status') {
    const cwd = path.resolve(input.path ?? process.cwd());
    result = await run(provider.executable, ['status', '--short', '--branch'], {cwd});
  } else if (capabilityId === 'local.files.search') {
    if (!input.query) throw new Error('input.query is required');
    const cwd = path.resolve(input.path ?? process.cwd());
    result = await run(provider.executable, ['--line-number', '--color', 'never', '--', String(input.query), '.'], {cwd});
  } else {
    throw new Error(`No local executor is implemented for ${capabilityId}`);
  }
  const success = result.code === 0 || (capabilityId === 'local.files.search' && result.code === 1);
  state.activity.unshift({at: new Date().toISOString(), action: 'use', capability_id: capabilityId, provider_id: providerId, success});
  state.activity = state.activity.slice(0, 100);
  await saveState(state, options);
  return {status: success ? 'completed' : 'failed', capability_id: capabilityId, provider_id: providerId, ...result};
}
