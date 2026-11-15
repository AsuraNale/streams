// Redesign R6b-3 (docs/checks/2026-11-13-r6b/contract.md): the English the core itself supplies for an English interface.
//   1. the built-in rules of a scoring step and of the summary (verify/checklist.mjs) can be described in the interface's
//      language: describeChecklist(items, 'en') gives each built-in item an English description worked out from its id and
//      its rule; what the pipeline runs with (gateBaseline / summaryBaseline without a language) is the Chinese it always was;
//   2. the proper names in the words the main agent is given (agent/words.mjs UI_TERMS) are written as the interface writes
//      them (Inbox, To confirm, Sources & Brief), and the English sentences the core writes into the conversation about a
//      系统检测 (suggest/act.mjs) say Inbox and "To confirm" the same way.
// (The desktop's test/r6b-english.test.mjs holds the same words to the English word list of wording/glossary.json.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineDescription, describeChecklist, gateBaseline, summaryBaseline, lockChecklist, BASELINE_LANGUAGES } from '../src/verify/checklist.mjs';
import { pipelineFrom, DEFAULT_PIPELINE } from '../src/pipeline/config.mjs';
import { UI_TERMS } from '../src/agent/words.mjs';
import { handoffText, suggestionText } from '../src/suggest/act.mjs';

const CHINESE = /[　-〿㐀-鿿＀-￯]/;
const SUBSTANCE = { id: 'substance', kind: 'gate', output: { substance: 'score', freshness: 'enum:new|followup|duplicate', reason: 'text', quote: 'text' } };

test('R6b-3 describeChecklist: the eleven built-in descriptions in English, from the id and the rule; the Chinese the pipeline runs with unchanged', () => {
  const zh = [...gateBaseline(SUBSTANCE), ...summaryBaseline()];
  assert.equal(zh.length, 11);
  assert.deepEqual(BASELINE_LANGUAGES, ['zh-CN', 'en']);
  for (const it of zh) assert.ok(CHINESE.test(it.desc), `${it.id}: what runs is Chinese, as before R6b`);
  assert.equal(zh[0].desc, '输出包含全部约定字段：substance、freshness、reason、quote');
  assert.equal(zh[10].desc, '摘要里的每个数字和断言都能在材料里找到，目标 / 预计 / 已完成这类状态词没被升级');

  const en = describeChecklist(zh, 'en');
  assert.deepEqual(en.map((it) => it.desc), [
    'The output has every agreed field: substance, freshness, reason, quote',
    'substance is a number from 0 to 1',
    'freshness is one of new / followup / duplicate',
    'The reason is at most 120 characters',
    'The quoted words appear word for word in the material',
    'There is a one-line overview',
    'There are exactly three points',
    'No TODO / TBD / FIXME left in',
    'No internal terms',
    'The quoted words appear word for word in the material',
    'Every number and claim in the summary can be found in the material, and words such as target / expected / done are not upgraded',
  ]);
  for (const [i, it] of en.entries()) {
    assert.equal(CHINESE.test(it.desc), false, `${it.id}: nothing Chinese`);
    assert.deepEqual({ ...it, desc: null }, { ...zh[i], desc: null }, `${it.id}: the id, the kind, the rule and the origin are untouched`);
    assert.ok([...it.desc].length >= 6, `${it.id}: long enough for lockChecklist`);
  }
  // the same words whichever way they are asked for; and back again (never read from the description itself)
  assert.deepEqual(gateBaseline(SUBSTANCE, 'en'), en.slice(0, 5));
  assert.deepEqual(summaryBaseline('en'), en.slice(5));
  assert.deepEqual(describeChecklist(en, 'zh-CN'), zh);
  assert.deepEqual(describeChecklist(zh), zh, 'no language: the Chinese');
  assert.deepEqual(describeChecklist(zh, 'fr'), zh, 'a language the core does not have: the Chinese');
  assert.deepEqual(describeChecklist(null, 'en'), []);
});

test('R6b-3 describeChecklist leaves the user\'s own items, the order and the input alone; an item that only looks built-in is not reworded', () => {
  const mine = { id: 'user-1', desc: '要有第三方评测的数字', kind: 'judge', origin: 'user' };
  const locked = lockChecklist([mine], { baseline: gateBaseline(SUBSTANCE) }).items;
  const before = JSON.stringify(locked);
  const en = describeChecklist(locked, 'en');
  assert.equal(JSON.stringify(locked), before, 'the input is not changed');
  assert.deepEqual(en.map((it) => it.id), locked.map((it) => it.id));
  assert.equal(en[0], locked[0], 'the user\'s item is the same object, its words as written');
  assert.equal(en[1].desc, 'The output has every agreed field: substance, freshness, reason, quote');
  assert.equal(baselineDescription(mine, 'en'), null);
  assert.equal(baselineDescription({ id: 'reason-length', desc: '理由不超过 120 字', kind: 'rule', rule: 'max_chars:reason,120', origin: 'user' }, 'en'), null, 'a user item with a built-in id');
  assert.equal(baselineDescription({ id: 'no-such-item', desc: 'x', kind: 'rule', rule: 'x:y', origin: 'streams' }, 'en'), null, 'an id this version does not know');
  assert.equal(baselineDescription({ id: 'json-keys', desc: 'x', kind: 'rule', rule: 'something_else:a', origin: 'streams' }, 'en'), null, 'a rule that is not the built-in one');
  // the whole default pipeline: every built-in item of every step has its English
  const config = pipelineFrom({ pipeline: DEFAULT_PIPELINE('zh-CN') });
  let n = 0;
  for (const node of config.nodes) {
    for (const it of describeChecklist(node.checklist ?? [], 'en')) { n++; assert.equal(CHINESE.test(it.desc), false, `${node.id}/${it.id}`); }
  }
  assert.ok(n >= 14, `the default pipeline's built-in items were looked at (${n})`);
});

test('R6b-3 the proper names in the words the core gives the main agent and writes into the conversation: Inbox, To confirm, Sources & Brief', () => {
  const term = (zh) => UI_TERMS.find((r) => r[1].startsWith(zh))?.[2];
  assert.equal(term('待确认'), 'To confirm');
  assert.equal(term('来源与要求'), 'Sources & Brief');
  assert.equal(term('待看'), 'Inbox (to review)');
  for (const row of UI_TERMS) assert.equal(/\binbox\b|\brounds?\b|\bMain Agent\b/.test(row[2]), false, `no old word in 「${row[2]}」`);
  const noOutput = { kind: 'no-output', subject: 'x', evidence: { rounds: 3 } };
  const said = suggestionText(noOutput, { lang: 'en' });
  assert.match(said, /^3 runs in a row put nothing new into the Inbox\.$/);
  const handed = handoffText(noOutput, { libraryName: 'L', lang: 'en' });
  assert.match(handed, /^In "To confirm", the user pressed /);
  assert.equal(/\binbox\b/.test(`${said} ${handed}`), false);
});
