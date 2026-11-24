// 1.1.1 P11a (docs/checks/2026-11-24-1.1.1/handoff/2026-11-24-v1.1.1-acceptance.md A10): how often a library runs follows its
// card's rhythm — what the card says, what 来源与要求 shows and how many times it runs are the same. A schedule now says how
// often (every day as before, weekdays, days of the week, a day of the month); a new library's is set from its card's
// 「节奏」 line when the card is confirmed; a schedule without it reads back as every day, as every schedule was before.
// Each check was run against the input that should fail it first (core/scripts/mutation-check.mjs v111-sch-*).
process.env.TZ = 'America/Toronto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rhythmSchedule, nextRunAt, lastDueAt, missedRun, scheduleOf, isSchedule, saveLibrarySchedule, readLibrarySchedule, createLibrary,
  cardHandlers,
} from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const NOW = new Date('2026-11-24T15:00:00.000Z'); // Tuesday 10:00 in Toronto
// the four cards W4's live round 2 confirmed (a copy under test/fixtures: the mutation mirror has no docs/)
const CARDS = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'w4-cards.json'), 'utf8')).cards;
const card = (n) => CARDS.find((c) => c.n === n).card;

/** How many slots come in the 7 days after NOW. */
function slotsIn7Days(s) {
  let t = NOW; let n = 0;
  for (;;) { const x = nextRunAt(s, t); if (!x || x.getTime() - NOW.getTime() > 7 * 86_400_000) return n; n += 1; t = x; }
}

test('A10: a weekly schedule comes once in 7 days, twice-weekly twice, weekdays 5 times, every day 7 times', () => {
  assert.equal(slotsIn7Days({ enabled: true, time: '08:30', every: 'week', days: [3] }), 1);
  assert.equal(slotsIn7Days({ enabled: true, time: '08:30', every: 'week', days: [2, 5] }), 2);
  assert.equal(slotsIn7Days({ enabled: true, time: '08:30', every: 'weekdays' }), 5);
  assert.equal(slotsIn7Days({ enabled: true, time: '08:30' }), 7);
  assert.equal(slotsIn7Days({ enabled: false, time: '08:30', every: 'week', days: [3] }), 0);
  // monthly: the 15th's slot is the next one, the 15th of last month the last due
  const m = { enabled: true, time: '08:30', every: 'month', day: 15 };
  assert.equal(nextRunAt(m, NOW).toString(), new Date(2026, 11, 15, 8, 30).toString());
  assert.equal(lastDueAt(m, NOW).toString(), new Date(2026, 10, 15, 8, 30).toString());
  // a weekly library that missed its Wednesday slot owes one round, not one per missed day
  const w = { enabled: true, time: '08:30', every: 'week', days: [3] };
  assert.equal(missedRun(w, { lastRoundAt: '2026-11-10T14:00:00.000Z', now: NOW }), true);
  assert.equal(missedRun(w, { lastRoundAt: '2026-11-19T14:00:00.000Z', now: NOW }), false, 'ran after last Wednesday\'s slot');
});

test('A10: the card\'s 「节奏」 read as a schedule — the first how-often word decides; weekdays from that sentence', () => {
  assert.deepEqual(rhythmSchedule('每周一次', NOW), { enabled: true, time: '08:30', every: 'week', days: [2] }, 'once a week, not Monday: the day it was made');
  assert.deepEqual(rhythmSchedule('每周二、周五各更新一次；看到财报不可依赖……', NOW), { enabled: true, time: '08:30', every: 'week', days: [2, 5] });
  assert.deepEqual(rhythmSchedule('每天看一次。这几个日子不能漏：每月1日各家公布上月交付', NOW), { enabled: true, time: '08:30' }, 'every day, though 每月 comes later');
  assert.deepEqual(rhythmSchedule('每个工作日更新，有重要进展才入库', NOW), { enabled: true, time: '08:30', every: 'weekdays' });
  assert.deepEqual(rhythmSchedule('每月 15 号看一次', NOW), { enabled: true, time: '08:30', every: 'month', day: 15 });
  assert.deepEqual(rhythmSchedule('weekly on Friday', NOW), { enabled: true, time: '08:30', every: 'week', days: [5] });
  assert.deepEqual(rhythmSchedule('', NOW), { enabled: true, time: '08:30' }, 'nothing said: every day');
  // the four cards W4's simulated customers confirmed
  assert.deepEqual([1, 2, 3, 5].map((n) => rhythmSchedule(card(n).definition.rhythm, NOW)), [
    { enabled: true, time: '08:30', every: 'week', days: [2, 5] },
    { enabled: true, time: '08:30', every: 'week', days: [2] },
    { enabled: true, time: '08:30' },
    { enabled: true, time: '08:30' },
  ]);
});

test('A10: an old schedule (no how-often) is every day, exactly as before; bad ones are refused and nothing is written', () => {
  assert.deepEqual(scheduleOf({ enabled: true, time: '07:00' }), { enabled: true, time: '07:00' });
  for (const bad of [
    { enabled: true, time: '08:30', every: 'week', days: [9] },
    { enabled: true, time: '08:30', every: 'week', days: [] },
    { enabled: true, time: '08:30', every: 'week', day: 2 },
    { enabled: true, time: '08:30', every: 'month', day: 31 },
    { enabled: true, time: '08:30', every: 'fortnight' },
    { enabled: true, time: '08:30', day: 3 },
  ]) assert.equal(isSchedule(bad), false, JSON.stringify(bad));
  const dir = join(caseDir('v111-sch-save'), 'lib');
  createLibrary(dir, { name: '测试库', language: 'zh-CN' });
  saveLibrarySchedule(dir, { enabled: true, time: '08:30', every: 'week', days: [5, 2] });
  assert.deepEqual(readLibrarySchedule(dir).schedule, { enabled: true, time: '08:30', every: 'week', days: [2, 5] });
  const before = readFileSync(join(dir, 'streams.json'), 'utf8');
  assert.throws(() => saveLibrarySchedule(dir, { enabled: true, time: '08:30', every: 'month', day: 31 }), (e) => e.code === 'bad-argument');
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), before, 'nothing written');
});

test('A10: confirming a card makes the library with the schedule its rhythm says (a weekly card is not run every day)', async () => {
  const root = caseDir('v111-sch-create');
  const h = cardHandlers({ libraryDirFor: (c) => join(root, c.name) });
  for (const [n, want] of [[2, { every: 'week' }], [3, {}]]) {
    const c = card(n);
    const r = await h.create_library({ card: c }, { now: () => NOW });
    const s = readLibrarySchedule(r.object.id).schedule;
    assert.equal(s.every, want.every, `card ${n}: ${JSON.stringify(s)}`);
    assert.equal(slotsIn7Days(s), want.every === 'week' ? 1 : 7, `card ${n} runs as often as it says`);
  }
});
