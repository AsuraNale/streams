// streams.json `setup`: who decided each step of the first-run wizard (plan A1, 4.10 — 你选的 / 你写的 / 接受默认).
//   setup: { <step>: { by, at, detail? } }
//     step    one of SETUP_STEPS: library · connection · pack · sources · trial · schedule
//     by      one of SETUP_BY: chose (the user picked one) · wrote (the user wrote or changed it) · default (the user took
//             what was shown) · skipped (the user went on without it)
//     at      ISO time of the record
//     detail  optional, JSON-sized: what was picked (a connection's kind, a pack's id, { removed, added } counts)
// Walking back and through a step again replaces that step's record; the other steps keep theirs.
//
// recordSetupStep(libraryDir, step, { by, detail? }, { now? }) -> { step, by, at, detail? }
//   Writes the whole streams.json through a temporary file and a rename (the format of sources.mjs: 2-space JSON + final
//   newline); every other key keeps its value and order. Never touches the note folder.
// readSetup(libraryDir) -> { <step>: { by, at, detail? } }   ({} when there is none, or when it is not an object;
//   an entry whose step or `by` is unknown is left out)
// Errors: bad-setup (an unknown step or by, a detail that is not JSON-sized) · config:<code> (streams.json unreadable)
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { CONFIG_FILE, readConfig } from './config.mjs';
import { isPlainObject } from './frontmatter.mjs';

export const SETUP_STEPS = Object.freeze(['library', 'connection', 'pack', 'sources', 'trial', 'schedule']);
export const SETUP_BY = Object.freeze(['chose', 'wrote', 'default', 'skipped']);
const DETAIL_MAX = 2000;

const badSetup = (message) => new StreamsError('bad-setup', message);

// streams.json read whole / written whole (also the library schedule's, schedule.mjs)
export function loadWhole(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  let raw = readFileSync(join(libraryDir, CONFIG_FILE), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

export function saveWhole(libraryDir, whole) {
  const path = join(libraryDir, CONFIG_FILE);
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, JSON.stringify(whole, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

// a detail is a string, a number, a boolean or a plain object / array of those, at most DETAIL_MAX characters written out
function detailProblem(detail) {
  let text;
  try { text = JSON.stringify(detail); } catch { return 'detail must be JSON'; }
  if (typeof text !== 'string') return 'detail must be JSON';
  if (text.length > DETAIL_MAX) return `detail must be at most ${DETAIL_MAX} characters as JSON`;
  if (detail !== null && typeof detail === 'object' && !Array.isArray(detail) && !isPlainObject(detail)) return 'detail must be a plain object';
  return null;
}

export function recordSetupStep(libraryDir, step, entry, { now = () => new Date() } = {}) {
  if (!SETUP_STEPS.includes(step)) throw badSetup(`step must be one of ${SETUP_STEPS.join(' / ')}, got ${JSON.stringify(step)}`);
  if (!isPlainObject(entry)) throw badSetup('the entry must be an object { by, detail? }');
  const extra = Object.keys(entry).filter((k) => k !== 'by' && k !== 'detail');
  if (extra.length) throw badSetup(`the entry may only have by / detail, got ${extra.join(', ')}`);
  if (!SETUP_BY.includes(entry.by)) throw badSetup(`by must be one of ${SETUP_BY.join(' / ')}, got ${JSON.stringify(entry.by)}`);
  if (entry.detail !== undefined) {
    const p = detailProblem(entry.detail);
    if (p) throw badSetup(p);
  }
  const whole = loadWhole(libraryDir);
  const record = { by: entry.by, at: now().toISOString() };
  if (entry.detail !== undefined) record.detail = structuredClone(entry.detail);
  const before = isPlainObject(whole.setup) ? whole.setup : {};
  whole.setup = { ...before, [step]: record };
  saveWhole(libraryDir, whole);
  return { step, ...structuredClone(record) };
}

export function readSetup(libraryDir) {
  const whole = loadWhole(libraryDir);
  if (!isPlainObject(whole.setup)) return {};
  const out = {};
  for (const step of SETUP_STEPS) {
    const e = whole.setup[step];
    if (!isPlainObject(e) || !SETUP_BY.includes(e.by) || typeof e.at !== 'string') continue;
    out[step] = { by: e.by, at: e.at };
    if (e.detail !== undefined) out[step].detail = structuredClone(e.detail);
  }
  return out;
}
