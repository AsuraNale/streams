// A new library's settings, the same whichever way it is made (redesign R4a; O15, 维护者 11-11 第 5、8 题; docs/core-api.md 5.18):
// 新建库's form (the desktop's services/new-library.mjs) and a confirmed create_library card (proposals.mjs) both run
// fillNewLibrary on a folder whose streams.json is there already (createLibrary / importFolder), so the defaults cannot drift.
//
// newLibrarySettings({ thresholds, schedule, cap }, { fallbackSchedule })
//   -> { thresholds: { relevance, substance }, schedule: { enabled, time }, cap: number|null }
//   what a new library gets: the thresholds given laid over 标准's (none given: 标准 0.5 / 0.6, STRICTNESS.standard), the
//   schedule given or else the app's (`fallbackSchedule`, each field checked: scheduleOf), the cap given or null (= the
//   pipeline's default, DEFAULTS.cap, nothing written)
// fillNewLibrary(dir, spec, { step })
//   spec = { brief, topics: [{ name, keywords? }], sources: [source], thresholds, schedule, cap? } (newLibrarySettings' shape
//   for the last three). Steps, in order, each through `step(name, fn)` (proposals.mjs counts and undoes them): brief → topics
//   → sources → thresholds → schedule → cap (only when spec.cap is a number). Every write is the core's own function
//   (saveBrief, addTopic, addSource, savePipelineConfig, saveLibrarySchedule): streams.json only, never the note folder.
// checkNewLibrary(spec) -> the sources as addSource would store them
//   the spec judged before anything is made: a brief (isBrief), topic names, each source against the topics and the ones
//   before it (checkSource). Throws bad-argument / bad-topic / bad-source / duplicate-* as those functions do.
import { StreamsError } from '../errors.mjs';
import { saveBrief, isBrief, BRIEF_MAX } from './brief.mjs';
import { addSource, addTopic, checkSource } from './sources.mjs';
import { saveLibrarySchedule } from './schedule.mjs';
import { pipelineConfig, savePipelineConfig } from '../pipeline/config.mjs';
import { scheduleOf } from '../pipeline/schedule.mjs';
import { STRICTNESS, DEFAULT_STRICTNESS, withThresholds } from '../pipeline/strictness.mjs';

const plainStep = (_name, fn) => fn();

export function newLibrarySettings({ thresholds = null, schedule = null, cap = null } = {}, { fallbackSchedule = null } = {}) {
  return {
    thresholds: { ...STRICTNESS[DEFAULT_STRICTNESS], ...(thresholds ?? {}) },
    schedule: scheduleOf(schedule ?? fallbackSchedule),
    cap: Number.isInteger(cap) ? cap : null,
  };
}

export function checkNewLibrary(spec) {
  if (!isBrief(spec?.brief)) throw new StreamsError('bad-argument', `a brief is 1–${BRIEF_MAX} characters`);
  const topics = Array.isArray(spec.topics) ? spec.topics : [];
  const names = [];
  for (const t of topics) {
    const n = typeof t?.name === 'string' ? t.name.trim() : '';
    if (n === '') throw new StreamsError('bad-topic', 'a topic needs a name');
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) throw new StreamsError('duplicate-topic', `a topic named "${n}" twice`);
    names.push(n);
  }
  const stored = [];
  for (const s of Array.isArray(spec.sources) ? spec.sources : []) stored.push(checkSource(s, { others: stored, topics: names }));
  return stored;
}

export function fillNewLibrary(dir, spec, { step = plainStep } = {}) {
  step('brief', () => saveBrief(dir, spec.brief));
  step('topics', () => { for (const t of spec.topics ?? []) addTopic(dir, t); });
  step('sources', () => { for (const s of spec.sources ?? []) addSource(dir, s); });
  step('thresholds', () => savePipelineConfig(dir, withThresholds(pipelineConfig(dir), spec.thresholds ?? STRICTNESS[DEFAULT_STRICTNESS])));
  step('schedule', () => saveLibrarySchedule(dir, spec.schedule));
  if (Number.isInteger(spec.cap)) step('cap', () => savePipelineConfig(dir, { ...pipelineConfig(dir), cap: spec.cap }));
}
