// The schedule of rounds (A2; docs/core-api.md 5.10): pure functions over local time, `now` given by the caller.
//
// schedule = { enabled: boolean, time: 'HH:MM' }  (00:00–23:59; the desktop keeps it in settings.json)
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

function check(schedule) {
  if (schedule === null || typeof schedule !== 'object' || typeof schedule.enabled !== 'boolean' || !isScheduleTime(schedule.time)) {
    throw new StreamsError('bad-argument', 'schedule must be { enabled: boolean, time: "HH:MM" }');
  }
  const [, h, m] = TIME_RE.exec(schedule.time);
  return { enabled: schedule.enabled, h: Number(h), m: Number(m) };
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
  const today = slot(now, s, 0);
  return today.getTime() > now.getTime() ? today : slot(now, s, 1);
}

export function lastDueAt(schedule, now) {
  const s = check(schedule);
  checkNow(now);
  if (!s.enabled) return null;
  const today = slot(now, s, 0);
  return today.getTime() <= now.getTime() ? today : slot(now, s, -1);
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
