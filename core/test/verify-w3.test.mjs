// 1.1 W3 (核验): a summary is checked against the original kept in the library folder (_originals/<id>.md, W2), not
// against what the model hands back. Each point carries one sentence of the original; that sentence must be in the original
// word for word (only spacing, full-width / half-width and curly / straight quotes may differ), and every number of the summary
// must be in the original too. A point that passes gets its place in the original (start, end, paragraph) for the reading
// window (A4, W6). Two rounds that fail leave the item in 待看 marked 未通过核验 (B14). No original, no summary (B6).
// Each test was written against inputs that should fail it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkRule, checkSummary, originalChecklist, locateQuote, numbersIn, missingNumbers, QUOTE_MIN_CHARS,
  putInInbox, listInbox, saveOriginal, readOriginal, originalId, ORIGINAL_MISSING, verdictsFor,
  baselineDescription, describeChecklist, replayLedger,
} from '../src/index.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { caseDir } from './support/tmp.mjs';

const URL = 'https://example.test/byd-october';
const TITLE = '比亚迪 2026 年 10 月产销快报';
const P1 = '比亚迪 10 月新能源汽车销量为 50.2 万辆，同比增长 12%。';
const P2 = '其中海外销量 1.2 万辆，占比约 2.4%。公司表示，第四季度的目标是“月销 55 万辆”。';
const P3 = 'Revenue rose by 1,200 million yuan in the quarter, and the board expects 3.5 percent growth next year.';
const TEXT = [P1, P2, P3].join('\n\n');

const Q1 = P1;
const Q2 = '其中海外销量 1.2 万辆，占比约 2.4%。';
const Q3 = 'Revenue rose by 1,200 million yuan in the quarter';
const GOOD = () => ({
  what: '比亚迪 10 月新能源汽车销量 50.2 万辆，同比增长 12%。',
  points: [
    { text: '10 月销量 50.2 万辆，同比增长 12%', quote: Q1 },
    { text: '海外销量 1.2 万辆，约占 2.4%', quote: Q2 },
    { text: '季度收入增加 1200 million yuan，预计明年增长 3.5%', quote: Q3 },
  ],
});

function library(name, { text = TEXT, title = TITLE, url = URL } = {}) {
  const lib = caseDir(name);
  saveOriginal(lib, { url, title, text, method: 'direct', fetchedAt: '2026-11-20T15:00:00.000Z' });
  return lib;
}

// the judge: every item it is asked about passes, and it remembers each prompt it was given
const judgeAllPass = () => fakeConnector({
  mode: 'counting',
  json: (req) => ({ items: [...req.prompt.matchAll(/^\[([\w-]+)\]/gm)].map((m) => ({ id: m[1], passed: true, evidence: 'ok' })) }),
});

// produce: hands back the given outputs one per round, and remembers the feedback each round got
function producer(...outputs) {
  const seen = [];
  const produce = async (feedback, prior) => {
    seen.push({ feedback, prior });
    const out = outputs[Math.min(seen.length - 1, outputs.length - 1)];
    return { output: typeof out === 'function' ? out() : out, claimed: [], calls: 1 };
  };
  return { produce, seen };
}

const withPoint = (i, patch) => () => { const s = GOOD(); s.points[i] = { ...s.points[i], ...patch }; return s; };
const failedIds = (r) => r.verification.failed.map((f) => f.id);

// ---------- quotes ----------

test('quotes: a made-up sentence is sent back, the reason names the point; the same summary with the real sentence passes', async () => {
  const lib = library('w3-quote-made-up');
  const fake = withPoint(1, { quote: '公司海外销量创下历史新高，远超市场预期。' });
  const one = await checkSummary({ libraryDir: lib, url: URL, produce: producer(fake, fake).produce, connector: judgeAllPass() });
  assert.equal(one.status, 'checked');
  assert.equal(one.passed, false);
  assert.ok(failedIds(one).includes('point-quotes'), JSON.stringify(one.verification.failed));
  const ev = one.verification.failed.find((f) => f.id === 'point-quotes').evidence;
  assert.match(ev, /point 2/);
  assert.doesNotMatch(ev, /point 1|point 3/);
  // control: the real sentence passes
  const ok = await checkSummary({ libraryDir: lib, url: URL, produce: producer(GOOD).produce, connector: judgeAllPass() });
  assert.equal(ok.passed, true, JSON.stringify(ok.verification.failed));
});

test('quotes: spacing, full-width characters and curly quotes may differ; a changed word may not', () => {
  const original = { text: TEXT, title: TITLE };
  const spaced = { points: [{ text: 'x', quote: '比亚迪10月新能源汽车销量为50.2万辆,同比增长１２％。' }] };
  assert.equal(checkRule('points_quoted:points', spaced, { original }).passed, true, 'spacing and full-width');
  const curly = { points: [{ text: 'x', quote: '公司表示，第四季度的目标是"月销 55 万辆"。' }] };
  assert.equal(checkRule('points_quoted:points', curly, { original }).passed, true, 'straight quotes for curly ones');
  const changed = { points: [{ text: 'x', quote: '比亚迪 10 月新能源汽车销量为 52.0 万辆，同比增长 12%。' }] };
  assert.equal(checkRule('points_quoted:points', changed, { original }).passed, false, 'a changed number in the sentence');
  const reworded = { points: [{ text: 'x', quote: '比亚迪 10 月新能源车销量为 50.2 万辆，同比增长 12%。' }] };
  assert.equal(checkRule('points_quoted:points', reworded, { original }).passed, false, 'one word left out');
});

test(`quotes: a sentence shorter than ${QUOTE_MIN_CHARS} characters does not count; a point with no sentence fails`, () => {
  const original = { text: TEXT, title: TITLE };
  assert.equal(QUOTE_MIN_CHARS, 6);
  const short = { points: [{ text: 'x', quote: '海外销量' }] };
  const r = checkRule('points_quoted:points', short, { original });
  assert.equal(r.passed, false);
  assert.match(r.evidence, /too short/);
  // control: six characters of the original are enough
  assert.equal(checkRule('points_quoted:points', { points: [{ text: 'x', quote: '其中海外销量' }] }, { original }).passed, true);
  assert.equal(checkRule('points_quoted:points', { points: [{ text: 'x' }] }, { original }).passed, false, 'no quote');
  assert.equal(checkRule('points_quoted:points', { points: ['a 1.0 point, a plain string'] }, { original }).passed, false, 'a plain string');
  assert.equal(checkRule('points_quoted:points', { points: [] }, { original }).passed, false, 'no points');
});

test('quotes: what is checked is the original kept in the library, not material the model hands back', async () => {
  const handedBack = `${TEXT}\n\n比亚迪 10 月海外销量创历史新高。`;
  const point = { points: [{ text: 'x', quote: '比亚迪 10 月海外销量创历史新高。' }] };
  // control: against the material the model handed back the sentence would be found
  assert.equal(checkRule('points_quoted:points', point, { source: handedBack }).passed, true);
  assert.equal(checkRule('points_quoted:points', point, { source: handedBack, original: { text: TEXT, title: TITLE } }).passed, false);
  // and checkSummary reads the file: change the file, the same summary is judged on the new words
  const lib = library('w3-quote-file');
  const s = withPoint(0, { quote: '比亚迪 10 月海外销量创历史新高。' });
  const before = await checkSummary({ libraryDir: lib, url: URL, produce: producer(s, s).produce, connector: judgeAllPass() });
  assert.equal(before.passed, false);
  saveOriginal(lib, { url: URL, title: TITLE, text: `${TEXT}\n\n比亚迪 10 月海外销量创历史新高。`, method: 'direct', fetchedAt: '2026-11-20T16:00:00.000Z' });
  const after = await checkSummary({ libraryDir: lib, url: URL, produce: producer(s).produce, connector: judgeAllPass() });
  assert.equal(after.passed, true, JSON.stringify(after.verification.failed));
});

// ---------- numbers ----------

test('numbers: a number the original does not have, a number made bigger, a number with another unit are all sent back', async () => {
  const lib = library('w3-numbers');
  const cases = {
    invented: () => ({ ...GOOD(), what: '比亚迪 10 月销量 50.2 万辆，门店新增 300 家。' }),
    bigger: withPoint(0, { text: '10 月销量 50.2 万辆，同比增长 20%' }),
    unit: withPoint(1, { text: '海外销量 1.2 亿辆，约占 2.4%' }),
  };
  const expect = { invented: '300', bigger: '20%', unit: '1.2亿' };
  for (const [name, out] of Object.entries(cases)) {
    const r = await checkSummary({ libraryDir: lib, url: URL, produce: producer(out, out).produce, connector: judgeAllPass() });
    assert.equal(r.passed, false, name);
    const f = r.verification.failed.find((x) => x.id === 'numbers-found');
    assert.ok(f, `${name}: ${JSON.stringify(r.verification.failed)}`);
    assert.ok(f.evidence.replace(/\s/g, '').includes(expect[name]), `${name}: ${f.evidence}`);
    assert.equal(failedIds(r).includes('point-quotes'), false, `${name}: only the number is wrong`);
  }
});

test('numbers: the same number written another way is not wrong; a number of the title counts as in the original', () => {
  const original = { text: TEXT, title: TITLE };
  const same = { what: '收入增加 1200 million yuan，销量增长 12.0%，海外占比 2.4％，预计增长 3.5%。', points: [] };
  const r = checkRule('numbers_in_original:what,points', same, { original });
  assert.equal(r.passed, true, r.evidence);
  const titled = { what: '2026 年 10 月的产销快报。', points: [] };
  assert.equal(checkRule('numbers_in_original:what,points', titled, { original }).passed, true);
  // control: without the title the year is not in the original
  assert.equal(checkRule('numbers_in_original:what,points', titled, { original: { text: TEXT, title: '' } }).passed, false);
  // the points' own text is read, not only what
  const inPoint = { what: '概览。', points: [{ text: '增长 13%', quote: Q1 }] };
  assert.equal(checkRule('numbers_in_original:what,points', inPoint, { original }).passed, false);
});

test('numbers: what is read out of a text', () => {
  const got = numbersIn('销量 50.2 万辆，增长１２％，收入 1,200 million，3.5 percent，H100').map((n) => `${n.value}${n.unit}`);
  assert.deepEqual(got, ['50.2万', '12%', '1200million', '3.5%', '100']);
  assert.deepEqual(missingNumbers('增长 20%，销量 50.2 万', TEXT), ['20%']);
  assert.deepEqual(missingNumbers('没有数字的一句话', TEXT), []);
});

// ---------- anchors ----------

test('anchors: each point that passed carries its place in the original; cutting the original there gives its sentence', async () => {
  const lib = library('w3-anchors');
  const s = withPoint(0, { quote: '比亚迪10月新能源汽车销量为50.2万辆，同比增长12%。' }); // spacing differs from the original
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: producer(s).produce, connector: judgeAllPass() });
  assert.equal(r.passed, true, JSON.stringify(r.verification.failed));
  const stored = readOriginal(lib, originalId(URL)).text;
  assert.equal(r.summary.anchors.length, 3);
  assert.deepEqual(r.summary.anchors.map((a) => a.point), [0, 1, 2]);
  assert.deepEqual(r.summary.anchors.map((a) => a.paragraph), [0, 1, 2]);
  // the first one is the original's own words (with its spaces), not the summary's
  assert.equal(stored.slice(r.summary.anchors[0].start, r.summary.anchors[0].end), P1);
  assert.equal(stored.slice(r.summary.anchors[1].start, r.summary.anchors[1].end), Q2);
  assert.equal(r.summary.anchors[1].start, TEXT.indexOf(Q2));
  assert.equal(stored.slice(r.summary.anchors[2].start, r.summary.anchors[2].end), Q3);
  // the card's points stay the plain lines the 待看 card shows
  assert.deepEqual(r.summary.points, GOOD().points.map((p) => p.text));
});

test('anchors: a point whose sentence was not found gets no place', async () => {
  const lib = library('w3-anchors-missing');
  const s = withPoint(2, { quote: 'The board expects record growth next year.' });
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: producer(s, s).produce, connector: judgeAllPass() });
  assert.equal(r.passed, false);
  assert.deepEqual(r.summary.anchors.map((a) => a.point), [0, 1]);
  const at = locateQuote(TEXT, Q2);
  assert.deepEqual(at, { start: TEXT.indexOf(Q2), end: TEXT.indexOf(Q2) + Q2.length, paragraph: 1 });
  assert.equal(locateQuote(TEXT, 'not in it at all'), null);
});

// ---------- twice ----------

test('twice: two rounds that fail leave the item in 待看, marked as not passed, with what failed; each round is recorded', async () => {
  const lib = library('w3-twice');
  const bad = withPoint(1, { quote: '海外销量翻了一倍以上。', text: '海外销量 2.4 万辆' });
  const p = producer(bad, bad);
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: p.produce, connector: judgeAllPass() });
  assert.equal(r.passed, false);
  assert.equal(r.rounds, 2);
  // the second round got back only what failed the first, with the reasons, and the prior output
  assert.equal(p.seen[0].feedback, null);
  assert.deepEqual(p.seen[1].feedback.failed.map((f) => f.id).sort(), ['numbers-found', 'point-quotes']);
  assert.ok(p.seen[1].feedback.failed.every((f) => typeof f.evidence === 'string' && f.evidence !== '' && f.desc !== ''));
  assert.ok(p.seen[1].prior);

  putInInbox(lib, { item: { url: URL, title: TITLE, source: 'byd', date: '2026-11-01' }, checked: r, round: 'r-1', now: () => new Date('2026-11-20T16:00:00Z') });
  const cards = listInbox(lib, { now: () => new Date('2026-11-21T16:00:00Z') });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].url, URL);
  assert.equal(cards[0].verification.passed, false);
  assert.equal(cards[0].verification.rounds, 2);
  assert.deepEqual(cards[0].verification.failed.map((f) => f.id).sort(), ['numbers-found', 'point-quotes']);
  assert.deepEqual(cards[0].summary.points, ['10 月销量 50.2 万辆，同比增长 12%', '海外销量 2.4 万辆', '季度收入增加 1200 million yuan，预计明年增长 3.5%']);
  assert.equal(cards[0].scoreless, undefined, 'not a card without a check: the 未通过核验 mark shows');
  assert.equal(replayLedger(lib).states.get(URL).stage, 'inbox');
  const ledger = readFileSync(join(lib, '_pipeline', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(ledger.find((e) => e.ev === 'inbox').verified, false);
  const verdicts = verdictsFor(lib, URL);
  assert.deepEqual(verdicts.map((v) => v.round), [1, 2]);
});

test('twice: wrong the first time and right the second passes, and goes to 待看 as passed', async () => {
  const lib = library('w3-second-right');
  const bad = withPoint(0, { text: '10 月销量 52 万辆，同比增长 12%' });
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: producer(bad, GOOD).produce, connector: judgeAllPass() });
  assert.equal(r.passed, true);
  assert.equal(r.rounds, 2);
  putInInbox(lib, { item: { url: URL, title: TITLE, source: 'byd' }, checked: r, now: () => new Date('2026-11-20T16:00:00Z') });
  const [card] = listInbox(lib);
  assert.equal(card.verification.passed, true);
  assert.equal(card.summary.anchors.length, 3);
});

// ---------- no original ----------

test('no original: no model call, the item says the original was not kept, and it does not go to 待看', async () => {
  const lib = caseDir('w3-no-original');
  const p = producer(GOOD);
  const judge = judgeAllPass();
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: p.produce, connector: judge });
  assert.equal(r.status, 'no-original');
  assert.equal(r.missing, ORIGINAL_MISSING);
  assert.equal(p.seen.length, 0);
  assert.equal(judge.calls.length, 0);
  assert.throws(() => putInInbox(lib, { item: { url: URL, title: TITLE }, checked: r }), /checked summary/);
  assert.equal(existsSync(join(lib, '_pipeline', 'inbox')), false);
  assert.deepEqual(listInbox(lib), []);
});

// ---------- judge ----------

test('judge: only when the rules pass, once a round, on the stored original; a round whose rules fail does not call it', async () => {
  const lib = library('w3-judge');
  const judge = judgeAllPass();
  const ok = await checkSummary({ libraryDir: lib, url: URL, produce: producer(GOOD).produce, connector: judge });
  assert.equal(ok.passed, true);
  assert.equal(judge.calls.length, 1);
  assert.ok(judge.calls[0].prompt.includes(P2), 'the judge reads the stored original');
  assert.ok(judge.calls[0].prompt.includes('[numbers-in-source]'));
  assert.equal(ok.calls, 2, 'one summary call and one judge call');

  const judge2 = judgeAllPass();
  const bad = withPoint(0, { text: '增长 99%' });
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: producer(bad, GOOD).produce, connector: judge2 });
  assert.equal(r.passed, true);
  assert.equal(judge2.calls.length, 1, 'round 1 failed a rule: no judge; round 2 passed the rules: one judge');
  assert.equal(r.calls, 3);

  // the judge says no: the round fails on it
  const nay = fakeConnector({ mode: 'counting', json: (req) => ({ items: [...req.prompt.matchAll(/^\[([\w-]+)\]/gm)].map((m) => ({ id: m[1], passed: m[1] !== 'numbers-in-source', evidence: '「目标」写成了「已完成」' })) }) });
  const no = await checkSummary({ libraryDir: lib, url: URL, produce: producer(GOOD, GOOD).produce, connector: nay });
  assert.equal(no.passed, false);
  assert.deepEqual(failedIds(no), ['numbers-in-source']);
  assert.equal(nay.calls.length, 2);
});

test('a summary that never comes back readable is bad-format; a judge that cannot be reached is connection', async () => {
  const lib = library('w3-bad');
  const r = await checkSummary({ libraryDir: lib, url: URL, produce: producer({}, {}).produce, connector: judgeAllPass() });
  assert.equal(r.status, 'bad-format');
  assert.throws(() => putInInbox(lib, { item: { url: URL }, checked: r }), /checked summary/);
  const down = await checkSummary({ libraryDir: lib, url: URL, produce: producer(GOOD).produce, connector: fakeConnector({ mode: 'login-expired' }) });
  assert.equal(down.status, 'connection');
  assert.equal(down.code, 'login-expired');
});

// ---------- words ----------

test('words: the new items are described in both languages, from the item, not its id', () => {
  const zh = originalChecklist('zh-CN');
  assert.deepEqual(zh.map((i) => i.id), ['what-nonempty', 'points-count', 'point-quotes', 'numbers-found', 'no-placeholder', 'no-banned-words', 'numbers-in-source']);
  for (const id of ['point-quotes', 'numbers-found']) {
    const it = zh.find((i) => i.id === id);
    const cn = baselineDescription(it, 'zh-CN');
    const en = baselineDescription(it, 'en');
    assert.ok(cn && /[一-鿿]/.test(cn), `${id} zh: ${cn}`);
    assert.ok(en && !/[一-鿿]/.test(en), `${id} en: ${en}`);
    assert.equal(cn.includes(id) || en.includes(id), false);
  }
  const shown = describeChecklist(zh, 'en');
  assert.ok(shown.every((i) => !/[一-鿿]/.test(i.desc)), JSON.stringify(shown.map((i) => i.desc)));
});
