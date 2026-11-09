// Per-test scratch folders under os.tmpdir()/streams-core-tests-<pid>-<random>/<case>.
// mkdirSync (not mkdtemp): on Windows a mkdtemp folder does not inherit a writable ACL.
// The root is this process's own (process id + a random string, v2 package J1): two test runs at the same time — two
// `npm test` of the core, or the core beside the acceptance tests — never remove or reuse each other's folders, which the
// one fixed root `streams-core-tests` did (caseDir empties the folder it hands out). The root is removed when the process
// ends (best effort: a file still held open by Windows leaves it behind, under the system's temporary folder).
import { mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_ROOT = join(tmpdir(), `streams-core-tests-${process.pid}-${randomBytes(4).toString('hex')}`);
mkdirSync(TEST_ROOT, { recursive: true });
process.on('exit', () => {
  try { rmSync(TEST_ROOT, { recursive: true, force: true }); } catch { /* left for the system's temporary folder */ }
});

export function caseDir(name) {
  const dir = join(TEST_ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
