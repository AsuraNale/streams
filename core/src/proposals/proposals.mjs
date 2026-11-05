// Proposal cards (v2 package B; docs/design/v2/architecture.md 2.2 and 2.5; docs/core-api.md 5.13): a change to a library,
// or a new library, that someone other than the user (the main agent, later; a development hook today) puts forward and
// that only the user's 「确认」 makes happen. A card:
//   { id, kind, libraryId, params, why, before, after, trial?, status, createdAt, decidedAt?, by, baseHash,
//     reason? (stale) · reviseText? (revise) · result? (confirmed; a failed create_library past its registration) ·
//     failure? (failed) }
//
// draftProposal({ kind, params, why, by }, opts) -> card (pending)                                       async
//   params checked (params.mjs), then the change run for real on a copy of the library's streams.json in a scratch folder
//   (the same functions confirm runs; a refusal of theirs is bad-proposal): `before` and `after` come from the library as
//   it is and from that copy — never from the issuer (anything of `input` beside kind / params / why / by is ignored, and so
//   are before / after / trial / baseHash inside params). A change that would change nothing is bad-proposal 'no-change'.
//   add_source and create_library try each source once (v1.0's trial: fetch fetchSource, nothing written) and put the
//   result on the card; a source of a new library whose trial is blocked or gap starts unticked (include: false).
//   `baseHash` = a hash of the part of the configuration the card is about (create_library: its folder and whether it is
//   free). opts: libraryDir (every kind but create_library; the caller resolves libraryId) · libraryRoot (create_library's
//   default place: libraryRoot\<libraryFolderName(name)>) · fallbackSchedule (what a new library's schedule is when the
//   card gives none) · language · ctx (fetch context overrides) · now · scratchRoot (default os.tmpdir()) · id
// confirmProposal(card, opts) -> the card after it                                                           sync
//   THE guard: a card that is not pending is refused (not-pending) and nothing is done. Then the baseHash is worked out
//   again: different (or the library is gone, or the new library's folder is no longer free) → status 'stale', nothing
//   changed. Then the change, by the functions of v1.0 and package A (see APPLY below); a step that fails → status 'failed'
//   and what was done undone (streams.json put back byte for byte; a new library's folder emptied of what was made and its
//   registration dropped) or, for a new library past its registration, said: failure { step, done, rolledBack: false }.
//   Each field that changed is one line of the library's changes.jsonl, by 'agent-confirmed' (changes.mjs).
//   opts: libraryDir · hooks { register(folder, { name }) -> { libraryId } (registered and made the current library),
//   unregister(libraryId), enqueue(libraryId) -> { queued, reason? } } · language · now · onStep(step) (called before each
//   step; what it throws fails that step)
// declineProposal(card, { now }) / reviseProposal(card, text, { now }) -> the card after it                 sync
//   Only a pending card (not-pending); nothing but the card changes. revise keeps the user's words (1–2000 characters).
//
// APPLY (what confirm runs; draftProposal runs the same on its copy):
//   create_library   createLibrary → saveBrief → addTopic × n → addSource × the ticked ones → savePipelineConfig with the
//                    gates' thresholds (only when given) → saveLibrarySchedule → hooks.register → hooks.enqueue
//   add_source       addSource (checkSource inside)      remove_source   removeSource      pause_source   setSourcePaused
//   edit_topics      per op: addTopic / removeTopic / updateTopic (keywords added to / taken from the topic's list)
//   edit_brief       saveBrief (brief.mjs)               edit_thresholds savePipelineConfig with the gates' thresholds (v1.0's
//                    savePipeline path)                  edit_schedule   saveLibrarySchedule (package A's)
//   edit_cap         savePipelineConfig with cap (v1.0's setRoundCap path)                  run_round   hooks.enqueue
// Every write of streams.json is the whole file through a temporary file and a rename. Never touches the note folder.
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { CONFIG_FILE, readConfig } from '../library/config.mjs';
import { createLibrary } from '../library/create.mjs';
import { addSource, addTopic, checkSource, removeSource, removeTopic, setSourcePaused, updateTopic } from '../library/sources.mjs';
import { saveBrief } from '../library/brief.mjs';
import { readLibrarySchedule, saveLibrarySchedule } from '../library/schedule.mjs';
import { gateNodes, pipelineConfig, savePipelineConfig } from '../pipeline/config.mjs';
import { scheduleOf } from '../pipeline/schedule.mjs';
import { listRounds } from '../pipeline/rounds-log.mjs';
import { fetchSource } from '../fetch/source.mjs';
import { makeContext } from '../fetch/context.mjs';
import { badProposal, checkParams, PROPOSAL_KINDS } from './params.mjs';
import { fieldValue, recordChange, recordChanges, snapshot } from './changes.mjs';
import { unmake } from './unmake.mjs';

export const PROPOSAL_BY = Object.freeze(['agent', 'dev']);
export const WHY_MAX = 2000;
export const REVISE_MAX = 2000;
// a source of a new library whose trial came back like this starts unticked (design UC1: the refused one is not ticked)
export const UNTICKED_TRIAL_STATES = Object.freeze(['blocked', 'gap']);
export const CREATE_STEPS = Object.freeze(['create', 'brief', 'topics', 'sources', 'thresholds', 'schedule', 'register', 'queue']);
// the part of streams.json each kind is about: its before / after, its baseHash, the changes.jsonl fields it may write
export const KIND_FIELDS = Object.freeze({
  add_source: ['sources', 'topics'],
  remove_source: ['sources'],
  pause_source: ['sources'],
  edit_topics: ['topics', 'sources'],
  edit_brief: ['brief'],
  edit_thresholds: ['thresholds'],
  edit_schedule: ['schedule'],
  edit_cap: ['cap'],
  run_round: [],
});
// the changes.jsonl fields a new library's card decides
const CREATE_FIELDS = ['brief', 'topics', 'sources', 'thresholds', 'schedule'];
// what a refusal of the real functions (on the copy) means: the card does not fit the library → bad-proposal
const REFUSED = ['bad-source', 'duplicate-source', 'bad-topic', 'duplicate-topic', 'not-found', 'bad-argument', 'bad-config', 'locked-node', 'exists'];
// the keys of a source the trial reads (desktop trySource's)
const TRY_KEYS = ['name', 'kind', 'url', 'query', 'topic', 'min_points', 'max_results'];
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const isWhy = (v) => typeof v === 'string' && v.trim() !== '' && [...v.trim()].length <= WHY_MAX;
export const hashOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const pathKey = (p) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));

/** A new card id: p-<UTC time to the second>-<6 hex>. */
export function newProposalId(now = () => new Date()) {
  return `p-${now().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
}

/** A library name as a folder name: the characters Windows does not take in one become '-'; never empty or reserved. */
export function libraryFolderName(name) {
  let s = String(name ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/[. ]+$/g, '');
  if (s === '') s = 'library';
  if (RESERVED_NAME.test(s.split('.')[0])) s = `${s}-`;
  return s;
}

/** 'absent' · 'empty' · 'not-empty' (a file where the folder should be is not empty either). */
export function folderState(path) {
  if (!existsSync(path)) return 'absent';
  try {
    if (!statSync(path).isDirectory()) return 'not-empty';
    return readdirSync(path).length === 0 ? 'empty' : 'not-empty';
  } catch {
    return 'not-empty';
  }
}

const sourcesSummary = (list) => ({ count: list.length, names: list.map((s) => s.name), paused: list.filter((s) => s.paused === true).map((s) => s.name) });

// what a card shows as before / after for its kind, from a snapshot of its fields
function viewOf(kind, snap) {
  switch (kind) {
    case 'add_source': case 'remove_source': case 'pause_source': return { sources: sourcesSummary(snap.sources) };
    case 'edit_topics': return { topics: snap.topics, sourceTopics: Object.fromEntries(snap.sources.map((s) => [s.name, s.topic ?? null])) };
    case 'edit_brief': return { brief: snap.brief };
    case 'edit_thresholds': return { thresholds: snap.thresholds };
    case 'edit_schedule': return { schedule: snap.schedule };
    case 'edit_cap': return { cap: snap.cap };
    default: return {};
  }
}

/** One try of a source (v1.0's trial: fetchSource, nothing written) as the card shows it. */
export async function trialOf(source, ctx) {
  const s = Object.fromEntries(TRY_KEYS.filter((k) => source?.[k] !== undefined).map((k) => [k, source[k]]));
  const r = await fetchSource(s, makeContext(ctx));
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    status: r.status, hint: r.hint ?? null, http: r.http ?? null, message: r.message ?? '', count: items.length,
    sample: items.slice(0, 3).map((i) => ({ title: i.title ?? '', date: i.date ?? null })),
    include: !UNTICKED_TRIAL_STATES.includes(r.status),
  };
}

// the gates' thresholds set on a pipeline configuration as pipelineConfig gives it (the way the pipeline page saves them)
function withThresholds(cfg, { relevance, substance }) {
  const gates = gateNodes(cfg);
  const target = (id, i) => gates.find((g) => g.id === id) ?? gates[i];
  const set = new Map();
  for (const [key, value, i] of [['relevance', relevance, 0], ['substance', substance, 1]]) {
    if (value === undefined) continue;
    const g = target(key, i);
    if (!g) throw new StreamsError('bad-config', `the pipeline has no gate for ${key}`);
    set.set(g.id, value);
  }
  return { ...cfg, nodes: cfg.nodes.map((n) => (set.has(n.id) ? { ...n, threshold: set.get(n.id) } : n)) };
}

function topicOf(dir, name) {
  const t = fieldValue(dir, 'topics').find((x) => x.name === name);
  if (!t) throw new StreamsError('not-found', `no topic named ${JSON.stringify(name)}`);
  return t;
}

function applyTopicOp(dir, op) {
  switch (op.op) {
    case 'add_topic': return addTopic(dir, { name: op.name, keywords: op.keywords });
    case 'remove_topic': return removeTopic(dir, op.name);
    case 'add_keywords': {
      const t = topicOf(dir, op.topic);
      return updateTopic(dir, op.topic, { keywords: [...t.keywords, ...op.keywords] });
    }
    case 'remove_keywords': {
      const t = topicOf(dir, op.topic);
      const missing = op.keywords.filter((k) => !t.keywords.includes(k));
      if (missing.length) throw new StreamsError('not-found', `topic ${JSON.stringify(op.topic)} has no keyword ${missing.map((k) => JSON.stringify(k)).join(', ')}`);
      return updateTopic(dir, op.topic, { keywords: t.keywords.filter((k) => !op.keywords.includes(k)) });
    }
    default: throw new StreamsError('bad-proposal', `no op ${op.op}`);
  }
}

// the change of a card of a library kind, on the library folder `dir` (the real one, or the copy); `step(name, fn)` runs
// one step. Returns what the step that matters answered (add_source: the source as stored).
function applyLibraryKind(kind, p, dir, step) {
  switch (kind) {
    case 'add_source': return step('add_source', () => addSource(dir, p.source)).source;
    case 'remove_source': return step('remove_source', () => removeSource(dir, p.name));
    case 'pause_source': return step('pause_source', () => setSourcePaused(dir, p.name, p.paused));
    case 'edit_topics': p.ops.forEach((op, i) => step(`op:${i + 1}`, () => applyTopicOp(dir, op))); return null;
    case 'edit_brief': return step('brief', () => saveBrief(dir, p.brief));
    case 'edit_thresholds': return step('thresholds', () => savePipelineConfig(dir, withThresholds(pipelineConfig(dir), p)));
    case 'edit_schedule': {
      const { enabled, time } = p;
      return step('schedule', () => saveLibrarySchedule(dir, { ...readLibrarySchedule(dir).schedule, ...(enabled !== undefined ? { enabled } : {}), ...(time !== undefined ? { time } : {}) }));
    }
    case 'edit_cap': return step('cap', () => savePipelineConfig(dir, { ...pipelineConfig(dir), cap: p.cap }));
    default: throw new StreamsError('bad-proposal', `${kind} is not a change of a library's streams.json`);
  }
}

// a new library's steps up to its registration, on `dir` (the real folder, or one in the scratch folder)
function buildLibrary(p, dir, { language, sources, step }) {
  step('create', () => createLibrary(dir, { name: p.name, language }));
  step('brief', () => saveBrief(dir, p.brief));
  step('topics', () => { for (const t of p.topics) addTopic(dir, t); });
  step('sources', () => { for (const s of sources) addSource(dir, s); });
  step('thresholds', () => { if (p.thresholds) savePipelineConfig(dir, withThresholds(pipelineConfig(dir), p.thresholds)); });
  step('schedule', () => saveLibrarySchedule(dir, p.schedule));
}

const plainStep = (_name, fn) => fn();

// a refusal of the real functions on the copy: the card does not fit → bad-proposal; anything else goes on up
function asRefusal(err) {
  if (err instanceof StreamsError && err.code === 'bad-proposal') return err;
  if (err instanceof StreamsError && REFUSED.includes(err.code)) return badProposal(err.message, { reason: err.code });
  return err;
}

function withScratch(scratchRoot, fn) {
  // mkdirSync, not mkdtemp: on Windows a mkdtemp folder does not inherit a writable ACL
  const dir = join(scratchRoot, `streams-proposal-${process.pid}-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function usableLibrary(dir) {
  try { return typeof dir === 'string' && readConfig(dir).ok; } catch { return false; }
}

// the card in the order the record keeps its keys
function card(c) {
  const out = { id: c.id, kind: c.kind, libraryId: c.libraryId, params: c.params, why: c.why, before: c.before, after: c.after };
  if (c.trial !== undefined) out.trial = c.trial;
  out.status = c.status;
  out.createdAt = c.createdAt;
  if (c.decidedAt !== undefined) out.decidedAt = c.decidedAt;
  out.by = c.by;
  out.baseHash = c.baseHash;
  for (const k of ['reason', 'reviseText', 'result', 'failure']) if (c[k] !== undefined) out[k] = c[k];
  return out;
}

async function draftCreate(params, { libraryRoot, fallbackSchedule, language, ctx, now, scratchRoot }) {
  let folder = params.folder;
  if (folder === null) {
    if (typeof libraryRoot !== 'string' || !isAbsolute(libraryRoot)) throw badProposal('create_library: no folder given and no default place (libraryRoot) known');
    folder = join(resolve(libraryRoot), libraryFolderName(params.name));
  }
  const state = folderState(folder);
  if (state === 'not-empty') throw badProposal(`create_library: ${folder} is there and not empty`, { reason: 'folder_not_empty', folder });
  const p = { ...params, folder, schedule: params.schedule ?? scheduleOf(fallbackSchedule) };
  // every source as checkSource takes it (against the card's topics and the sources before it) before anything is fetched
  const topicNames = p.topics.map((t) => t.name);
  const stored = [];
  for (const s of p.sources) {
    try { stored.push(checkSource(s, { others: stored, topics: topicNames })); } catch (err) { throw asRefusal(err); }
  }
  p.sources = stored;
  // one context for all of them, so arXiv's spacing holds (as v1.0's starter pack tries its sources)
  const c = makeContext({ ...ctx, now });
  const trial = [];
  for (const s of stored) trial.push({ name: s.name, ...(await trialOf(s, c)) });
  const ticked = stored.filter((_, i) => trial[i].include);
  const after = withScratch(scratchRoot, (scratch) => {
    const dir = join(scratch, 'library');
    try { buildLibrary(p, dir, { language, sources: ticked, step: plainStep }); } catch (err) { throw asRefusal(err); }
    return snapshot(dir, [...CREATE_FIELDS, 'cap']);
  });
  return {
    params: p,
    before: { folder, state },
    after: { name: p.name, folder, brief: after.brief, topics: after.topics, sources: sourcesSummary(after.sources), thresholds: after.thresholds, schedule: after.schedule, cap: after.cap },
    trial,
    baseHash: hashOf({ folder: pathKey(folder), free: true }),
  };
}

export async function draftProposal(input, { libraryDir = null, libraryRoot = null, fallbackSchedule = null, language = 'zh-CN', ctx = {}, now = () => new Date(), scratchRoot = tmpdir(), id } = {}) {
  if (input === null || typeof input !== 'object') throw badProposal('a proposal is { kind, params, why, by }');
  // only these four are the issuer's; before / after / trial / baseHash / status… given beside them are not read
  const { kind, why, by = 'agent' } = input;
  if (!PROPOSAL_KINDS.includes(kind)) throw badProposal(`kind must be one of ${PROPOSAL_KINDS.join(' / ')}, got ${JSON.stringify(kind)}`);
  if (!PROPOSAL_BY.includes(by)) throw badProposal(`by must be one of ${PROPOSAL_BY.join(' / ')}`);
  if (!isWhy(why)) throw badProposal(`why is 1–${WHY_MAX} characters`);
  const params = checkParams(kind, input.params);
  const base = { id: id ?? newProposalId(now), kind, libraryId: kind === 'create_library' ? null : params.libraryId, why: why.trim(), status: 'pending', createdAt: now().toISOString(), by };

  if (kind === 'create_library') {
    const d = await draftCreate(params, { libraryRoot, fallbackSchedule, language, ctx, now, scratchRoot });
    return card({ ...base, ...d });
  }

  if (!usableLibrary(libraryDir)) throw badProposal(`${kind}: library ${params.libraryId} has no readable streams.json`, { reason: 'no-library' });
  const fields = KIND_FIELDS[kind];
  const beforeSnap = snapshot(libraryDir, fields);
  if (kind === 'run_round') {
    const cap = pipelineConfig(libraryDir).cap;
    return card({ ...base, params, before: { lastRoundAt: listRounds(libraryDir, 1)[0]?.startedAt ?? null, cap }, after: { queued: true, cap }, baseHash: hashOf(beforeSnap) });
  }
  // the change for real, on a copy of streams.json: what it would be, and whether the real functions take it
  const { afterSnap, answer } = withScratch(scratchRoot, (scratch) => {
    copyFileSync(join(libraryDir, CONFIG_FILE), join(scratch, CONFIG_FILE));
    let a;
    try { a = applyLibraryKind(kind, params, scratch, plainStep); } catch (err) { throw asRefusal(err); }
    return { afterSnap: snapshot(scratch, fields), answer: a };
  });
  if (JSON.stringify(afterSnap) === JSON.stringify(beforeSnap)) throw badProposal(`${kind}: nothing would change`, { reason: 'no-change' });
  const c = { ...base, params, before: viewOf(kind, beforeSnap), after: viewOf(kind, afterSnap), baseHash: hashOf(beforeSnap) };
  if (kind === 'add_source') {
    c.params = { ...params, source: answer };
    c.trial = await trialOf(answer, { ...ctx, now });
  }
  return card(c);
}

/** THE guard of package B: only a pending card is confirmed, declined or sent back. */
export function assertPending(c) {
  if (c === null || typeof c !== 'object' || c.status !== 'pending') {
    throw new StreamsError('not-pending', `proposal ${String(c?.id)} is ${String(c?.status)}, not pending: nothing done`);
  }
}

const stale = (c, at, reason) => card({ ...c, status: 'stale', decidedAt: at, reason });
const failed = (c, at, failure, extra = {}) => card({ ...c, ...extra, status: 'failed', decidedAt: at, failure });
const errorText = (err) => String(err?.message ?? err).slice(0, 300);

// streams.json back to the bytes it had (a temporary file and a rename)
function putBack(path, bytes) {
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, bytes, { flag: 'wx' });
  renameSync(tmp, path);
}

function confirmCreate(c, { hooks, language, now, onStep, at }) {
  const p = c.params;
  const state = folderState(p.folder);
  if (state === 'not-empty' || hashOf({ folder: pathKey(p.folder), free: true }) !== c.baseHash) return stale(c, at, 'folder_not_empty');
  const done = [];
  let current = null;
  const step = (name, fn) => { current = name; onStep?.(name); const r = fn(); done.push(name); return r; };
  const ticked = p.sources.filter((_, i) => c.trial?.[i]?.include === true);
  let libraryId = null;
  try {
    buildLibrary(p, p.folder, { language, sources: ticked, step });
    libraryId = step('register', () => {
      const r = hooks?.register?.(p.folder, { name: p.name });
      if (typeof r?.libraryId !== 'string') throw new StreamsError('internal', 'the library was not registered');
      return r.libraryId;
    });
  } catch (err) {
    // undone: the registration, then what the steps made in the folder (a folder that was there and empty stays)
    let undone = true;
    if (libraryId) { try { hooks.unregister(libraryId); } catch { undone = false; } }
    // the folder was taken between the check and createLibrary (createLibrary refused): none of it is ours
    const left = current === 'create' && err?.code === 'exists' ? [] : unmake(p.folder, state);
    return failed(c, at, { step: current, done, code: err?.code ?? null, message: errorText(err), rolledBack: undone && left.length === 0, ...(left.length ? { left } : {}) });
  }
  // 「谁定的」: what this card decided, in the new library's changes.jsonl
  let changesNotRecorded = null;
  try {
    const values = snapshot(p.folder, CREATE_FIELDS);
    for (const field of CREATE_FIELDS) {
      if (field === 'thresholds' && !p.thresholds) continue;
      recordChange(p.folder, { field, by: 'agent-confirmed', proposalId: c.id, before: null, after: values[field] }, { now });
    }
  } catch (err) {
    changesNotRecorded = errorText(err);
  }
  const extra = changesNotRecorded ? { changesNotRecorded } : {};
  let queued;
  try {
    queued = step('queue', () => hooks.enqueue(libraryId));
  } catch (err) {
    // the library is made, registered and the current one: it stays; the card says it got that far
    return failed(c, at, { step: 'queue', done, code: err?.code ?? null, message: errorText(err), rolledBack: false }, { result: { libraryId, folder: p.folder, ...extra } });
  }
  return card({ ...c, status: 'confirmed', decidedAt: at, result: { libraryId, folder: p.folder, queued: queued?.queued !== false, ...(queued?.reason ? { queueReason: queued.reason } : {}), ...extra } });
}

export function confirmProposal(c, { libraryDir = null, hooks = {}, language = 'zh-CN', now = () => new Date(), onStep } = {}) {
  assertPending(c);
  const at = now().toISOString();
  if (c.kind === 'create_library') return confirmCreate(c, { hooks, language, now, onStep, at });
  if (!usableLibrary(libraryDir)) return stale(c, at, 'library-gone');
  const fields = KIND_FIELDS[c.kind];
  const beforeSnap = snapshot(libraryDir, fields);
  if (hashOf(beforeSnap) !== c.baseHash) return stale(c, at, 'changed');
  if (c.kind === 'run_round') {
    let r;
    try {
      onStep?.('queue');
      r = hooks.enqueue(c.libraryId);
    } catch (err) {
      return failed(c, at, { step: 'queue', done: [], code: err?.code ?? null, message: errorText(err), rolledBack: true });
    }
    return card({ ...c, status: 'confirmed', decidedAt: at, result: { queued: r?.queued !== false, ...(r?.reason ? { queueReason: r.reason } : {}) } });
  }
  const path = join(libraryDir, CONFIG_FILE);
  const bytes = readFileSync(path);
  const done = [];
  let current = null;
  try {
    applyLibraryKind(c.kind, c.params, libraryDir, (name, fn) => { current = name; onStep?.(name); const r = fn(); done.push(name); return r; });
  } catch (err) {
    let rolledBack = true;
    try { putBack(path, bytes); } catch { rolledBack = false; }
    return failed(c, at, { step: current, done, code: err?.code ?? null, message: errorText(err), rolledBack });
  }
  const afterSnap = snapshot(libraryDir, fields);
  const result = { changed: [] };
  try {
    result.changed = recordChanges(libraryDir, beforeSnap, afterSnap, { by: 'agent-confirmed', proposalId: c.id, now }).map((l) => l.field);
  } catch (err) {
    result.changesNotRecorded = errorText(err);
  }
  return card({ ...c, status: 'confirmed', decidedAt: at, result });
}

export function declineProposal(c, { now = () => new Date() } = {}) {
  assertPending(c);
  return card({ ...c, status: 'declined', decidedAt: now().toISOString() });
}

export function reviseProposal(c, text, { now = () => new Date() } = {}) {
  assertPending(c);
  if (typeof text !== 'string' || text.trim() === '' || [...text.trim()].length > REVISE_MAX) throw badProposal(`what to change is 1–${REVISE_MAX} characters`);
  return card({ ...c, status: 'revise', decidedAt: now().toISOString(), reviseText: text.trim() });
}
