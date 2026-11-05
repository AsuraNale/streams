// 「谁定的」 for a library's configuration (v2 package B; docs/core-api.md 5.13): every change of a field of streams.json that
// the user made, directly or by confirming a proposal card, is one line of <library>\_pipeline\changes.jsonl (append only):
//   { at, field, by, proposalId?, before, after }
//     field       one of CHANGE_FIELDS: brief · sources · topics · thresholds · schedule · cap
//     by          'you' (a bridge method of v1.0 that changes the field: the sources page, the pipeline page, the
//                 settings page) · 'agent-confirmed' (a proposal card the user confirmed; proposalId = its id)
//     before / after  the field's value before and after (fieldValue), as JSON
//
// fieldValue(libraryDir, field)              -> the field's value now: brief string|null · sources [source…] ·
//                                               topics [{ name, keywords }] · thresholds { relevance, substance } ·
//                                               schedule { enabled, time } · cap number
// snapshot(libraryDir, fields)               -> { <field>: value }
// recordChange(libraryDir, change, { now? })  -> the line written (bad-change: an unknown field or by, no proposalId for an
//                                               agent-confirmed one)
// recordChanges(libraryDir, before, after, { by, proposalId?, now? }) -> [line…]   one line per field whose value differs
// readChanges(libraryDir)                    -> { entries, skipped }  (a line that is not JSON, or not a change, is skipped)
// whoDecided(libraryDir)                     -> { <field>: { by, at, proposalId } | null }   the last line of each field;
//                                               null = no record (the field was never changed since v2, or by the setup)
// Never touches the note folder.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { loadWhole } from '../library/setup.mjs';
import { gateNodes, pipelineFrom } from '../pipeline/config.mjs';
import { scheduleOf } from '../pipeline/schedule.mjs';

export const CHANGES_FILE = 'changes.jsonl';
export const CHANGE_FIELDS = Object.freeze(['brief', 'sources', 'topics', 'thresholds', 'schedule', 'cap']);
export const CHANGE_BY = Object.freeze(['you', 'agent-confirmed']);

export const changesPath = (libraryDir) => join(libraryDir, '_pipeline', CHANGES_FILE);

// gate 1 / gate 2 as v1.0's settings page reads them (desktop getPipelineSettings): the gate with that id, else by position
export function thresholdsOf(pipeline) {
  const gates = gateNodes(pipeline);
  const at = (id, i) => (gates.find((g) => g.id === id) ?? gates[i])?.threshold ?? null;
  return { relevance: at('relevance', 0), substance: at('substance', 1) };
}

function valueOf(whole, field) {
  switch (field) {
    case 'brief': return typeof whole.brief === 'string' && whole.brief.trim() !== '' ? whole.brief : null;
    case 'sources': return (Array.isArray(whole.sources) ? whole.sources : []).filter(isPlainObject).map((s) => structuredClone(s));
    case 'topics': return (Array.isArray(whole.topics) ? whole.topics : []).filter(isPlainObject).map((t) => ({ name: t.name, keywords: Array.isArray(t.keywords) ? [...t.keywords] : [] }));
    case 'thresholds': return thresholdsOf(pipelineFrom(whole));
    case 'schedule': return scheduleOf(whole.schedule);
    case 'cap': return pipelineFrom(whole).cap;
    default: throw new StreamsError('bad-change', `no field ${JSON.stringify(field)} (one of ${CHANGE_FIELDS.join(' / ')})`);
  }
}

export function fieldValue(libraryDir, field) {
  return valueOf(loadWhole(libraryDir), field);
}

export function snapshot(libraryDir, fields) {
  const whole = loadWhole(libraryDir);
  return Object.fromEntries(fields.map((f) => [f, valueOf(whole, f)]));
}

export function recordChange(libraryDir, { field, by, proposalId, before, after }, { now = () => new Date() } = {}) {
  if (!CHANGE_FIELDS.includes(field)) throw new StreamsError('bad-change', `field must be one of ${CHANGE_FIELDS.join(' / ')}`);
  if (!CHANGE_BY.includes(by)) throw new StreamsError('bad-change', `by must be one of ${CHANGE_BY.join(' / ')}`);
  if (by === 'agent-confirmed' && (typeof proposalId !== 'string' || proposalId === '')) throw new StreamsError('bad-change', 'an agent-confirmed change names its proposal');
  const line = { at: now().toISOString(), field, by };
  if (by === 'agent-confirmed') line.proposalId = proposalId;
  line.before = before === undefined ? null : structuredClone(before);
  line.after = after === undefined ? null : structuredClone(after);
  const path = changesPath(libraryDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(line) + '\n', 'utf8');
  return line;
}

export function recordChanges(libraryDir, before, after, { by, proposalId, now } = {}) {
  const out = [];
  for (const field of Object.keys(after)) {
    if (JSON.stringify(before?.[field]) === JSON.stringify(after[field])) continue;
    out.push(recordChange(libraryDir, { field, by, proposalId, before: before?.[field] ?? null, after: after[field] }, { now }));
  }
  return out;
}

export function readChanges(libraryDir) {
  const path = changesPath(libraryDir);
  if (!existsSync(path)) return { entries: [], skipped: 0 };
  const entries = [];
  let skipped = 0;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let e;
    try { e = JSON.parse(raw); } catch { skipped += 1; continue; }
    if (!isPlainObject(e) || !CHANGE_FIELDS.includes(e.field) || !CHANGE_BY.includes(e.by) || typeof e.at !== 'string') { skipped += 1; continue; }
    entries.push(e);
  }
  return { entries, skipped };
}

export function whoDecided(libraryDir) {
  const out = Object.fromEntries(CHANGE_FIELDS.map((f) => [f, null]));
  for (const e of readChanges(libraryDir).entries) {
    out[e.field] = { by: e.by, at: e.at, proposalId: typeof e.proposalId === 'string' ? e.proposalId : null };
  }
  return out;
}
