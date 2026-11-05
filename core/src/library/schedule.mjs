// streams.json `schedule`: the library's own timed round (v2 package A; docs/core-api.md 5.10). v1.0 kept one schedule
// for the app in the desktop's settings.json; v2 keeps one per library, here.
//   schedule: { enabled: boolean, time: 'HH:MM' }   (core pipeline/schedule.mjs: scheduleOf, isSchedule, DEFAULT_SCHEDULE)
//
// readLibrarySchedule(libraryDir)              -> { schedule, stored }   stored: streams.json has a `schedule` key; each
//                                                 field checked on its own (a bad one, or no key at all, is the default's)
// saveLibrarySchedule(libraryDir, schedule)    -> schedule               exactly { enabled, time } (else bad-argument)
// ensureLibrarySchedule(libraryDir, fallback)  -> { schedule, migrated } the migration: no `schedule` key yet → `fallback`
//                                                 (scheduleOf: v1.0's settings.json schedule, or the default) is written
//                                                 in; one there already is read as it is and nothing is written
// Every write goes through setup.mjs's loadWhole / saveWhole (the whole streams.json, a temporary file and a rename;
// 2-space JSON + final newline): every other key keeps its value and order. Never touches the note folder.
// Errors: bad-argument · config:<code> (streams.json unreadable)
import { StreamsError } from '../errors.mjs';
import { isSchedule, scheduleOf } from '../pipeline/schedule.mjs';
import { loadWhole, saveWhole } from './setup.mjs';

export function readLibrarySchedule(libraryDir) {
  const whole = loadWhole(libraryDir);
  return { schedule: scheduleOf(whole.schedule), stored: Object.hasOwn(whole, 'schedule') };
}

export function saveLibrarySchedule(libraryDir, schedule) {
  if (!isSchedule(schedule)) throw new StreamsError('bad-argument', 'schedule must be { enabled: boolean, time: "HH:MM" } (00:00–23:59)');
  const whole = loadWhole(libraryDir);
  whole.schedule = { enabled: schedule.enabled, time: schedule.time };
  saveWhole(libraryDir, whole);
  return { ...whole.schedule };
}

export function ensureLibrarySchedule(libraryDir, fallback) {
  const whole = loadWhole(libraryDir);
  if (Object.hasOwn(whole, 'schedule')) return { schedule: scheduleOf(whole.schedule), migrated: false };
  whole.schedule = scheduleOf(fallback);
  saveWhole(libraryDir, whole);
  return { schedule: { ...whole.schedule }, migrated: true };
}
