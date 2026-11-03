import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendVerdict, readVerdicts, recentVerdictFailures, verdictsPath, VERDICTS_FILE } from '../src/verify/verdicts.mjs';
import { caseDir } from './support/tmp.mjs';

const ITEMS = [
  { id: 'what-nonempty', kind: 'rule', passed: true, evidence: 'what is non-empty', claimed: true },
  { id: 'numbers-in-source', kind: 'judge', passed: false, evidence: '5000 是目标', claimed: false },
];

function text(dir) {
  return readFileSync(verdictsPath(dir), 'utf8');
}

test('appendVerdict: one line per item with the documented fields, file created under _pipeline', () => {
  const dir = caseDir('verdicts-append');
  assert.equal(VERDICTS_FILE, '_pipeline/verdicts.jsonl');
  assert.equal(existsSync(verdictsPath(dir)), false);
  const written = appendVerdict(dir, { node: 'summary', url: 'https://u/1', round: 1, items: ITEMS, ts: '2026-11-03T10:00:00.000Z' });
  assert.equal(written.length, 2);
  const lines = text(dir).split('\n');
  assert.equal(lines.length, 3, 'two lines plus the trailing newline');
  assert.equal(lines[2], '');
  assert.deepEqual(JSON.parse(lines[0]), {
    ts: '2026-11-03T10:00:00.000Z', node: 'summary', url: 'https://u/1', item: 'what-nonempty', kind: 'rule',
    passed: true, evidence: 'what is non-empty', round: 1, claimed: true,
  });
  assert.deepEqual(JSON.parse(lines[1]), {
    ts: '2026-11-03T10:00:00.000Z', node: 'summary', url: 'https://u/1', item: 'numbers-in-source', kind: 'judge',
    passed: false, evidence: '5000 是目标', round: 1, claimed: false,
  });
  assert.ok(lines[0].startsWith('{"ts":"'));
  // without ts the stamp is now-ish ISO
  const auto = appendVerdict(dir, { node: 'summary', url: 'https://u/1', round: 2, items: [ITEMS[0]] });
  assert.match(auto[0].ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(readVerdicts(dir).length, 3);
});

test('appendVerdict: a file whose last line lost its newline does not get a glued line', () => {
  const dir = caseDir('verdicts-no-newline');
  mkdirSync(join(dir, '_pipeline'), { recursive: true });
  const first = JSON.stringify({ ts: '2026-11-03T09:00:00.000Z', node: 'summary', url: 'https://u/0', item: 'x', kind: 'rule', passed: true, evidence: '', round: 1, claimed: false });
  writeFileSync(verdictsPath(dir), first, 'utf8'); // no trailing newline
  appendVerdict(dir, { node: 'summary', url: 'https://u/1', round: 1, items: [ITEMS[1]], ts: '2026-11-03T10:00:00.000Z' });
  const t = text(dir);
  assert.ok(t.startsWith(first + '\n{'), 'a newline was inserted before the new line');
  assert.equal(t.split('\n').filter(Boolean).length, 2);
  const read = readVerdicts(dir);
  assert.equal(read.length, 2, 'both lines parse');
  assert.equal(read[0].url, 'https://u/0');
  assert.equal(read[1].url, 'https://u/1');
  // sentinel: the naive append would have produced one unparseable line
  const naive = first + JSON.stringify({ node: 'summary', item: 'y' });
  assert.throws(() => JSON.parse(naive));
});

test('appendVerdict refuses malformed input and writes nothing; empty items writes nothing', () => {
  const dir = caseDir('verdicts-refuse');
  const bad = [
    [{ url: 'https://u/1', round: 1, items: ITEMS }, /missing "node"/],
    [{ node: 'summary', round: 1, items: ITEMS }, /missing "url"/],
    [{ node: 'summary', url: 'https://u/1', round: 1, items: 'x' }, /must be an array/],
    [{ node: 'summary', url: 'https://u/1', round: 1, items: [{ passed: true }] }, /missing "id"/],
    [undefined, /missing "node"/],
  ];
  for (const [arg, re] of bad) {
    assert.throws(() => appendVerdict(dir, arg), (e) => e.code === 'bad-verdict' && re.test(e.message), JSON.stringify(arg));
  }
  assert.deepEqual(appendVerdict(dir, { node: 'summary', url: 'https://u/1', round: 1, items: [] }), []);
  assert.equal(existsSync(verdictsPath(dir)), false);
  assert.deepEqual(readVerdicts(dir), [], 'no file reads as empty');
});

test('readVerdicts skips malformed lines and keeps the good ones in file order', () => {
  const dir = caseDir('verdicts-read');
  appendVerdict(dir, { node: 'summary', url: 'https://u/1', round: 1, items: ITEMS, ts: '2026-11-03T10:00:00.000Z' });
  appendFileSync(verdictsPath(dir), '{not json\n\n[1,2]\n{"node":"summary"}\n"str"\n', 'utf8');
  appendVerdict(dir, { node: 'relevance', url: 'https://u/2', round: 1, items: [ITEMS[0]], ts: '2026-11-03T11:00:00.000Z' });
  const read = readVerdicts(dir);
  assert.deepEqual(read.map((v) => [v.node, v.item]), [['summary', 'what-nonempty'], ['summary', 'numbers-in-source'], ['relevance', 'what-nonempty']]);
  assert.notEqual(read.length, 7, 'junk lines did not sneak in');
});

test('recentVerdictFailures: only that node, only failures, newest first, capped at n', () => {
  const dir = caseDir('verdicts-recent');
  const fail = (id, evidence) => ({ id, kind: 'judge', passed: false, evidence, claimed: false });
  const ok = (id) => ({ id, kind: 'rule', passed: true, evidence: 'fine', claimed: true });
  appendVerdict(dir, { node: 'summary', url: 'https://u/1', round: 1, items: [ok('a'), fail('n', 'e1')], ts: '2026-11-03T10:00:00.000Z' });
  appendVerdict(dir, { node: 'relevance', url: 'https://u/9', round: 1, items: [fail('range-relevance', 'other node')], ts: '2026-11-03T12:00:00.000Z' });
  appendVerdict(dir, { node: 'summary', url: 'https://u/2', round: 1, items: [fail('n', 'e2'), fail('q', 'e3')], ts: '2026-11-03T11:00:00.000Z' });
  appendVerdict(dir, { node: 'summary', url: 'https://u/3', round: 2, items: [ok('n')], ts: '2026-11-03T13:00:00.000Z' });
  appendVerdict(dir, { node: 'summary', url: 'https://u/4', round: 1, items: [fail('n', 'e4')], ts: '2026-11-03T09:00:00.000Z' });

  const all = recentVerdictFailures(dir, 'summary', 10);
  assert.deepEqual(all, [
    { ts: '2026-11-03T11:00:00.000Z', url: 'https://u/2', item: 'q', evidence: 'e3', round: 1 },
    { ts: '2026-11-03T11:00:00.000Z', url: 'https://u/2', item: 'n', evidence: 'e2', round: 1 },
    { ts: '2026-11-03T10:00:00.000Z', url: 'https://u/1', item: 'n', evidence: 'e1', round: 1 },
    { ts: '2026-11-03T09:00:00.000Z', url: 'https://u/4', item: 'n', evidence: 'e4', round: 1 },
  ]);
  assert.equal(all.some((v) => v.url === 'https://u/9'), false, 'other node excluded');
  assert.equal(all.some((v) => v.url === 'https://u/3'), false, 'passed verdicts excluded');
  assert.deepEqual(recentVerdictFailures(dir, 'summary', 2).map((v) => v.evidence), ['e3', 'e2']);
  assert.deepEqual(recentVerdictFailures(dir, 'relevance').map((v) => v.evidence), ['other node']);
  assert.deepEqual(recentVerdictFailures(dir, 'substance'), []);
  assert.deepEqual(recentVerdictFailures(dir, 'summary', 0), []);
  assert.deepEqual(recentVerdictFailures(caseDir('verdicts-recent-empty'), 'summary'), []);
  assert.notDeepEqual(all.map((v) => v.ts), [...all.map((v) => v.ts)].sort(), 'sentinel: the order is not ascending');
});
