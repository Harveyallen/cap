/** Write CAP MCP + Context Health Skill into Claude Code / Codex, then inspect. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectLocal } from './inspector.js';
import { isCapMcpConfig } from './mcp-tools.js';
import { packageRoot } from './paths.js';
import { registerLocalSkills } from './registry.js';

const AGENTS = new Set(['auto', 'claude', 'codex']);
const SERVER_NAME = 'cap';

export const CONTEXT_HEALTH_SKILL = `---
name: cap-context-health
description: 查看 Agent 上下文占用、Context Pressure、漏斗和可回收 token。遇到「上下文占用 / MCP 是否过多」时优先用 cap.inspect / cap inspect。
---

# CAP Context Health

安装 CAP 后先运行 \`cap inspect\`（MCP 工具是 \`cap.inspect\`，需 \`CAP_MCP_INSPECT=1\`）。

用中文汇报：
- Pressure（压力带 / health / 占用百分比）
- Funnel（installed → enabled → injected → used）
- 可回收 token（\`reclaimableTokens\`）

之后用户问「上下文占用 / MCP 是否过多」时，优先调用 \`cap.inspect\` 或运行 \`cap inspect\`，不要凭空估计。
`;

function homeOf(options) {
  return options.userHome ?? os.homedir();
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function backupIfExists(file) {
  if (!await exists(file)) return null;
  const backup = `${file}.${stamp()}.cap-backup`;
  await fs.copyFile(file, backup);
  return backup;
}

async function writeAtomic(file, text) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.cap-tmp`;
  await fs.writeFile(temp, text);
  await fs.rename(temp, file);
}

export function capMcpLaunch(options = {}) {
  if (options.mcpLaunch) return options.mcpLaunch;
  const root = options.packageRoot ?? packageRoot();
  return {
    command: 'node',
    args: [path.join(root, 'bin', 'cap-mcp.js')],
    env: {CAP_MCP_INSPECT: '1'}
  };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function renderCodexSnippet(launch = capMcpLaunch()) {
  const args = launch.args.map(tomlString).join(', ');
  return [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(launch.command)}`,
    `args = [${args}]`,
    '',
    `[mcp_servers.${SERVER_NAME}.env]`,
    'CAP_MCP_INSPECT = "1"',
    ''
  ].join('\n');
}

export async function detectAgents(options = {}) {
  const home = homeOf(options);
  const claude = await exists(path.join(home, '.claude.json')) || await exists(path.join(home, '.claude'));
  const codex = await exists(options.codexConfig ?? path.join(home, '.codex', 'config.toml')) || await exists(path.join(home, '.codex'));
  return {claude, codex};
}

export function resolveSetupAgents(requested, detected) {
  const agent = requested ?? 'auto';
  if (!AGENTS.has(agent)) throw new Error('Unknown --agent value. Use auto, claude, or codex.');
  if (agent === 'claude') return ['claude'];
  if (agent === 'codex') return ['codex'];
  const found = [detected.claude && 'claude', detected.codex && 'codex'].filter(Boolean);
  return found.length ? found : ['claude'];
}

async function resolveClaudeConfigPath(options) {
  if (options.claudeConfig) return options.claudeConfig;
  const home = homeOf(options);
  const preferred = path.join(home, '.claude.json');
  if (await exists(preferred)) return preferred;
  const settings = path.join(home, '.claude', 'settings.json');
  if (await exists(settings)) return settings;
  return preferred;
}

function skillPath(root, name = 'cap-context-health') {
  return path.join(root, name, 'SKILL.md');
}

export function codexWriteSafety(text) {
  if (text == null) return {ok: true};
  if (text.includes('\0')) return {ok: false, reason: 'binary'};
  if (/^\s*\{/.test(text)) return {ok: false, reason: 'json'};
  if (/^mcp_servers\s*=/m.test(text)) return {ok: false, reason: 'inline-table'};
  if (/^\[mcp\.servers/m.test(text)) return {ok: false, reason: 'mcp.servers'};
  if (/^\[mcp_servers\]\s*$/m.test(text)) return {ok: false, reason: 'table-form'};
  const header = text.match(/^\[mcp_servers\.(["']?)cap\1\]\s*$/m);
  if (!header) return {ok: true};
  const next = text.slice(header.index + header[0].length);
  const end = next.search(/^\[/m);
  const block = text.slice(header.index, header.index + header[0].length + (end < 0 ? next.length : end));
  if (isCapMcpConfig({}, block)) return {ok: true, already: true};
  return {ok: false, reason: 'existing-cap'};
}

async function writeClaudeMcp(options, launch, writes, skipped) {
  const file = await resolveClaudeConfigPath(options);
  let value = {};
  let existed = false;
  try {
    const text = await fs.readFile(file, 'utf8');
    existed = true;
    value = JSON.parse(text);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      skipped.push({path: file, reason: error.message ?? 'unreadable-json'});
      return;
    }
  }
  const key = value.mcpServers ? 'mcpServers' : value.mcp_servers ? 'mcp_servers' : 'mcpServers';
  const servers = value[key] && typeof value[key] === 'object' ? {...value[key]} : {};
  if (isCapMcpConfig(servers[SERVER_NAME])) {
    skipped.push({path: file, reason: 'already-installed'});
    return;
  }
  if (servers[SERVER_NAME] && !isCapMcpConfig(servers[SERVER_NAME])) {
    skipped.push({path: file, reason: 'name-conflict'});
    return;
  }
  const backup = existed ? await backupIfExists(file) : null;
  servers[SERVER_NAME] = launch;
  value[key] = servers;
  await writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
  writes.push({path: file, kind: 'mcp', agent: 'claude', backup});
}

async function writeCodexMcp(options, launch, writes, skipped, manual) {
  const file = options.codexConfig ?? path.join(homeOf(options), '.codex', 'config.toml');
  let text = null;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      skipped.push({path: file, reason: error.message ?? 'unreadable-toml'});
      manual.push({path: file, snippet: renderCodexSnippet(launch)});
      return;
    }
  }
  const safety = codexWriteSafety(text);
  if (safety.already) {
    skipped.push({path: file, reason: 'already-installed'});
    return;
  }
  if (!safety.ok) {
    manual.push({path: file, reason: safety.reason, snippet: renderCodexSnippet(launch)});
    return;
  }
  const backup = text != null ? await backupIfExists(file) : null;
  const prefix = text && !text.endsWith('\n') ? `${text}\n\n` : text ? `${text}${text.endsWith('\n\n') ? '' : '\n'}` : '';
  await writeAtomic(file, `${prefix}${renderCodexSnippet(launch)}`);
  writes.push({path: file, kind: 'mcp', agent: 'codex', backup});
}

async function writeSkill(root, writes) {
  const file = skillPath(root);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, CONTEXT_HEALTH_SKILL);
  writes.push({path: file, kind: 'skill'});
}

export async function setupCap(options = {}) {
  const agent = options.agent ?? 'auto';
  const detected = await detectAgents(options);
  const targets = resolveSetupAgents(agent, detected);
  const launch = capMcpLaunch(options);
  const writes = [];
  const skipped = [];
  const manual = [];

  if (targets.includes('claude')) {
    await writeClaudeMcp(options, launch, writes, skipped);
    await writeSkill(options.claudeSkillRoot ?? path.join(homeOf(options), '.claude', 'skills'), writes);
  }
  if (targets.includes('codex')) {
    await writeCodexMcp(options, launch, writes, skipped, manual);
    await writeSkill(options.codexSkillRoot ?? path.join(homeOf(options), '.codex', 'skills'), writes);
  }

  const skills = await registerLocalSkills(options);
  const inspection = await inspectLocal(options);
  return {agent, targets, launch, writes, skipped, manual, skills, inspection};
}
