// The schedule (docs/core-api.md 5.10): nextRunAt / lastDueAt / missedRun on local times, `now` given. Each rule has the
// case that would fail if the rule were wrong: a time before and after the day's slot, the slot itself, a round just
// before and just after the slot, three missed days that still owe one round, the schedule switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE, isScheduleTime, lastDueAt, missedRun, nextRunAt } from '../src/pipeline/schedule.mjs';
import * as core from '../src/index.mjs';

// local time, as the app's clock reads it
const at = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s, 0);
const ON = { enabled: true, time: '08:30' };
const OFF = { enabled: false, time: '08:30' };

test('the default is every day at 08:30, on; the core exports all three', () => {
  assert.deepEqual({ ...DEFAULT_SCHEDULE }, { enabled: true, time: '08:30' });
  for (const name of ['nextRunAt', 'lastDueAt', 'missedRun']) assert.equal(typeof core[name], 'function', name);
});

test('nextRunAt: today when the slot is still ahead, tomorrow once it has come; null when off', () => {
  assert.equal(nextRunAt(ON, at(2026, 11, 4, 7, 0)).getTime(), at(2026, 11, 4, 8, 30).getTime(), 'before 08:30 → today');
  assert.equal(nextRunAt(ON, at(2026, 11, 4, 9, 0)).getTime(), at(2026, 11, 5, 8, 30).getTime(), 'after 08:30 → tomorrow');
  assert.equal(nextRunAt(ON, at(2026, 11, 4, 8, 30)).getTime(), at(2026, 11, 5, 8, 30).getTime(), 'at 08:30 exactly → tomorrow (strictly after now)');
  assert.equal(nextRunAt(ON, at(2026, 11, 4, 8, 29, 59)).getTime(), at(2026, 11, 4, 8, 30).getTime(), 'one second before → today');
  // the end of a month and of a year roll over
  assert.equal(nextRunAt(ON, at(2026, 11, 30, 23, 0)).getTime(), at(2026, 12, 1, 8, 30).getTime());
  assert.equal(nextRunAt({ enabled: true, time: '00:00' }, at(2026, 12, 31, 23, 59)).getTime(), at(2027, 1, 1, 0, 0).getTime());
  assert.equal(nextRunAt({ enabled: true, time: '23:59' }, at(2026, 11, 4, 23, 58)).getTime(), at(2026, 11, 4, 23, 59).getTime());
  assert.equal(nextRunAt(OFF, at(2026, 11, 4, 7, 0)), null);
});

test('lastDueAt: today once the slot has passed, else yesterday; null when off', () => {
  assert.equal(lastDueAt(ON, at(2026, 11, 4, 9, 0)).getTime(), at(2026, 11, 4, 8, 30).getTime(), 'after 08:30 → today');
  assert.equal(lastDueAt(ON, at(2026, 11, 4, 7, 0)).getTime(), at(2026, 11, 3, 8, 30).getTime(), 'before 08:30 → yesterday');
  assert.equal(lastDueAt(ON, at(2026, 11, 4, 8, 30)).getTime(), at(2026, 11, 4, 8, 30).getTime(), 'at 08:30 exactly → today');
  assert.equal(lastDueAt(ON, at(2026, 11, 1, 7, 0)).getTime(), at(2026, 10, 31, 8, 30).getTime(), 'the month rolls back');
  assert.equal(lastDueAt(OFF, at(2026, 11, 4, 9, 0)), null);
});

test('missedRun: the last round before the last slot → one round owed; at or after it → none', () => {
  const now = at(2026, 11, 4, 9, 0); // today's 08:30 has passed
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 3, 8, 30).toISOString(), now }), true, 'last round yesterday 08:30');
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 4, 8, 29).toISOString(), now }), true, 'one minute before today\'s slot');
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 4, 8, 30).toISOString(), now }), false, 'exactly at the slot');
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 4, 8, 45).toISOString(), now }), false, 'after today\'s slot');
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 4, 8, 45), now }), false, 'a Date works as well as an ISO string');
  // before today's slot the owed one is yesterday's
  const early = at(2026, 11, 4, 7, 0);
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 3, 9, 0).toISOString(), now: early }), false, 'yesterday after its slot, now before today\'s');
  assert.equal(missedRun(ON, { lastRoundAt: at(2026, 11, 3, 8, 0).toISOString(), now: early }), true, 'yesterday before its slot');
});

test('missedRun: three days away still says one (true), not three; never ran → true; off → false', () => {
  const now = at(2026, 11, 7, 10, 0);
  const r = missedRun(ON, { lastRoundAt: at(2026, 11, 4, 9, 0).toISOString(), now });
  assert.equal(r, true);
  assert.equal(typeof r, 'boolean', 'a yes or no, not a count');
  assert.equal(missedRun(ON, { lastRoundAt: null, now }), true, 'no round ever');
  assert.equal(missedRun(ON, { now }), true, 'lastRoundAt left out');
  assert.equal(missedRun(ON, { lastRoundAt: 'not a time', now }), true, 'an unreadable start time counts as none');
  assert.equal(missedRun(OFF, { lastRoundAt: null, now }), false, 'off: nothing is owed');
  assert.equal(missedRun(OFF, { lastRoundAt: at(2026, 11, 1, 9, 0).toISOString(), now }), false);
});

test('another time of day moves the slot with it', () => {
  const s = { enabled: true, time: '21:15' };
  assert.equal(nextRunAt(s, at(2026, 11, 4, 9, 0)).getTime(), at(2026, 11, 4, 21, 15).getTime());
  assert.equal(lastDueAt(s, at(2026, 11, 4, 9, 0)).getTime(), at(2026, 11, 3, 21, 15).getTime());
  assert.equal(missedRun(s, { lastRoundAt: at(2026, 11, 4, 8, 30).toISOString(), now: at(2026, 11, 4, 9, 0) }), false, 'a morning round covers yesterday evening\'s slot');
  assert.equal(missedRun(s, { lastRoundAt: at(2026, 11, 3, 21, 0).toISOString(), now: at(2026, 11, 4, 9, 0) }), true);
});

test('a bad schedule or a bad now is refused (bad-argument), never read as some time', () => {
  assert.equal(isScheduleTime('08:30'), true);
  assert.equal(isScheduleTime('00:00'), true);
  assert.equal(isScheduleTime('23:59'), true);
  for (const t of ['25:00', '24:00', '8:30', '08:60', '0830', '', ' 08:30', 8.5, null]) assert.equal(isScheduleTime(t), false, String(t));
  const now = at(2026, 11, 4, 9, 0);
  for (const s of [null, {}, { enabled: 'yes', time: '08:30' }, { enabled: true, time: '25:00' }, { enabled: true }]) {
    assert.throws(() => nextRunAt(s, now), e => e.code === 'bad-argument', JSON.stringify(s));
    assert.throws(() => lastDueAt(s, now), e => e.code === 'bad-argument', JSON.stringify(s));
    assert.throws(() => missedRun(s, { now }), e => e.code === 'bad-argument', JSON.stringify(s));
  }
  assert.throws(() => nextRunAt(ON, '2026-11-04T09:00:00'), e => e.code === 'bad-argument');
  assert.throws(() => missedRun(ON, { lastRoundAt: null, now: new Date('nope') }), e => e.code === 'bad-argument');
});
