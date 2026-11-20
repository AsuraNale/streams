// The record of actions done (1.1 W1, B4): one JSON line per action executed — who, when, which action, on which object,
// before and after. A library's own actions go to <library>/_actions.jsonl (ACTION_LOG); an action done before there is
// a library (building one) goes to a file the caller names in the app's data. Rejected and pending actions are not here:
// they were not done.
// appendActionLog(file, { ts, actor, action, object: { type, id }, before, after, confirmedBy?, pendingId? }) -> the line
// readActionLog(file) -> [line]   (a missing file is no actions; a broken line is skipped)
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const ACTION_LOG = '_actions.jsonl';
const REQUIRED = ['ts', 'actor', 'action', 'object'];

export function appendActionLog(file, entry) {
  for (const k of REQUIRED) if (entry?.[k] === undefined || entry[k] === null || entry[k] === '') throw new StreamsError('bad-action-log', `an action record needs "${k}"`);
  if (typeof entry.object?.type !== 'string' || entry.object.type === '') throw new StreamsError('bad-action-log', 'an action record needs object.type');
  const line = {
    ts: entry.ts, actor: entry.actor, action: entry.action, object: { type: entry.object.type, id: entry.object.id ?? null },
    before: entry.before ?? null, after: entry.after ?? null,
    ...(entry.confirmedBy ? { confirmedBy: entry.confirmedBy } : {}),
    ...(entry.pendingId ? { pendingId: entry.pendingId } : {}),
  };
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(line) + '\n', 'utf8');
  return line;
}

export function readActionLog(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* a broken line is skipped */ }
  }
  return out;
}
