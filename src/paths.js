/** Resolve CAP_HOME and package root paths. */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function capHome(env = process.env) {
  return env.CAP_HOME ? path.resolve(env.CAP_HOME) : path.join(os.homedir(), '.cap');
}

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function packageVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
