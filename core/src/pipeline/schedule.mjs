// The schedule of rounds (A2; docs/core-api.md 5.10): pure functions over local time, `now` given by the caller.
//
// schedule = { enabled: boolean, time: 'HH:MM' }  (00:00–23:59; each library keeps its own in streams.json, v2 package A:
//            src/library/schedule.mjs; v1.0 kept one in the desktop's settings.json)
//            1.1.1 P11a (A10): and how often — { every: 'weekdays' } (Monday to Friday), { every: 'week', days: [0–6, …] } (those
//            days of the week, 0 = Sunday, at least one), { every: 'month', day: 1–28 } (that day of the month). No `every` (or
//            'day') is every day, as every schedule was before: those read back exactly { enabled, time }.
// rhythmSchedule(rhythm, now, time)           -> schedule      a card's 「节奏」 line read as a schedule: the first how-often word in
//                                                              it decides (「每天看一次……每月 1 日……」 is every day); 每周 → the
//                                                              weekdays named in that sentence, else `now`'s; 每月 → the day named,
//                                                              else `now`'s (at most 28); 工作日; nothing found: every day
// scheduleOf(raw)                             -> schedule      each field checked on its own: a bad one is DEFAULT_SCHEDULE's
// isSchedule(raw)                             -> boolean       exactly { enabled, time } with both good, nothing else
// nextRunAt(schedule, now)                    -> Date | null   the next time of day strictly after `now`
// lastDueAt(schedule, now)                    -> Date | null   the latest one at or before `now` (today's once passed, else yesterday's)
// missedRun(schedule, { lastRoundAt, now })   -> boolean       lastDueAt exists and the last round started before it (or never ran)
// Only one round is owed however many were missed: missedRun says yes or no, never how many.
import { StreamsError } from '../errors.mjs';

export const DEFAULT_SCHEDULE = Object.freeze({ enabled: true, time: '08:30' });
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Is `time` a time of day the schedule takes ('HH:MM', 00:00–23:59)? */
export function isScheduleTime(time) {
  return typeof time === 'string' && TIME_RE.test(time);
}

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

export const SCHEDULE_EVERY = Object.freeze(['day', 'weekdays', 'week', 'month']);
const goodDays = (days) => Array.isArray(days) && days.length >= 1 && days.length <= 7 && days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(days).size === days.length;

/** The how-often part of a raw schedule: {} for every day, { every }, { every, days } or { every, day } (a bad one: null). */
function oftenOf(raw) {
  if (!isObject(raw)) return {};
  const { every } = raw;
  if (every === undefined || every === 'day') return raw.day === undefined && raw.days === undefined ? {} : null;
  if (every === 'weekdays') return raw.day === undefined && raw.days === undefined ? { every } : null;
  if (every === 'week') return raw.day === undefined && goodDays(raw.days) ? { every, days: [...raw.days].sort((x, y) => x - y) } : null;
  if (every === 'month') return raw.days === undefined && Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= 28 ? { every, day: raw.day } : null;
  return null;
}

export function scheduleOf(raw) {
  const enabled = isObject(raw) ? raw.enabled : undefined;
  const time = isObject(raw) ? raw.time : undefined;
  return { enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SCHEDULE.enabled, time: isScheduleTime(time) ? time : DEFAULT_SCHEDULE.time, ...(oftenOf(raw) ?? {}) };
}

export function isSchedule(raw) {
  return isObject(raw) && Object.keys(raw).every((k) => ['enabled', 'time', 'every', 'day', 'days'].includes(k)) && typeof raw.enabled === 'boolean' && isScheduleTime(raw.time) && oftenOf(raw) !== null;
}

function check(schedule) {
  if (schedule === null || typeof schedule !== 'object' || typeof schedule.enabled !== 'boolean' || !isScheduleTime(schedule.time) || oftenOf(schedule) === null) {
    throw new StreamsError('bad-argument', 'schedule must be { enabled: boolean, time: "HH:MM", every?, day? }');
  }
  const [, h, m] = TIME_RE.exec(schedule.time);
  const often = oftenOf(schedule);
  return { enabled: schedule.enabled, h: Number(h), m: Number(m), every: often.every ?? 'day', day: often.day, days: often.days };
}

/** Is a slot on this date one of the schedule's days? */
function onDay(s, d) {
  if (s.every === 'weekdays') return d.getDay() >= 1 && d.getDay() <= 5;
  if (s.every === 'week') return s.days.includes(d.getDay());
  if (s.every === 'month') return d.getDate() === s.day;
  return true;
}
// the furthest a schedule's next (or last) slot can be: a month and a bit
const LOOK_DAYS = 62;

const WEEKDAY_WORDS = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const EN_WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const OFTEN = [
  ['weekdays', /工作日|weekdays?\b/i],
  ['month', /每月|每个月|月度|monthly|every month|once a month/i],
  ['week', /每周|每星期|每礼拜|一周一次|每一周|weekly|every week|once a week/i],
  ['day', /每天|每日|天天|daily|every day|once a day/i],
];

export function rhythmSchedule(rhythm, now = new Date(), time = DEFAULT_SCHEDULE.time) {
  const t = String(rhythm ?? '');
  const base = { enabled: true, time: isScheduleTime(time) ? time : DEFAULT_SCHEDULE.time };
  // the first how-often word in the line decides; the rest of the line is about other dates
  let first = null;
  for (const [kind, re] of OFTEN) { const m = re.exec(t); if (m && (first === null || m.index < first.at)) first = { kind, at: m.index }; }
  if (!first || first.kind === 'day') return base;
  if (first.kind === 'weekdays') return { ...base, every: 'weekdays' };
  // the sentence that says it
  const start = Math.max(-1, ...['；', ';', '。', '\n'].map((c) => t.lastIndexOf(c, first.at))) + 1;
  const ends = ['；', ';', '。', '\n'].map((c) => t.indexOf(c, first.at)).filter((i) => i >= 0);
  const sentence = t.slice(start, ends.length ? Math.min(...ends) : t.length);
  if (first.kind === 'month') {
    const m = /(\d{1,2})\s*[号日]/.exec(sentence);
    return { ...base, every: 'month', day: m ? Math.min(28, Math.max(1, Number(m[1]))) : Math.min(28, now.getDate()) };
  }
  // 「每周一次」 is once a week, not Monday: a weekday word followed by 次 / 回 / 遍 is a count
  const days = new Set();
  for (const m of sentence.matchAll(/(?:周|星期|礼拜)([一二三四五六日天])(?![次回遍])/g)) days.add(WEEKDAY_WORDS[m[1]]);
  for (const m of sentence.matchAll(/(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/gi)) days.add(EN_WEEKDAYS[m[1].toLowerCase()]);
  // 「每周二、周五」 / 「每周二、五」: a bare weekday word after a listing comma counts too
  for (const m of sentence.matchAll(/[、,，和及]\s*([一二三四五六日])(?![次回遍])/g)) days.add(WEEKDAY_WORDS[m[1]]);
  return { ...base, every: 'week', days: days.size ? [...days].sort((x, y) => x - y) : [now.getDay()] };
}

function checkNow(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new StreamsError('bad-argument', 'now must be a valid Date');
  return now;
}

// the schedule's time on the day of `now` plus `days`, local time
const slot = (now, { h, m }, days) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m, 0, 0);

export function nextRunAt(schedule, now) {
  const s = check(schedule);
  checkNow(now);
  if (!s.enabled) return null;
  for (let d = 0; d <= LOOK_DAYS; d++) {
    const at = slot(now, s, d);
    if (at.getTime() > now.getTime() && onDay(s, at)) return at;
  }
  return null;
}

export function lastDueAt(schedule, now) {
  const s = check(schedule);
  checkNow(now);
  if (!s.enabled) return null;
  for (let d = 0; d >= -LOOK_DAYS; d--) {
    const at = slot(now, s, d);
    if (at.getTime() <= now.getTime() && onDay(s, at)) return at;
  }
  return null;
}

export function missedRun(schedule, { lastRoundAt = null, now } = {}) {
  const due = lastDueAt(schedule, now);
  if (!due) return false;
  if (lastRoundAt === null || lastRoundAt === undefined) return true;
  const last = lastRoundAt instanceof Date ? lastRoundAt : new Date(lastRoundAt);
  // a start time that does not read as a time: as if no round had run
  if (Number.isNaN(last.getTime())) return true;
  return last.getTime() < due.getTime();
}
