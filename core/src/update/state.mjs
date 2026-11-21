// The library's state (contract 「存法」): _state/state.json, written by the update only.
//   sources   { [card source url]: { seen: [links], firstAt, lastAt, ok, reason, method } }   the links seen on each source
//   unfinished [card source url]   the sources a budget left unread last time: the next update reads them first (B11)
//   carry     [{ url, id }]         originals fetched for an update whose agent never handed in a readable answer (B13) or
//                                   could not run (the login ran out half way, B12): given to the next update's agent again
//   lastAgentAt                     when the update agent last ran: with the card's rhythm, when it reads the sources itself
//   used      { searches, reads }   what the last agent run used
// The file is written only when something in it changed: an update that found nothing leaves it byte for byte (B9).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR } from '../build/store.mjs';

export const STATE_FILE = 'state.json';
export const SEEN_MAX = 2000;

export const statePath = (libraryDir) => join(libraryDir, STATE_DIR, STATE_FILE);

export function readState(libraryDir) {
  const p = statePath(libraryDir);
  let s = {};
  if (existsSync(p)) { try { s = JSON.parse(readFileSync(p, 'utf8')); } catch { s = {}; } }
  return {
    ...s,
    sources: s.sources && typeof s.sources === 'object' ? s.sources : {},
    unfinished: Array.isArray(s.unfinished) ? s.unfinished : [],
    carry: Array.isArray(s.carry) ? s.carry : [],
    lastAgentAt: typeof s.lastAgentAt === 'string' ? s.lastAgentAt : null,
    used: s.used && typeof s.used === 'object' ? s.used : {},
  };
}

export function writeState(libraryDir, state) {
  const p = statePath(libraryDir);
  mkdirSync(join(libraryDir, STATE_DIR), { recursive: true });
  for (const v of Object.values(state.sources ?? {})) if (Array.isArray(v.seen) && v.seen.length > SEEN_MAX) v.seen = v.seen.slice(-SEEN_MAX);
  const text = JSON.stringify(state, null, 2) + '\n';
  if (existsSync(p) && readFileSync(p, 'utf8') === text) return false;
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, p);
  return true;
}

// How long after its last run the agent reads the card's sources itself, even with no new link (the 3-hour snapshot of
// pretest 4: new links are few, and many sources are single pages, not lists). From the card's 节奏 line.
export function sweepDaysOf(card) {
  const r = String(card?.definition?.rhythm ?? '').toLowerCase();
  if (/每天|每日|每个工作日|天天|daily|every day|each day/.test(r)) return 3;
  if (/每月|一个月|monthly/.test(r)) return 30;
  if (/每周|一周|每星期|weekly|every week|once a week/.test(r)) return 7;
  return 7;
}
