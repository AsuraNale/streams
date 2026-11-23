// 1.1 W7b: v1.0's feed fetchers left core/src for core/legacy/ (not shipped); still tested, since the fixtures of libraries
// 'as 1.0 made them' run them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addManual, MANUAL_SOURCE } from '../legacy/fetch/manual.mjs';
import { appendEvent, replayLedger, ledgerPath } from '../src/library/ledger.mjs';
import { makeLibrary } from './support/fixtures.mjs';

const CLOCK = new Date(2026, 10, 2, 12, 0, 0);
const opts = { now: () => CLOCK };

function ledgerLines(dir) {
  return readFileSync(ledgerPath(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// 对照 test_pipeline.py::test_manual_add："lands in Bronze tagged manual"、"manual row is ordinary unjudged"、
// "re-adding the same url is deduped by the ledger"、"non-http url refused"
test('addManual: one seen event with source manual, today as the date, topic kept; it is an ordinary seen item', () => {
  const dir = makeLibrary('manual-add');
  const r = addManual(dir, { url: 'https://example.com/found-by-hand', title: 'Found by hand', topic: 'agent 记忆' }, opts);
  assert.deepEqual(r, { added: true, url: 'https://example.com/found-by-hand' });
  const [e] = ledgerLines(dir);
  assert.equal(e.ev, 'seen');
  assert.equal(e.source, MANUAL_SOURCE);
  assert.equal(e.source, 'manual');
  assert.equal(e.title, 'Found by hand');
  assert.equal(e.topic, 'agent 记忆');
  assert.equal(e.date, '2026-11-02');
  const s = replayLedger(dir).states.get('https://example.com/found-by-hand');
  assert.equal(s.stage, 'seen', 'manual items wait for judgement like any other');
  assert.equal(s.source, 'manual');
  // re-add: deduped by the ledger, byte for byte
  const bytes = readFileSync(ledgerPath(dir));
  assert.deepEqual(addManual(dir, { url: 'https://example.com/found-by-hand', title: 'Found again' }, opts), { added: false, url: 'https://example.com/found-by-hand' });
  assert.deepEqual(readFileSync(ledgerPath(dir)), bytes);
  assert.equal(replayLedger(dir).states.get('https://example.com/found-by-hand').title, 'Found by hand');
});

test('addManual: title / topic optional, a given date is normalized, an unusable date falls back to today', () => {
  const dir = makeLibrary('manual-optional');
  addManual(dir, { url: 'https://example.com/no-title' }, opts);
  addManual(dir, { url: 'https://example.com/dated', title: 't', date: 'Thu, 02 Jul 2026 08:00:00 GMT' }, opts);
  addManual(dir, { url: 'https://example.com/bad-date', title: 't2', date: 'last week' }, opts);
  addManual(dir, { url: 'https://example.com/blank', title: '   ', topic: '' }, opts);
  const [a, b, c, d] = ledgerLines(dir);
  assert.equal('title' in a, false);
  assert.equal('topic' in a, false);
  assert.equal(a.source, 'manual');
  assert.equal(b.date, '2026-07-02');
  assert.equal(c.date, '2026-11-02');
  assert.equal('title' in d, false, 'blank title is no title');
  assert.equal('topic' in d, false);
  // url is normalized by the URL parser (trailing spaces trimmed, host lower-cased); the returned url is what was written
  const r = addManual(dir, { url: '  HTTPS://Example.com/Path?q=1  ' }, opts);
  assert.equal(r.url, 'https://example.com/Path?q=1');
  assert.equal(ledgerLines(dir).at(-1).url, 'https://example.com/Path?q=1');
});

test('addManual: layer-2 hint when the title matches a known one (normalized), registered anyway', () => {
  const dir = makeLibrary('manual-dup');
  appendEvent(dir, { ev: 'seen', url: 'https://u/1', source: 'feed-a', title: 'Alpha story' });
  const r = addManual(dir, { url: 'https://mirror/1', title: 'ALPHA  story!' }, opts);
  assert.deepEqual(r, { added: true, url: 'https://mirror/1', maybeDuplicateOf: 'https://u/1' });
  assert.equal(ledgerLines(dir).at(-1).maybe_duplicate_of, 'https://u/1');
  assert.equal(replayLedger(dir).states.get('https://mirror/1').maybeDuplicateOf, 'https://u/1');
  const other = addManual(dir, { url: 'https://mirror/2', title: 'Beta story' }, opts);
  assert.equal('maybeDuplicateOf' in other, false);
  assert.equal('maybe_duplicate_of' in ledgerLines(dir).at(-1), false);
});

test('sentinel: non-http(s) and malformed urls are refused with bad-url and nothing is written', () => {
  const dir = makeLibrary('manual-refuse');
  const before = readFileSync(ledgerPath(dir), 'utf8');
  for (const url of ['notaurl', 'ftp://x/y', 'javascript:alert(1)', 'file:///C:/secret.txt', 'mailto:a@b', '', '   ', undefined, null, 42, 'http://']) {
    assert.throws(() => addManual(dir, { url, title: 'x' }, opts), (e) => e.code === 'bad-url', JSON.stringify(url));
  }
  assert.throws(() => addManual(dir, undefined, opts), (e) => e.code === 'bad-url' || e.code === 'bad-argument');
  assert.throws(() => addManual(dir, 'https://a/b', opts), (e) => e.code === 'bad-argument');
  assert.throws(() => addManual('', { url: 'https://a/b' }, opts), (e) => e.code === 'bad-argument');
  assert.equal(readFileSync(ledgerPath(dir), 'utf8'), before);
  assert.equal(replayLedger(dir).states.size, 0);
});
