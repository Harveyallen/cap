import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { handleMcpMessage } from '../src/mcp-server.js';
import { packageVersion } from '../src/paths.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CLI help, MCP serverInfo, and changelog agree with package.json', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@harvey2008/cap');
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.version, packageVersion());
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);

  const escaped = pkg.version.replace(/\./g, '\\.');
  const changelog = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, new RegExp(`^## ${escaped}(?: — .+)?$`, 'm'));

  const {stdout} = await execFileAsync(process.execPath, [path.join(root, 'bin', 'cap.js'), 'help'], {cwd: root});
  assert.match(stdout, new RegExp(`^CAP ${escaped} —`));

  const init = await handleMcpMessage({jsonrpc: '2.0', id: 1, method: 'initialize'});
  assert.equal(init.result.serverInfo.name, 'cap');
  assert.equal(init.result.serverInfo.version, pkg.version);
});

