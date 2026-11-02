// Empty, throw-away working directory for a subprocess call.
//
// Layout: <tmpRoot>/<random>/cwd      the folder the child runs in; nothing is ever written there
//         <tmpRoot>/<random>/...      side files the connector itself needs (codex's last-message file)
// Default tmpRoot = os.tmpdir()/streams-connect. mkdirSync, never mkdtemp (Windows ACL).
// The whole <random> folder is removed when the call ends, success or not.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const DEFAULT_TMP_ROOT = join(tmpdir(), 'streams-connect');

export function createWorkdir(tmpRoot = DEFAULT_TMP_ROOT) {
  const root = join(tmpRoot, randomBytes(6).toString('hex'));
  const cwd = join(root, 'cwd');
  mkdirSync(cwd, { recursive: true });
  if (readdirSync(cwd).length !== 0) throw new Error(`fresh workdir is not empty: ${cwd}`);
  return { root, cwd };
}

export function removeWorkdir(root) {
  rmSync(root, { recursive: true, force: true });
}

export async function withWorkdir(tmpRoot, fn) {
  const dir = createWorkdir(tmpRoot);
  try {
    return await fn(dir);
  } finally {
    removeWorkdir(dir.root);
  }
}
