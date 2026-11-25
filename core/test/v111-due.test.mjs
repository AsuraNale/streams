// 1.1.1 P8 「快到期」 (docs/checks/2026-11-24-1.1.1/p8/scorecard.json; acceptance A12, B23):
//   due-in-note  收藏 an item with a deadline: the note's header has `due` (YYYY-MM-DD); an item without one: no `due`, the
//                header otherwise the same; writeNoteFile stays the only writer of notes/ (a keep goes through it)
//   due-list     the items whose deadline is today or within 30 days — in 待看 and kept — nearest first, with the days left;
//                a deadline yesterday, a dismissed item, one 31 days away are not listed; nothing handed in by an update
//                for a whole day (the clock moved on, no new item): the item is listed all the same
//   due-notify   7 days before and 1 day before: one notice each; the same day twice: once; a kept item too; a dismissed
//                one never; first seen at 1 day: the 1-day notice only; a deadline that changed starts over
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keep, dismiss } from '../src/pipeline/decide.mjs';
import { putInInbox } from '../src/update/inbox.mjs';
import { parseDue, daysUntil, dueSoon, dueNotices, markDueNotices, DUE_NOTICES_FILE } from '../src/pipeline/due.mjs';
import { parseFrontmatter } from '../src/library/frontmatter.mjs';
import { notesDir } from '../src/library/scan.mjs';
import { makeLibrary } from './support/fixtures.mjs';

// noon UTC: the same calendar day west and east of Greenwich
const at = (day) => () => new Date(`${day}T16:00:00.000Z`);
const TODAY = at('2026-11-24');

function checked(what) {
  return { status: 'checked', summary: { what, points: [] }, verification: { passed: true, rounds: 1, failed: [] }, original: { saved: false, method: 'direct' }, history: [] };
}
function inboxItem(dir, { url, title, due }) {
  putInInbox(dir, { item: { url, title, source: 'example', date: '2026-11-20', ...(due !== undefined ? { due } : {}) }, checked: checked(title), now: TODAY });
}
const headerOf = (dir, id) => parseFrontmatter(readFileSync(join(notesDir(dir), `${id}.md`), 'utf8')).meta;

test('parseDue: the ways an agent writes a deadline; the end of a period; none', () => {
  assert.equal(parseDue('2026-12-03'), '2026-12-03');
  assert.equal(parseDue('截止 2026/12/3 17:00（美东时间）'), '2026-12-03');
  assert.equal(parseDue('2026年12月3日'), '2026-12-03');
  assert.equal(parseDue('December 3, 2026'), '2026-12-03');
  assert.equal(parseDue('Dec. 3rd, 2026'), '2026-12-03');
  assert.equal(parseDue('3 December 2026'), '2026-12-03');
  assert.equal(parseDue('申请期 2026-11-01 至 2026-12-03'), '2026-12-03');
  assert.equal(parseDue('2026-02-30'), null);
  assert.equal(parseDue('滚动申请，没有截止日'), null);
  assert.equal(parseDue(''), null);
  assert.equal(daysUntil('2026-11-24', TODAY()), 0);
  assert.equal(daysUntil('2026-11-25', TODAY()), 1);
  assert.equal(daysUntil('2026-11-23', TODAY()), -1);
  assert.equal(daysUntil('2026-12-24', TODAY()), 30);
});

test('due-in-note: 收藏 writes the deadline into the note; an item without one keeps the header it had', () => {
  const dir = makeLibrary('v111-due-note');
  inboxItem(dir, { url: 'https://example.org/grant', title: '补助申请截止', due: 'December 3, 2026' });
  inboxItem(dir, { url: 'https://example.org/plain', title: '一条没有到期日的' });
  const a = keep(dir, 'https://example.org/grant', { now: TODAY });
  const b = keep(dir, 'https://example.org/plain', { now: TODAY });
  const ha = headerOf(dir, a.id);
  const hb = headerOf(dir, b.id);
  assert.equal(ha.due, '2026-12-03');
  assert.equal(Object.hasOwn(hb, 'due'), false);
  const { due, ...rest } = ha;
  assert.deepEqual(Object.keys(rest), Object.keys(hb));
  // a deadline Streams cannot read as a date goes in as written (nothing lost; it is never listed)
  inboxItem(dir, { url: 'https://example.org/rolling', title: '滚动申请', due: '滚动申请' });
  const c = keep(dir, 'https://example.org/rolling', { now: TODAY });
  assert.equal(headerOf(dir, c.id).due, '滚动申请');
});

function sample(name) {
  const dir = makeLibrary(name);
  inboxItem(dir, { url: 'https://example.org/in-30', title: '30 天后到期', due: '2026-12-24' });
  inboxItem(dir, { url: 'https://example.org/in-31', title: '31 天后到期', due: '2026-12-25' });
  inboxItem(dir, { url: 'https://example.org/today', title: '今天到期', due: '2026-11-24' });
  inboxItem(dir, { url: 'https://example.org/yesterday', title: '昨天到期', due: '2026-11-23' });
  inboxItem(dir, { url: 'https://example.org/dismissed', title: '放弃的', due: '2026-11-30' });
  inboxItem(dir, { url: 'https://example.org/kept', title: '收藏的', due: '2026-12-03' });
  inboxItem(dir, { url: 'https://example.org/in-3', title: '3 天后到期', due: '2026年11月27日' });
  inboxItem(dir, { url: 'https://example.org/none', title: '没有到期日' });
  dismiss(dir, 'https://example.org/dismissed', undefined, { now: TODAY });
  keep(dir, 'https://example.org/kept', { now: TODAY });
  return dir;
}

test('due-list: within 30 days, in 待看 and kept, nearest first; not yesterday, not dismissed, not 31 days away', () => {
  const dir = sample('v111-due-list');
  const list = dueSoon(dir, { now: TODAY });
  assert.deepEqual(list.map((i) => [i.title, i.days, i.where]), [
    ['今天到期', 0, 'inbox'],
    ['3 天后到期', 3, 'inbox'],
    ['收藏的', 9, 'kept'],
    ['30 天后到期', 30, 'inbox'],
  ]);
  assert.equal(list.find((i) => i.where === 'kept').due, '2026-12-03');
  assert.match(list.find((i) => i.where === 'kept').id, /^2026-11-20-/);
  // the dismissal still undoable (the page holds it): not listed either
  assert.deepEqual(dueSoon(dir, { now: TODAY, hidden: ['https://example.org/in-3'] }).map((i) => i.title), ['今天到期', '收藏的', '30 天后到期']);
});

test('due-list: an update hands in nothing for a whole day — the kept item 9 days away is listed the next day all the same', () => {
  const dir = sample('v111-due-quiet');
  // the next day: no update ran, nothing new; 今天到期 is now yesterday's and goes
  const next = dueSoon(dir, { now: at('2026-11-25') });
  assert.deepEqual(next.map((i) => [i.title, i.days]), [['3 天后到期', 2], ['收藏的', 8], ['30 天后到期', 29], ['31 天后到期', 30]]);
  // the day after its deadline: gone
  assert.equal(dueSoon(dir, { now: at('2026-12-04') }).some((i) => i.title === '收藏的'), false);
  assert.equal(dueSoon(dir, { now: at('2026-12-03') }).find((i) => i.title === '收藏的').days, 0);
});

test('due-notify: 7 days and 1 day before, once each; the same day twice once; kept too; dismissed never', () => {
  const dir = makeLibrary('v111-due-notify');
  inboxItem(dir, { url: 'https://example.org/grant', title: '补助申请截止', due: '2026-12-03' });
  inboxItem(dir, { url: 'https://example.org/dismissed', title: '放弃的', due: '2026-12-03' });
  dismiss(dir, 'https://example.org/dismissed', undefined, { now: TODAY });
  const step = (day) => {
    const n = dueNotices(dir, { now: at(day) });
    markDueNotices(dir, n, { now: at(day) });
    return n.map((x) => [x.title, x.notice, x.days]);
  };
  assert.deepEqual(step('2026-11-24'), [], '9 days before: nothing yet');
  assert.deepEqual(step('2026-11-26'), [['补助申请截止', 7, 7]]);
  assert.deepEqual(step('2026-11-26'), [], 'the app opened again the same day');
  // kept after its 7-day notice: no second 7-day notice
  keep(dir, 'https://example.org/grant', { now: at('2026-11-27') });
  assert.deepEqual(step('2026-11-27'), []);
  assert.deepEqual(step('2026-11-30'), []);
  assert.deepEqual(step('2026-12-02'), [['补助申请截止', 1, 1]]);
  assert.deepEqual(step('2026-12-02'), []);
  assert.deepEqual(step('2026-12-03'), []);
  assert.ok(existsSync(join(dir, DUE_NOTICES_FILE)));
  const rec = JSON.parse(readFileSync(join(dir, DUE_NOTICES_FILE), 'utf8'));
  assert.deepEqual(rec['https://example.org/grant'], { due: '2026-12-03', 7: '2026-11-26', 1: '2026-12-02' });
  assert.equal(Object.hasOwn(rec, 'https://example.org/dismissed'), false);
});

test('due-notify: first seen 1 day before — the 1-day notice only; a deadline moved — it starts over', () => {
  const dir = makeLibrary('v111-due-late');
  inboxItem(dir, { url: 'https://example.org/late', title: '明天截止', due: '2026-11-25' });
  const n = dueNotices(dir, { now: TODAY });
  assert.deepEqual(n.map((x) => [x.notice, x.days]), [[1, 1]]);
  markDueNotices(dir, n, { now: TODAY });
  assert.deepEqual(dueNotices(dir, { now: TODAY }), []);
  assert.deepEqual(dueNotices(dir, { now: at('2026-11-25') }), []);
  // the update agent handed the item in again with a later deadline (延期: a new development, sop/update.md)
  putInInbox(dir, { item: { url: 'https://example.org/late', title: '明天截止', source: 'example', date: '2026-11-20', due: '2026-12-01' }, checked: checked('延期'), now: at('2026-11-25') });
  assert.deepEqual(dueNotices(dir, { now: at('2026-11-25') }).map((x) => [x.notice, x.days, x.due]), [[7, 6, '2026-12-01']]);
});

test('sop-words: the update SOP leaves reminding to Streams and counts a moved deadline as news; the build SOP says who reminds', () => {
  const sop = (f) => readFileSync(new URL(`../src/sop/${f}`, import.meta.url), 'utf8');
  const update = sop('update.md');
  assert.match(update, /到期日（截止日期之类）由流息记着、到期前由流息提醒用户，不为提醒再交库里已有的条目/);
  assert.match(update, /同一件事的到期日变了（延期、提前）算新进展/);
  const build = sop('build.md');
  assert.match(build, /节奏里有不能错过的日期（截止、申请期这一类）时，在节奏那一行写明：到期提醒由流息按每条的到期日做/);
});
