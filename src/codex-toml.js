/** Codex config.toml MCP tables. Shared by setup (append), inspect, bind, and optimize. */

import {isCapMcpConfig} from './mcp-tools.js';

export const CODEX_TOML_GUIDANCE = {
  binary: 'Refusing to edit a binary or NUL-containing file. Convert or replace the Codex config by hand.',
  json: 'This path looks like JSON, not Codex dotted-table TOML. Use mcpServers / mcp_servers JSON, or convert to [mcp_servers.name] tables.',
  'inline-table': 'Codex inline-table `mcp_servers = { ... }` is not rewritten. Convert each server to [mcp_servers.name] tables, then re-run optimize.',
  'mcp.servers': '`[mcp.servers.*]` / JSON mcp.servers is inspect-only. Convert to [mcp_servers.name] or mcpServers / mcp_servers, or edit by hand.',
  'table-form': 'Codex `[mcp_servers]` table form is not rewritten. Convert each server to [mcp_servers.name], then re-run optimize.',
  unparseable: 'A Codex MCP table is missing `command = "..."` or uses an inline `env = { ... }`. Nothing was written. Convert to dotted tables with a quoted command.',
  'existing-cap': 'A [mcp_servers.cap] table exists but is not cap-mcp. Setup will not overwrite it; optimize can migrate it when the file uses dotted tables.',
  'no-mcp-key': 'JSON has no mcpServers / mcp_servers object. CAP does not invent a key.',
  'unreadable-json': 'JSON MCP config could not be parsed. Fix the file or restore from backup; nothing was written.'
};

export function codexFormatSafety(text) {
  if (text == null) return {ok: true};
  if (text.includes('\0')) return {ok: false, reason: 'binary'};
  if (/^\s*\{/.test(text)) return {ok: false, reason: 'json'};
  if (/^mcp_servers\s*=/m.test(text)) return {ok: false, reason: 'inline-table'};
  if (/^\[mcp\.servers/m.test(text)) return {ok: false, reason: 'mcp.servers'};
  if (/^\[mcp_servers\]\s*$/m.test(text)) return {ok: false, reason: 'table-form'};
  return {ok: true};
}

export function codexWriteSafety(text) {
  const format = codexFormatSafety(text);
  if (!format.ok) return format;
  if (text == null) return {ok: true};
  const header = text.match(/^\[mcp_servers\.(["']?)cap\1\]\s*$/m);
  if (!header) return {ok: true};
  const next = text.slice(header.index + header[0].length);
  const end = next.search(/^\[/m);
  const block = text.slice(header.index, header.index + header[0].length + (end < 0 ? next.length : end));
  if (isCapMcpConfig({}, block)) return {ok: true, already: true};
  return {ok: false, reason: 'existing-cap'};
}

export function splitTomlTables(text) {
  const matches = [...text.matchAll(/^\[/gm)];
  if (!matches.length) return {preamble: text, tables: []};
  return {
    preamble: text.slice(0, matches[0].index),
    tables: matches.map((match, index) => {
      const start = match.index;
      const end = matches[index + 1]?.index ?? text.length;
      const raw = text.slice(start, end);
      return {header: raw.match(/^\[([^\]]*)\]/)?.[1] ?? '', raw};
    })
  };
}

export function parseCodexMcpHeader(header) {
  if (!header.startsWith('mcp_servers.')) return null;
  const rest = header.slice('mcp_servers.'.length);
  const quoted = rest.match(/^(["'])([^"']+)\1(?:\.(.*))?$/);
  if (quoted) return {name: quoted[2], nested: quoted[3] ?? null, quoted: true};
  const dot = rest.indexOf('.');
  if (dot < 0) return {name: rest, nested: null, quoted: false};
  return {name: rest.slice(0, dot), nested: rest.slice(dot + 1), quoted: false};
}

function parseQuotedString(block, key) {
  return block.match(new RegExp(String.raw`^\s*${key}\s*=\s*"((?:\\.|[^"\\])*)"`, 'm'))?.[1];
}

export function parseTomlServerConfig(tables) {
  const config = {};
  for (const table of tables) {
    if (!table.nested) {
      const command = parseQuotedString(table.raw, 'command');
      if (command) config.command = command;
      const argsBlock = table.raw.match(/^\s*args\s*=\s*\[([\s\S]*?)\]/m)?.[1];
      if (argsBlock != null) {
        config.args = [...argsBlock.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);
      }
      if (/^\s*env\s*=\s*\{/m.test(table.raw)) config.inlineEnv = true;
    } else if (table.nested === 'env') {
      const env = {};
      for (const match of table.raw.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"/gm)) {
        env[match[1]] = match[2];
      }
      if (Object.keys(env).length) config.env = env;
    }
  }
  return config;
}

export function listCodexMcpServers(text) {
  const {tables} = splitTomlTables(text);
  const servers = new Map();
  for (const table of tables) {
    const mcp = parseCodexMcpHeader(table.header);
    if (!mcp) continue;
    const entry = servers.get(mcp.name) ?? {name: mcp.name, tables: []};
    entry.tables.push({...mcp, raw: table.raw});
    servers.set(mcp.name, entry);
  }
  return [...servers.values()].map((entry) => {
    const config = parseTomlServerConfig(entry.tables);
    const block = entry.tables.map((table) => table.raw).join('');
    return {name: entry.name, tables: entry.tables, config, block};
  });
}

export function removeCodexMcpServers(text, names) {
  const drop = new Set(names);
  const {preamble, tables} = splitTomlTables(text);
  return `${preamble}${tables.filter((table) => {
    const mcp = parseCodexMcpHeader(table.header);
    return !mcp || !drop.has(mcp.name);
  }).map((table) => table.raw).join('')}`;
}

export function classifyCodexToml(text) {
  const safety = codexFormatSafety(text);
  if (!safety.ok) {
    return {adapter: 'codex-toml', apply: false, reason: safety.reason, guidance: CODEX_TOML_GUIDANCE[safety.reason]};
  }
  const migrateable = listCodexMcpServers(text).filter((server) => !isCapMcpConfig(server.config, server.block));
  if (migrateable.some((server) => server.config.inlineEnv || !server.config.command)) {
    return {adapter: 'codex-toml', apply: false, reason: 'unparseable', guidance: CODEX_TOML_GUIDANCE.unparseable};
  }
  return {adapter: 'codex-toml', apply: true};
}
