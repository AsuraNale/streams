// 1.1 W6a, the core's side of the interface: what 待看 shows of an item's original (A3), what 来源与要求 shows of a card's sources
// (A5), and a source added or removed by the user — held until 确认 (B3). Each test was written against inputs that should fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  createLibrary, writeCard, readCard, checkCard, listInbox, putInInbox, saveOriginal, originalId, openingOf, OPENING_CHARS,
  sourceRows, sourceHandlers, createActionRunner, loadDefinition, writeUpdateState,
} from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const CARD = () => ({
  name: '测试库',
  definition: { summary: 's', purpose: 'p', scope: '对象：x；行业：x；地域：x；规模：x', exclude: 'e', trust: 't', rhythm: '每天', language: '中文', hard: 'h' },
  decide: [], collect: ['c'], skip: ['k'],
  sources: [
    { name: '网页', url: 'https://a.test/list', status: 'ok' },
    { name: '报告', url: 'https://b.test/reports', status: 'ok' },
    { name: '要登录的', url: 'https://c.test/news', status: 'ok' },
    { name: '检索词', query: 'solid-state battery', status: 'ok' },
    { name: '新加的', url: 'https://d.test/', status: 'ok' },
  ],
  unreadable: [{ name: '协会', url: 'https://e.test/', reason: '要登录' }],
  pick: ['p'], write: ['w'], samples: [{ title: 't', url: 'https://a.test/1', date: '2026-11-20' }],
});

function library(name) {
  const dir = join(caseDir(name), 'lib');
  createLibrary(dir, { name: '测试库', language: 'zh-CN' });
  writeCard(dir, CARD());
  return dir;
}

test('A3: an item with a kept original carries its opening (about 120 characters), when and how it was read; one without carries none', () => {
  const dir = library('w6a-opening');
  const long = '第一段的开头。'.repeat(40);
  const url = 'https://a.test/1';
  saveOriginal(dir, { url, title: 't', text: long, method: 'render', fetchedAt: '2026-11-21T14:02:00.000Z' });
  putInInbox(dir, { item: { url, title: 't', source: 'a' }, checked: { status: 'checked', summary: { what: 'w', points: ['a', 'b', 'c'], quote: '', anchors: [] }, verification: { passed: true, rounds: 1, failed: [] }, original: { id: originalId(url), saved: true }, history: [] } });
  const [card] = listInbox(dir);
  assert.equal(OPENING_CHARS, 120);
  assert.equal([...card.opening].length, OPENING_CHARS + 2, 'cut, with ……');
  assert.ok(card.opening.endsWith('……') && long.startsWith(card.opening.slice(0, -2)));
  assert.deepEqual([card.originalAt, card.originalMethod], ['2026-11-21T14:02:00.000Z', 'render']);
  assert.equal(openingOf('  短 \n 的。 '), '短 的。', 'short: whole, whitespace run together');
});

test('a card source is a web address or a search word; neither, or both, is not a source', () => {
  assert.equal(checkCard(CARD()).ok, true);
  const neither = CARD(); neither.sources[0] = { name: 'x', status: 'ok' };
  assert.ok(checkCard(neither).problems.some((p) => p.code === 'bad-entry' && p.part === 'sources'));
  const both = CARD(); both.sources[0] = { name: 'x', url: 'https://a.test/', query: 'q', status: 'ok' };
  assert.ok(checkCard(both).problems.some((p) => p.code === 'bad-entry'), 'a search word with an address: not one or the other');
});

test('A5: the 「原文」 of each source — read, PDF only, only links, a search word, not read yet; the unreadable ones too', () => {
  const dir = library('w6a-rows');
  writeUpdateState(dir, {
    sources: {
      'https://a.test/list': { ok: true, seen: [], pages: { read: 3, pdf: 1, missing: 1 } },
      'https://b.test/reports': { ok: true, seen: [], pages: { read: 0, pdf: 2, missing: 0 } },
      'https://c.test/news': { ok: false, reason: 'login', seen: [] },
    },
    unfinished: [], carry: [], lastAgentAt: null, used: {},
  });
  const rows = sourceRows(dir);
  assert.deepEqual(rows.map((r) => [r.name, r.state, r.original]), [
    ['网页', 'ok', 'read'], ['报告', 'ok', 'pdf'], ['要登录的', 'login', 'link'], ['检索词', 'search', 'search'], ['新加的', 'never', 'unknown'], ['协会', 'blocked', 'link'],
  ]);
  assert.equal(rows[3].query, 'solid-state battery');
  assert.equal(rows[3].url, null);
  assert.deepEqual(sourceRows(join(caseDir('w6a-no-card'), 'x')), [], 'no card, no rows');
});

const hashOf = (dir) => {
  const h = createHash('sha256');
  const walk = (d) => { for (const n of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = join(d, n.name); if (n.isDirectory()) walk(p); else h.update(`${n.name}:${createHash('sha256').update(readFileSync(p)).digest('hex')}`); } };
  walk(dir);
  return h.digest('hex');
};

test('B3: a source the user adds waits for 确认; then the card has it (a new version in its history); a search word too; removing too', async () => {
  const dir = library('w6a-add');
  const runner = createActionRunner({ definition: loadDefinition(), handlers: sourceHandlers({ dirOfLibrary: () => dir }), pendingDir: join(dir, '..', 'pending'), logFile: () => join(dir, '_actions.jsonl') });
  const before = hashOf(dir);
  const r = await runner.request('user', { action: 'add_source', params: { library: 'l', source: { name: '新闻', url: 'https://f.test/news' } } });
  assert.equal(r.status, 'pending');
  assert.equal(hashOf(dir), before, 'nothing written before 确认');
  const done = await runner.confirm(r.pending.id);
  assert.equal(done.status, 'done', JSON.stringify(done));
  assert.deepEqual(readCard(dir).sources.at(-1), { name: '新闻', url: 'https://f.test/news', status: '你加的' });
  assert.equal(readdirSync(join(dir, '_card', 'history')).length, 2);
  assert.equal(checkCard(readCard(dir)).ok, true);
  const q = await runner.request('user', { action: 'add_source', params: { library: 'l', source: { name: '固态电池', query: '固态电池 装车' } } });
  await runner.confirm(q.pending.id);
  assert.equal(readCard(dir).sources.at(-1).query, '固态电池 装车');
  const again = await runner.request('user', { action: 'add_source', params: { library: 'l', source: { name: '又一次', url: 'https://www.f.test/news/' } } });
  assert.equal((await runner.confirm(again.pending.id)).status, 'failed', 'the same address again is refused');
  const rm = await runner.request('user', { action: 'remove_source', params: { library: 'l', source: 'https://f.test/news' } });
  await runner.confirm(rm.pending.id);
  assert.equal(readCard(dir).sources.some((s) => s.url === 'https://f.test/news'), false);
  assert.ok(existsSync(join(dir, '_actions.jsonl')));
});
