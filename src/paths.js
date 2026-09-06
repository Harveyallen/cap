import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function capHome(env = process.env) {
  return env.CAP_HOME ? path.resolve(env.CAP_HOME) : path.join(os.homedir(), '.cap');
}

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
