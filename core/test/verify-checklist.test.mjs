import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockChecklist, gateBaseline, summaryBaseline, BANNED_WORDS, MAX_CHECKLIST_ITEMS } from '../src/verify/checklist.mjs';
import { checkRule } from '../src/verify/rules.mjs';

// The substance gate exactly as core-api 4.0 writes it.
const SUBSTANCE = {
  id: 'substance', kind: 'gate', threshold: 0.6, material: 'body', requirement: '…',
  output: { substance: 'score', freshness: 'enum:new|followup|duplicate', reason: 'text', quote: 'text' },
  checklist: [],
};

const BASELINE = [
  { id: 'b-one', desc: '底线项一，六个字以上', kind: 'rule', rule: 'json_nonempty:what', origin: 'streams' },
  { id: 'b-two', desc: '底线项二，是判定项', kind: 'judge', origin: 'streams' },
];

function ids(items) {
  return items.map((it) => it.id);
}

test('lockChecklist keeps well-formed items, stamps origin user, appends baseline last as streams', () => {
  const { items, notes } = lockChecklist([
    { id: 'has-date', desc: '每条要点带日期', kind: 'rule', rule: 'regex:\\d{4}-\\d{2}-\\d{2}', origin: 'streams' },
    { id: 'tone', desc: '语气平实不夸张' },
  ], { baseline: BASELINE });
  assert.deepEqual(notes, []);
  assert.deepEqual(ids(items), ['has-date', 'tone', 'b-one', 'b-two']);
  assert.equal(items[0].origin, 'user', 'a user item claiming origin streams is still a user item');
  assert.equal(items[0].rule, 'regex:\\d{4}-\\d{2}-\\d{2}');
  assert.equal(items[1].kind, 'judge', 'kind defaults to judge');
  assert.equal(items[1].rule, undefined);
  assert.equal(items[2].origin, 'streams');
  assert.equal(items[3].origin, 'streams');
  assert.notEqual(items[0].origin, 'streams');
});

test('lockChecklist drops vague descriptions (< 6 chars), notes each, keeps a 6-char one', () => {
  const { items, notes } = lockChecklist([
    { id: 'ok', desc: '六个字刚刚好' },
    { id: 'x', desc: 'ok' },
    { id: 'five', desc: '只有五个字' },
    { id: 'spaces', desc: '   短   ' },
    { id: 'nodesc' },
  ]);
  assert.deepEqual(ids(items), ['ok']);
  assert.equal(notes.length, 4);
  assert.match(notes[0], /"x".*desc/);
  assert.match(notes[1], /"five"/);
  assert.match(notes[2], /"spaces"/);
  assert.match(notes[3], /"nodesc"/);
});

test('lockChecklist drops duplicate ids (first wins), missing ids, non-objects', () => {
  const { items, notes } = lockChecklist([
    { id: 'a', desc: '第一个 a 项目' },
    { id: 'a', desc: '第二个 a 项目，应被剔' },
    { desc: '没有编号的项目' },
    { id: '', desc: '空编号的项目' },
    'not an item',
    null,
  ]);
  assert.deepEqual(ids(items), ['a']);
  assert.equal(items[0].desc, '第一个 a 项目');
  assert.equal(notes.length, 5);
  assert.match(notes[0], /duplicate id "a"/);
  assert.match(notes[1], /missing id/);
  assert.match(notes[2], /missing id/);
  assert.match(notes[3], /not an object/);
  assert.match(notes[4], /not an object/);
});

test('lockChecklist drops a rule item without a rule (not promoted to judge) and an unknown kind', () => {
  const { items, notes } = lockChecklist([
    { id: 'r1', desc: '规则项没有给规则', kind: 'rule' },
    { id: 'r2', desc: '规则项规则是空串', kind: 'rule', rule: '   ' },
    { id: 'r3', desc: '规则项有规则', kind: 'rule', rule: 'min_words:1' },
    { id: 'k', desc: '未知种类的项目', kind: 'vibe' },
  ]);
  assert.deepEqual(ids(items), ['r3']);
  assert.equal(items.some((it) => it.id === 'r1' && it.kind === 'judge'), false, 'never upgraded to judge');
  assert.equal(notes.length, 3);
  assert.match(notes[0], /"r1".*without a rule/);
  assert.match(notes[1], /"r2".*without a rule/);
  assert.match(notes[2], /"k".*unknown kind "vibe"/);
});

test('lockChecklist: a user item cannot take a baseline id; the baseline copy is the one kept', () => {
  const { items, notes } = lockChecklist([
    { id: 'b-one', desc: '冒充底线项的用户项', kind: 'rule', rule: 'min_words:0', origin: 'streams' },
    { id: 'mine', desc: '正常的用户项目' },
  ], { baseline: BASELINE });
  assert.deepEqual(ids(items), ['mine', 'b-one', 'b-two']);
  const b = items.find((it) => it.id === 'b-one');
  assert.equal(b.rule, 'json_nonempty:what', 'the baseline rule, not the impostor rule');
  assert.equal(b.origin, 'streams');
  assert.equal(notes.length, 1);
  assert.match(notes[0], /reserved for a baseline item/);
  // locking an already locked list is stable (the baseline comes back once, not twice)
  const again = lockChecklist(items, { baseline: BASELINE });
  assert.deepEqual(ids(again.items), ids(items));
});

test('lockChecklist truncates user items to maxItems; baseline is not counted against the cap', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ id: `u${i}`, desc: `第 ${i} 条用户项目` }));
  const { items, notes } = lockChecklist(many, { baseline: BASELINE });
  assert.equal(items.filter((it) => it.origin === 'user').length, MAX_CHECKLIST_ITEMS);
  assert.equal(items.length, MAX_CHECKLIST_ITEMS + BASELINE.length);
  assert.deepEqual(ids(items).slice(0, 3), ['u0', 'u1', 'u2'], 'the first ones survive');
  assert.deepEqual(ids(items).slice(-2), ['b-one', 'b-two']);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /truncated from 15 to 12/);
  const small = lockChecklist(many, { baseline: BASELINE, maxItems: 2 });
  assert.deepEqual(ids(small.items), ['u0', 'u1', 'b-one', 'b-two']);
  const exact = lockChecklist(many.slice(0, 12), { baseline: [] });
  assert.deepEqual(exact.notes, [], 'exactly maxItems is not truncated');
});

test('lockChecklist with nothing: empty input and no baseline -> empty; non-array input -> empty', () => {
  assert.deepEqual(lockChecklist([]), { items: [], notes: [] });
  assert.deepEqual(lockChecklist(undefined, { baseline: BASELINE }).items.map((i) => i.id), ['b-one', 'b-two']);
});

test('gateBaseline for the contract substance node yields exactly: keys, range, enum, reason length, quote', () => {
  const items = gateBaseline(SUBSTANCE);
  assert.deepEqual(items.map((it) => [it.id, it.rule]), [
    ['json-keys', 'json_keys:substance,freshness,reason,quote'],
    ['range-substance', 'json_range:substance,0,1'],
    ['enum-freshness', 'json_enum:freshness,new|followup|duplicate'],
    ['reason-length', 'max_chars:reason,120'],
    ['quote-in-source', 'quote_in_source:quote'],
  ]);
  for (const it of items) {
    assert.equal(it.kind, 'rule');
    assert.equal(it.origin, 'streams');
    assert.ok([...it.desc].length >= 6, `${it.id} desc long enough to survive lockChecklist`);
  }
  assert.equal(items.some((it) => it.kind === 'judge'), false, 'a gate costs zero extra calls');
});

test('gateBaseline: the relevance node has no enum item; a node without output throws bad-node', () => {
  const relevance = { id: 'relevance', kind: 'gate', output: { relevance: 'score', reason: 'text', quote: 'text' } };
  assert.deepEqual(gateBaseline(relevance).map((it) => it.id), ['json-keys', 'range-relevance', 'reason-length', 'quote-in-source']);
  assert.throws(() => gateBaseline({ id: 'x' }), (e) => e.code === 'bad-node');
  assert.throws(() => gateBaseline({ id: 'x', output: {} }), (e) => e.code === 'bad-node');
  assert.throws(() => gateBaseline(undefined), (e) => e.code === 'bad-node');
});

test('gateBaseline items actually pass a good gate output and fail a fabricated one', () => {
  const source = '文章说：memory blocks 把上下文窗口的 40% 留给记忆。';
  const good = { substance: 0.8, freshness: 'new', reason: '讲清了机制', quote: '把上下文窗口的 40% 留给记忆' };
  const bad = { substance: 1.4, freshness: 'fresh', reason: 'x'.repeat(121), quote: '把上下文窗口的 50% 留给记忆' };
  const items = gateBaseline(SUBSTANCE);
  assert.deepEqual(items.map((it) => checkRule(it.rule, good, { source }).passed), [true, true, true, true, true]);
  assert.deepEqual(items.map((it) => checkRule(it.rule, bad, { source }).passed), [true, false, false, false, false]);
});

test('summaryBaseline: five rules plus the numbers-in-source judge item, all origin streams', () => {
  const items = summaryBaseline();
  assert.deepEqual(items.map((it) => [it.id, it.kind]), [
    ['what-nonempty', 'rule'],
    ['points-count', 'rule'],
    ['no-placeholder', 'rule'],
    ['no-banned-words', 'rule'],
    ['quote-in-source', 'rule'],
    ['numbers-in-source', 'judge'],
  ]);
  assert.ok(items.every((it) => it.origin === 'streams'));
  assert.equal(items[0].rule, 'json_nonempty:what');
  assert.equal(items[1].rule, 'json_count:points,3');
  assert.equal(items[2].rule, 'not_regex:\\b(TODO|TBD|FIXME)\\b');
  assert.equal(items[3].rule, 'not_regex:\\b(Bronze|Silver|Gold|Medallion|judge|keeper|gate|pending|ledger)\\b');
  assert.equal(items[4].rule, 'quote_in_source:quote');
  assert.deepEqual(BANNED_WORDS, ['Bronze', 'Silver', 'Gold', 'Medallion', 'judge', 'keeper', 'gate', 'pending', 'ledger']);
  assert.match(items[5].desc, /数字/);
  assert.match(items[5].desc, /状态词/);
  // the baseline survives its own lock untouched
  const locked = lockChecklist([], { baseline: items });
  assert.deepEqual(locked.items, items);
});

test('summaryBaseline rules pass a clean summary and each catches its own defect', () => {
  const source = '报告称试点覆盖 500 名用户，目标是 2026 年底扩到 5000。';
  const clean = { what: '一个记忆层的试点。', points: ['覆盖 500 名用户', '目标年底 5000', '仍在试点'], quote: '试点覆盖 500 名用户' };
  const rules = summaryBaseline().filter((it) => it.kind === 'rule');
  assert.deepEqual(rules.map((it) => checkRule(it.rule, clean, { source }).passed), [true, true, true, true, true]);
  const defects = [
    { ...clean, what: '' },
    { ...clean, points: ['a', 'b'] },
    { ...clean, points: ['a', 'TODO', 'c'] },
    { ...clean, what: 'Moved to Gold tier.' },
    { ...clean, quote: '试点覆盖 5000 名用户' },
  ];
  defects.forEach((out, i) => {
    assert.equal(checkRule(rules[i].rule, out, { source }).passed, false, rules[i].id);
  });
});
