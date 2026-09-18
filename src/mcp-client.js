/** Minimal stdio JSON-RPC MCP client. Line-delimited, matching cap-mcp. Zero deps. */
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {packageVersion} from './paths.js';

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function overlayEnv(extra) {
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return env;
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) continue;
    env[key] = String(value);
  }
  return env;
}

function rpcError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

/**
 * Spawn a stdio MCP server, initialize, run one RPC sequence, then stop.
 * Does not log launch env (tokens often live there).
 */
async function runMcpSession(launch, options, work) {
  if (!launch?.command) throw rpcError('MCP launch command is required');
  const timeout = options.timeout ?? 20_000;
  const label = options.label ?? 'MCP';
  const args = Array.isArray(launch.args) ? launch.args.map(String) : [];
  const child = spawn(String(launch.command), args, {
    cwd: launch.cwd,
    env: overlayEnv(launch.env),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stderr = '';
  const maxErr = 4_000;
  child.stderr.on('data', (chunk) => {
    if (stderr.length < maxErr) stderr += chunk;
  });

  const pending = new Map();
  let nextId = 1;
  let closing = false;

  const stop = () => {
    if (closing) return;
    closing = true;
    if (!child.killed) child.kill('SIGTERM');
  };

  const waitClose = new Promise((resolve) => {
    child.once('close', resolve);
    child.once('error', resolve);
  });

  const session = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(rpcError(`MCP timed out after ${timeout}ms waiting for ${label}`, {code: 'ETIMEDOUT'}));
      stop();
    }, timeout);

    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
      stop();
    };

    child.stdin?.on('error', () => {});
    child.on('error', (error) => {
      fail(rpcError(`Cannot launch MCP: ${error.message}`, {code: error.code}));
    });
    child.on('close', (code) => {
      if (pending.size) {
        const detail = stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : '';
        fail(rpcError(`MCP exited (${code ?? 'null'}) before completing ${label}${detail}`, {code: 'EEXIT'}));
      }
    });

    const input = readline.createInterface({input: child.stdout, crlfDelay: Infinity});
    input.on('line', (line) => {
      const message = parseLine(line);
      if (!message || message.id == null) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      waiter(message);
    });

    const send = (payload) => {
      if (child.stdin.destroyed) throw rpcError('MCP stdin is closed');
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    };

    const request = (method, params) => new Promise((res, rej) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, (message) => {
        if (message.error) {
          rej(rpcError(message.error.message ?? `MCP ${method} failed`, {code: message.error.code, data: message.error.data}));
          return;
        }
        res(message.result);
      });
      try {
        send({jsonrpc: '2.0', id, method, params});
      } catch (error) {
        pending.delete(id);
        rej(error);
      }
    });

    (async () => {
      await request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {name: 'cap', version: packageVersion()}
      });
      send({jsonrpc: '2.0', method: 'notifications/initialized', params: {}});
      const result = await work({request});
      clearTimeout(timer);
      pending.clear();
      stop();
      resolve(result);
    })().catch(fail);
  });

  try {
    return await session;
  } finally {
    stop();
    const killer = setTimeout(() => child.kill('SIGKILL'), 1_000);
    await waitClose;
    clearTimeout(killer);
  }
}

/**
 * Spawn a stdio MCP server, initialize, call one tool, then stop the process.
 * Does not log launch env (tokens often live there).
 */
export async function callMcpTool(launch, toolName, toolArgs = {}, options = {}) {
  if (!toolName) throw rpcError('MCP tool name is required');
  const result = await runMcpSession(launch, {timeout: options.timeout, label: toolName}, async ({request}) => {
    return request('tools/call', {name: toolName, arguments: toolArgs ?? {}});
  });
  return {
    tool: toolName,
    result: result?.structuredContent ?? result,
    content: result?.content,
    isError: Boolean(result?.isError)
  };
}

/** Spawn, initialize, `tools/list`, then exit. Used for on-demand cap.use input_schema. */
export async function listMcpTools(launch, options = {}) {
  const result = await runMcpSession(launch, {timeout: options.timeout ?? 8_000, label: 'tools/list'}, async ({request}) => {
    return request('tools/list', {});
  });
  return Array.isArray(result?.tools) ? result.tools : [];
}
