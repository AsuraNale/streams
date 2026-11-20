// The two SOPs (1.1 W1, C2): how a library is built (build.md) and how it is updated (update.md), each a file of its
// own shipped with the app (core/src/sop/, packed with core/src). Changing a rule there changes what the agent is told,
// with no change to code. A missing or empty SOP is an error at start-up (startup.mjs), never an empty prompt.
// loadSop(name, { dir }) -> text            throws StreamsError('sop-missing' | 'sop-empty')
// renderSop(text, vars) -> text             {{NAME}} replaced from vars; a {{NAME}} left without a value throws
//                                            StreamsError('sop-unfilled'), so a placeholder is never sent as it is
// checkSops({ dir }) -> { ok, problems }    every SOP in SOP_NAMES is there and not empty
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamsError } from '../errors.mjs';

export const SOP_DIR = dirname(fileURLToPath(import.meta.url));
export const SOP_NAMES = Object.freeze(['build', 'update']);
const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

export function loadSop(name, { dir = SOP_DIR } = {}) {
  if (!SOP_NAMES.includes(name)) throw new StreamsError('bad-argument', `no SOP called "${name}" (${SOP_NAMES.join(' / ')})`);
  const path = join(dir, `${name}.md`);
  if (!existsSync(path)) throw new StreamsError('sop-missing', `the ${name} SOP is missing (${path})`);
  const text = readFileSync(path, 'utf8');
  if (text.trim() === '') throw new StreamsError('sop-empty', `the ${name} SOP is empty (${path})`);
  return text;
}

export function renderSop(text, vars = {}) {
  const missing = new Set();
  const out = String(text).replace(PLACEHOLDER, (whole, key) => {
    if (!Object.hasOwn(vars, key) || vars[key] === undefined || vars[key] === null) { missing.add(key); return whole; }
    return String(vars[key]);
  });
  if (missing.size) throw new StreamsError('sop-unfilled', `the SOP needs ${[...missing].join(', ')}`, { missing: [...missing] });
  return out;
}

export function placeholdersOf(text) {
  return [...new Set([...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

export function checkSops({ dir = SOP_DIR } = {}) {
  const problems = [];
  for (const name of SOP_NAMES) {
    try {
      loadSop(name, { dir });
    } catch (e) {
      problems.push({ code: e.code ?? 'sop-error', message: e.message });
    }
  }
  return { ok: problems.length === 0, problems };
}
