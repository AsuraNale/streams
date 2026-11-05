// The ten kinds of proposal card and the shape of each one's `params` (v2 package B; docs/core-api.md 5.13). Checked kind by
// kind; anything that is not the kind's shape is a StreamsError 'bad-proposal' (with `reason` when there is a short one).
// Whether a source, a topic, a name… fits the library as it is now is not judged here: draftProposal runs the change on a
// copy of the library (proposals.mjs) and a refusal of the real functions is a bad-proposal too.
//
//   create_library   { name, brief, folder?, topics?, sources?, thresholds?, schedule? }
//                      name 1–100 characters (registry isLibraryName) · brief 1–2000 · folder an absolute path, or
//                      null / '' / missing = the default place (libraryRoot\<the name as a folder name>) · topics
//                      [{ name, keywords? }] · sources [v1.0 source object] (checkSource, against the topics of the card and
//                      the sources before it) · thresholds { relevance?, substance? } 0–1, or null · schedule exactly
//                      { enabled, time } (isSchedule), or null = what a new library gets (the caller's fallback)
//   add_source       { libraryId, source }
//   remove_source    { libraryId, name }
//   pause_source     { libraryId, name, paused }
//   edit_topics      { libraryId, ops: [1–20 of
//                        { op: 'add_topic', name, keywords? } · { op: 'remove_topic', name } ·
//                        { op: 'add_keywords', topic, keywords } · { op: 'remove_keywords', topic, keywords }] }
//   edit_brief       { libraryId, brief }                         brief 1–2000 characters (trimmed)
//   edit_thresholds  { libraryId, relevance?, substance? }        at least one, each 0–1
//   edit_schedule    { libraryId, enabled?, time? }               at least one; time 'HH:MM'
//   edit_cap         { libraryId, cap }                           a whole number > 0 (v1.0 setRoundCap)
//   run_round        { libraryId }
// Every kind but create_library names its library by its registry id (1–40 characters here; whether there is such a library
// is the caller's to say). The keys before / after / trial / baseHash are the code's to work out, never the issuer's: in
// `params` they are dropped without a word (as they are beside `params`, proposals.mjs); any other unknown key is refused.
import { isAbsolute, resolve } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { isBrief } from '../library/brief.mjs';
import { isLibraryName } from '../registry/registry.mjs';
import { isSchedule, isScheduleTime } from '../pipeline/schedule.mjs';

export const PROPOSAL_KINDS = Object.freeze([
  'create_library', 'add_source', 'remove_source', 'pause_source', 'edit_topics', 'edit_brief', 'edit_thresholds', 'edit_schedule', 'edit_cap', 'run_round',
]);
export const LIBRARY_KINDS = Object.freeze(PROPOSAL_KINDS.filter((k) => k !== 'create_library'));
export const TOPIC_OPS = Object.freeze(['add_topic', 'remove_topic', 'add_keywords', 'remove_keywords']);
// what the code works out on every card; given by the issuer, it is dropped
export const COMPUTED_KEYS = Object.freeze(['before', 'after', 'trial', 'baseHash']);
export const OPS_MAX = 20;
export const KEYWORDS_MAX = 50;
export const KEYWORD_MAX = 100;
export const TOPICS_MAX = 30;
export const SOURCES_MAX = 30;
export const LIBRARY_ID_MAX = 40;

export const badProposal = (message, extra = {}) => new StreamsError('bad-proposal', message, extra);

const isText = (v, max) => typeof v === 'string' && v.trim() !== '' && [...v.trim()].length <= max;
const isUnit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

function only(o, keys, what) {
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) throw badProposal(`${what}: unknown ${extra.length === 1 ? 'key' : 'keys'} ${extra.join(', ')} (it takes ${keys.join(', ')})`);
}

function withoutComputed(o) {
  const out = { ...o };
  for (const k of COMPUTED_KEYS) delete out[k];
  return out;
}

function keywordsOf(v, what, { required = false } = {}) {
  if (v === undefined && !required) return [];
  if (!Array.isArray(v) || v.length > KEYWORDS_MAX || !v.every((k) => typeof k === 'string' && k.length <= KEYWORD_MAX)) {
    throw badProposal(`${what}: keywords are a list of at most ${KEYWORDS_MAX} words of at most ${KEYWORD_MAX} characters`);
  }
  const out = [...new Set(v.map((k) => k.trim()).filter((k) => k !== ''))];
  if (required && out.length === 0) throw badProposal(`${what}: at least one keyword`);
  return out;
}

function sourceOf(v, what) {
  if (!isPlainObject(v)) throw badProposal(`${what}: a source is an object (a streams.json source)`);
  const s = structuredClone(v);
  // whether a source of a new library is taken is the trial's to say (create_library), never the issuer's
  delete s.include;
  return s;
}

function topicOp(op, i) {
  const what = `ops[${i}]`;
  if (!isPlainObject(op) || !TOPIC_OPS.includes(op.op)) throw badProposal(`${what}: op is one of ${TOPIC_OPS.join(' / ')}`);
  switch (op.op) {
    case 'add_topic':
      only(op, ['op', 'name', 'keywords'], what);
      if (!isText(op.name, 100)) throw badProposal(`${what}: a topic name is 1–100 characters`);
      return { op: op.op, name: op.name.trim(), keywords: keywordsOf(op.keywords, what) };
    case 'remove_topic':
      only(op, ['op', 'name'], what);
      if (!isText(op.name, 100)) throw badProposal(`${what}: a topic name is 1–100 characters`);
      return { op: op.op, name: op.name.trim() };
    default:
      only(op, ['op', 'topic', 'keywords'], what);
      if (!isText(op.topic, 100)) throw badProposal(`${what}: a topic name is 1–100 characters`);
      return { op: op.op, topic: op.topic.trim(), keywords: keywordsOf(op.keywords, what, { required: true }) };
  }
}

function thresholdsOf(o, what) {
  if (!isPlainObject(o)) throw badProposal(`${what}: thresholds are { relevance?, substance? }`);
  only(o, ['relevance', 'substance'], what);
  const out = {};
  for (const k of ['relevance', 'substance']) {
    if (o[k] === undefined) continue;
    if (!isUnit(o[k])) throw badProposal(`${what}: ${k} is a number from 0 to 1`);
    out[k] = o[k];
  }
  if (Object.keys(out).length === 0) throw badProposal(`${what}: at least one of relevance / substance`);
  return out;
}

function libraryIdOf(p, kind) {
  if (typeof p.libraryId !== 'string' || p.libraryId.trim() === '' || p.libraryId.length > LIBRARY_ID_MAX) throw badProposal(`${kind}: libraryId is a library's registry id`);
  return p.libraryId;
}

/**
 * The params of a card of `kind`, checked and normalized (trimmed, keywords de-duplicated, sources cloned).
 * @returns {object} a new object
 */
export function checkParams(kind, params) {
  if (!PROPOSAL_KINDS.includes(kind)) throw badProposal(`kind must be one of ${PROPOSAL_KINDS.join(' / ')}, got ${JSON.stringify(kind)}`);
  if (!isPlainObject(params)) throw badProposal(`${kind}: params must be an object`);
  const p = withoutComputed(params);
  switch (kind) {
    case 'create_library': {
      only(p, ['name', 'brief', 'folder', 'topics', 'sources', 'thresholds', 'schedule'], kind);
      if (!isLibraryName(p.name)) throw badProposal(`${kind}: name is 1–100 characters`);
      if (!isBrief(p.brief)) throw badProposal(`${kind}: brief is 1–2000 characters`);
      let folder = null;
      if (p.folder !== undefined && p.folder !== null && p.folder !== '') {
        if (typeof p.folder !== 'string' || !isAbsolute(p.folder) || p.folder.length > 1000) throw badProposal(`${kind}: folder is an absolute path, or empty for the default place`);
        folder = resolve(p.folder);
      }
      const topics = p.topics === undefined ? [] : p.topics;
      if (!Array.isArray(topics) || topics.length > TOPICS_MAX) throw badProposal(`${kind}: topics are a list of at most ${TOPICS_MAX}`);
      const sources = p.sources === undefined ? [] : p.sources;
      if (!Array.isArray(sources) || sources.length > SOURCES_MAX) throw badProposal(`${kind}: sources are a list of at most ${SOURCES_MAX}`);
      if (p.schedule !== undefined && p.schedule !== null && !isSchedule(p.schedule)) throw badProposal(`${kind}: schedule is exactly { enabled, time: 'HH:MM' }, or null`);
      return {
        name: p.name.trim(),
        brief: p.brief.trim(),
        folder,
        topics: topics.map((t, i) => {
          const what = `${kind}: topics[${i}]`;
          if (!isPlainObject(t)) throw badProposal(`${what}: a topic is { name, keywords? }`);
          only(t, ['name', 'keywords'], what);
          if (!isText(t.name, 100)) throw badProposal(`${what}: a topic name is 1–100 characters`);
          return { name: t.name.trim(), keywords: keywordsOf(t.keywords, what) };
        }),
        sources: sources.map((s, i) => sourceOf(s, `${kind}: sources[${i}]`)),
        thresholds: p.thresholds === undefined || p.thresholds === null ? null : thresholdsOf(p.thresholds, `${kind}: thresholds`),
        schedule: p.schedule === undefined || p.schedule === null ? null : { enabled: p.schedule.enabled, time: p.schedule.time },
      };
    }
    case 'add_source':
      only(p, ['libraryId', 'source'], kind);
      return { libraryId: libraryIdOf(p, kind), source: sourceOf(p.source, kind) };
    case 'remove_source':
      only(p, ['libraryId', 'name'], kind);
      if (!isText(p.name, 100)) throw badProposal(`${kind}: name is the source's name`);
      return { libraryId: libraryIdOf(p, kind), name: p.name.trim() };
    case 'pause_source':
      only(p, ['libraryId', 'name', 'paused'], kind);
      if (!isText(p.name, 100)) throw badProposal(`${kind}: name is the source's name`);
      if (typeof p.paused !== 'boolean') throw badProposal(`${kind}: paused is true or false`);
      return { libraryId: libraryIdOf(p, kind), name: p.name.trim(), paused: p.paused };
    case 'edit_topics':
      only(p, ['libraryId', 'ops'], kind);
      if (!Array.isArray(p.ops) || p.ops.length === 0 || p.ops.length > OPS_MAX) throw badProposal(`${kind}: ops is a list of 1–${OPS_MAX} changes`);
      return { libraryId: libraryIdOf(p, kind), ops: p.ops.map(topicOp) };
    case 'edit_brief':
      only(p, ['libraryId', 'brief'], kind);
      if (!isBrief(p.brief)) throw badProposal(`${kind}: brief is 1–2000 characters`);
      return { libraryId: libraryIdOf(p, kind), brief: p.brief.trim() };
    case 'edit_thresholds': {
      only(p, ['libraryId', 'relevance', 'substance'], kind);
      const { relevance, substance } = p;
      return { libraryId: libraryIdOf(p, kind), ...thresholdsOf({ ...(relevance !== undefined ? { relevance } : {}), ...(substance !== undefined ? { substance } : {}) }, kind) };
    }
    case 'edit_schedule': {
      only(p, ['libraryId', 'enabled', 'time'], kind);
      const out = { libraryId: libraryIdOf(p, kind) };
      if (p.enabled !== undefined) {
        if (typeof p.enabled !== 'boolean') throw badProposal(`${kind}: enabled is true or false`);
        out.enabled = p.enabled;
      }
      if (p.time !== undefined) {
        if (!isScheduleTime(p.time)) throw badProposal(`${kind}: time is 'HH:MM' (00:00–23:59)`);
        out.time = p.time;
      }
      if (out.enabled === undefined && out.time === undefined) throw badProposal(`${kind}: at least one of enabled / time`);
      return out;
    }
    case 'edit_cap':
      only(p, ['libraryId', 'cap'], kind);
      if (!Number.isInteger(p.cap) || p.cap <= 0) throw badProposal(`${kind}: cap is a whole number greater than 0`);
      return { libraryId: libraryIdOf(p, kind), cap: p.cap };
    case 'run_round':
      only(p, ['libraryId'], kind);
      return { libraryId: libraryIdOf(p, kind) };
    default:
      throw badProposal(`no kind ${kind}`);
  }
}
