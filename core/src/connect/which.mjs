// Locate a command-line tool without spawning anything.
// findExecutable('claude') -> absolute path | null
// A name that already contains a path separator is checked as given.
// On Windows only PATHEXT candidates count, in PATHEXT order (claude.exe, codex.cmd, ...): a bare
// `codex` file next to `codex.cmd` is npm's sh shim, which Windows cannot spawn. Elsewhere the bare
// name must exist.
import { existsSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

const WIN_DEFAULT_EXTS = ['.EXE', '.CMD', '.BAT', '.COM'];

export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findExecutable(name, { env = process.env, platform = process.platform } = {}) {
  if (typeof name !== 'string' || name === '') return null;
  const win = platform === 'win32';
  const exts = win ? (env.PATHEXT ? env.PATHEXT.split(';') : WIN_DEFAULT_EXTS).map((e) => e.toLowerCase()).filter((e) => e !== '') : [''];
  const hasExt = win && exts.some((e) => name.toLowerCase().endsWith(e));
  const candidates = (base) => (hasExt || !win ? [base] : exts.map((e) => base + e));

  if (name.includes('/') || name.includes('\\') || isAbsolute(name)) {
    for (const c of candidates(name)) if (isFile(c)) return c;
    return null;
  }
  const pathVar = env.PATH ?? env.Path ?? '';
  for (const dir of pathVar.split(delimiter)) {
    if (dir === '') continue;
    for (const c of candidates(join(dir, name))) if (existsSync(c) && isFile(c)) return c;
  }
  return null;
}

export function isCmdShim(file) {
  const f = String(file).toLowerCase();
  return f.endsWith('.cmd') || f.endsWith('.bat');
}
