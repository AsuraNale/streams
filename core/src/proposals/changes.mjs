// 「谁定的」 for a library's configuration (v2 package B; docs/core-api.md 5.13): every change of a field of streams.json that
// the user made, directly or by confirming a proposal card, is one line of <library>\_pipeline\changes.jsonl (append only):
//   { at, field, by, proposalId?, before, after }
//     field       one of CHANGE_FIELDS: brief · sources · topics · thresholds · schedule · cap · name · prompts
//                 (redesign R4b: name = streams.json's `name`, the library's name changed on 来源与要求; prompts = each model
//                 step's requirement, material and the user's own check items, changed on 高级设置's 评分环节)
//     by          'you' (a bridge method of v1.0 that changes the field: the sources page, the pipeline page, the
//                 settings page) · 'agent-confirmed' (a proposal card the user confirmed; proposalId = its id)
//     before / after  the field's value before and after (fieldValue), as JSON
//
// fieldValue(libraryDir, field)              -> the field's value now: brief string|null · sources [source…] ·
//                                               topics [{ name, keywords }] · thresholds { relevance, substance } ·
//                                               schedule { enabled, time } · cap number · name string|null ·
//                                               prompts [{ id, requirement, material, checks: [desc] }] (the model steps)
// snapshot(libraryDir, fields)               -> { <field>: value }
// recordChange(libraryDir, change, { now? })  -> the line written (bad-change: an unknown field or by, no proposalId for an
//                                               agent-confirmed one)
// recordChanges(libraryDir, before, after, { by, proposalId?, now? }) -> [line…]   one line per field whose value differs
// readChanges(libraryDir)                    -> { entries, skipped }  (a line that is not JSON, or not a change, is skipped)
// whoDecided(libraryDir)                     -> { <field>: { by, at, proposalId } | null }   the last line of each field;
//                                               null = no record (the field was never changed since v2, or by the setup)
// changeLog(libraryDir)                      -> { rows, skipped }   redesign R4b (高级设置「变更记录」, F54 / F55): every line of
//                                               changes.jsonl as { at, kind: 'change', field, by, proposalId, before, after }
//                                               and every step of streams.json `setup` (首次设置's record, readSetup) as
//                                               { at, kind: 'setup', step, by: 'setup', setupBy, detail }, newest first (the
//                                               same time: the file's order, later first). Only what is recorded: a library
//                                               made before v2 package B has fewer rows, never made-up ones.
// Never touches the note folder.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { loadWhole, readSetup } from '../library/setup.mjs';
import { gateNodes, pipelineFrom } from '../pipeline/config.mjs';
import { scheduleOf } from '../pipeline/schedule.mjs';

export const CHANGES_FILE = 'changes.jsonl';
export const CHANGE_FIELDS = Object.freeze(['brief', 'sources', 'topics', 'thresholds', 'schedule', 'cap', 'name', 'prompts']);
export const CHANGE_BY = Object.freeze(['you', 'agent-confirmed']);

export const changesPath = (libraryDir) => join(libraryDir, '_pipeline', CHANGES_FILE);

// gate 1 / gate 2 as v1.0's settings page reads them (desktop getPipelineSettings): the gate with that id, else by position
export function thresholdsOf(pipeline) {
  const gates = gateNodes(pipeline);
  const at = (id, i) => (gates.find((g) => g.id === id) ?? gates[i])?.threshold ?? null;
  return { relevance: at('relevance', 0), substance: at('substance', 1) };
}

// redesign R4b: what of each model step the user edits on 评分环节 besides its threshold — the requirement (提示词), the
// material and the user's own check items (the baseline items are never stored, never the user's)
function promptsOf(pipeline) {
  return pipeline.nodes.filter((n) => n.kind === 'gate' || n.kind === 'summary').map((n) => ({
    id: n.id,
    requirement: typeof n.requirement === 'string' ? n.requirement : null,
    material: n.material ?? null,
    checks: (Array.isArray(n.checklist) ? n.checklist : []).filter((c) => isPlainObject(c) && c.origin !== 'streams').map((c) => String(c.desc ?? c.id ?? '')),
  }));
}

function valueOf(whole, field) {
  switch (field) {
    case 'brief': return typeof whole.brief === 'string' && whole.brief.trim() !== '' ? whole.brief : null;
    case 'sources': return (Array.isArray(whole.sources) ? whole.sources : []).filter(isPlainObject).map((s) => structuredClone(s));
    case 'topics': return (Array.isArray(whole.topics) ? whole.topics : []).filter(isPlainObject).map((t) => ({ name: t.name, keywords: Array.isArray(t.keywords) ? [...t.keywords] : [] }));
    case 'thresholds': return thresholdsOf(pipelineFrom(whole));
    case 'schedule': return scheduleOf(whole.schedule);
    case 'cap': return pipelineFrom(whole).cap;
    case 'name': return typeof whole.name === 'string' && whole.name.trim() !== '' ? whole.name : null;
    case 'prompts': return promptsOf(pipelineFrom(whole));
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

export function changeLog(libraryDir) {
  const { entries, skipped } = readChanges(libraryDir);
  const rows = entries.map((e, i) => ({
    at: e.at, kind: 'change', field: e.field, by: e.by, proposalId: typeof e.proposalId === 'string' ? e.proposalId : null,
    before: e.before ?? null, after: e.after ?? null, order: i,
  }));
  let setup = {};
  try { setup = readSetup(libraryDir); } catch { setup = {}; }
  for (const [step, s] of Object.entries(setup)) {
    rows.push({ at: typeof s.at === 'string' ? s.at : '', kind: 'setup', step, by: 'setup', setupBy: s.by, detail: s.detail ?? null, order: -1 });
  }
  rows.sort((a, b) => (a.at === b.at ? b.order - a.order : a.at < b.at ? 1 : -1));
  return { rows: rows.map(({ order, ...r }) => r), skipped };
}
