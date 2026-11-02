// Per-test scratch folders under os.tmpdir()/streams-core-tests/<case>.
// mkdirSync (not mkdtemp): on Windows a mkdtemp folder does not inherit a writable ACL.
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_ROOT = join(tmpdir(), 'streams-core-tests');

export function caseDir(name) {
  const dir = join(TEST_ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
