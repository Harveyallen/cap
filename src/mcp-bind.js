/** Resolve how to launch a catalog MCP provider from local Agent configs / Registry. Inspect-like read only. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {isCapMcpConfig} from './mcp-tools.js';

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function copyEnv(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (value == null) continue;
    out[key] = String(value);
  }
  return Object.keys(out).length ? out : undefined;
}

export function launchFromConfig(config = {}) {
  if (!config || typeof config !== 'object') return null;
  const env = copyEnv(config.env);
  const cwd = config.cwd ? String(config.cwd) : undefined;
  const args = Array.isArray(config.args) ? config.args.map(String) : [];
  if (config.command) {
    return {command: String(config.command), args, env, cwd, transport: 'stdio'};
  }
  if (config.url) return {url: String(config.url), env, transport: 'http'};
  return null;
}

export function mcpServerAliases(provider = {}, preferred) {
  const names = [
    preferred,
    provider.mcp_server,
    provider.provider_id,
    provider.provider_id?.split('.')[0],
    provider.name,
    String(provider.name ?? '').replace(/\s*MCP\s*$/i, '')
  ];
  return new Set(names.filter(Boolean).map(normalizeName));
}

export function describeBinding(binding) {
  if (!binding?.command) {
    return {
      bound: false,
      server: binding?.server ?? binding?.name,
      transport: binding?.transport,
      source: binding?.source
    };
  }
  return {
    bound: true,
    server: binding.server ?? binding.name,
    command: binding.command,
    args: binding.args ?? [],
    source: binding.source,
    transport: binding.transport ?? 'stdio',
    envKeys: binding.env ? Object.keys(binding.env) : []
  };
}

export function storeBinding(binding) {
  if (!binding) return null;
  const stored = {
    server: binding.server ?? binding.name,
    command: binding.command,
    args: binding.args ?? [],
    source: binding.source,
    transport: binding.transport ?? (binding.command ? 'stdio' : binding.url ? 'http' : undefined),
    boundAt: new Date().toISOString()
  };
  if (binding.env) stored.env = binding.env;
  if (binding.cwd) stored.cwd = binding.cwd;
  if (binding.url) stored.url = binding.url;
  return stored;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return null;
  }
}

function serverEntries(value) {
  const servers = value?.mcpServers ?? value?.mcp_servers ?? value?.mcp?.servers;
  return servers && typeof servers === 'object' ? Object.entries(servers) : [];
}

function parseTomlLaunch(block) {
  const command = block.match(/^\s*command\s*=\s*"((?:\\.|[^"\\])*)"/m)?.[1];
  if (!command) return null;
  const argsBlock = block.match(/^\s*args\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? '';
  const args = [...argsBlock.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);
  return launchFromConfig({command, args});
}

async function scanJsonConfigs(files) {
  const found = [];
  for (const [file, agent] of files) {
    const value = await readJson(file);
    if (!value) continue;
    for (const [name, config] of serverEntries(value)) {
      if (isCapMcpConfig(config)) continue;
      const launch = launchFromConfig(config);
      if (!launch) continue;
      found.push({name, agent, source: file, ...launch});
    }
  }
  return found;
}

async function scanCodexToml(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const headers = [...text.matchAll(/^\[mcp_servers\.(["']?)([^\]"']+)\1\]\s*$/gm)];
  return headers.flatMap((match, index) => {
    const name = match[2];
    if (name.includes('.')) return [];
    const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(match.index, end);
    if (isCapMcpConfig({}, block)) return [];
    const launch = parseTomlLaunch(block);
    if (!launch) return [];
    return [{name, agent: 'Codex', source: file, ...launch}];
  });
}

function defaultJsonConfigs(userHome, projectRoot) {
  return [
    [path.join(userHome, '.claude.json'), 'Claude Code'],
    [path.join(userHome, '.claude', 'settings.json'), 'Claude Code'],
    [path.join(projectRoot, '.mcp.json'), 'Project']
  ];
}

/** Local stdio launch candidates. Same JSON/TOML roots as inspect; also Registry `external_providers`. */
export async function listMcpLaunchCandidates(options = {}, state = {}) {
  const userHome = options.userHome ?? os.homedir();
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const jsonConfigs = options.jsonConfigs ?? defaultJsonConfigs(userHome, projectRoot);
  const fromRegistry = (state.external_providers ?? []).flatMap((item) => {
    if (item.type && item.type !== 'MCP') return [];
    if (isCapMcpConfig(item.config ?? {}, '')) return [];
    const launch = launchFromConfig(item.config);
    if (!launch) return [];
    return [{name: item.name, agent: 'Registry', source: item.originalSource ?? 'registry', ...launch}];
  });
  const fromFiles = await Promise.all([
    scanJsonConfigs(jsonConfigs),
    scanCodexToml(options.codexConfig ?? path.join(userHome, '.codex', 'config.toml'))
  ]);
  return [...fromRegistry, ...fromFiles.flat()];
}

function matchCandidate(candidates, provider, preferred) {
  const aliases = mcpServerAliases(provider, preferred);
  if (preferred) {
    const exact = candidates.find((item) => normalizeName(item.name) === normalizeName(preferred));
    if (exact) return exact;
  }
  return candidates.find((item) => aliases.has(normalizeName(item.name))) ?? null;
}

/**
 * Binding for an MCP provider: explicit launch, `--server` / catalog `mcp_server` match, then catalog command.
 * Does not spawn or connect.
 */
export async function resolveMcpBinding(provider, options = {}, state = {}) {
  if (options.launch?.command) {
    return {
      name: options.server ?? provider.mcp_server ?? provider.provider_id,
      server: options.server ?? provider.mcp_server ?? provider.provider_id,
      command: String(options.launch.command),
      args: Array.isArray(options.launch.args) ? options.launch.args.map(String) : [],
      env: copyEnv(options.launch.env),
      cwd: options.launch.cwd,
      source: options.launch.source ?? 'explicit',
      transport: 'stdio'
    };
  }
  const candidates = await listMcpLaunchCandidates(options, state);
  const matched = matchCandidate(candidates, provider, options.server);
  if (matched) {
    return {...matched, server: matched.name};
  }
  if (provider.command) {
    return {
      name: provider.mcp_server ?? provider.provider_id,
      server: provider.mcp_server ?? provider.provider_id,
      command: String(provider.command),
      args: Array.isArray(provider.args) ? provider.args.map(String) : [],
      source: 'catalog',
      transport: 'stdio'
    };
  }
  return null;
}

export function missingLaunchMessage(provider) {
  const aliases = [...mcpServerAliases(provider)].filter(Boolean);
  const hint = aliases.length ? aliases.join(', ') : provider?.provider_id;
  return `The MCP provider is registered but CAP has no stdio launch binding (no matching mcpServers / migrated Registry entry). Tried aliases: ${hint}. Keep the server in Claude/Codex/project MCP config or pass --server, then cap add again.`;
}
