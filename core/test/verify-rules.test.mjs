import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRule, countWords, parseRule, RULE_OPS } from '../src/verify/rules.mjs';

const SOURCE = '据官方博客，Letta 在 10 月发布了 memory blocks，目标是把上下文窗口的 40% 留给记忆。';

// `why` is either a RegExp the evidence must match, or a plain message explaining the expectation.
function expect(rule, output, ctx, passed, why) {
  const r = checkRule(rule, output, ctx);
  const msg = typeof why === 'string' ? `${why}: ` : '';
  assert.equal(r.passed, passed, `${msg}${rule} on ${JSON.stringify(output)} -> ${r.evidence}`);
  assert.equal(typeof r.evidence, 'string');
  assert.notEqual(r.evidence, '', `${rule}: evidence must say something`);
  if (why instanceof RegExp) assert.match(r.evidence, why, `${rule}: evidence`);
  return r;
}

test('countWords: whitespace tokens, each Han character counts one, mixed tokens split', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('one two  three'), 3);
  assert.equal(countWords('上下文窗口'), 5);
  assert.equal(countWords('memory blocks 是 Letta 的记忆层'), 8, 'memory, blocks, 是, Letta, 的, 记, 忆, 层');
  assert.equal(countWords('hello世界foo'), 4, 'a Han run inside a latin token splits it');
  assert.equal(countWords('a\nb\tc'), 3);
  assert.notEqual(countWords('上下文窗口'), 1, 'sentinel: Han must not count as one word');
  assert.equal(countWords(42), 0, 'non-string counts zero');
});

test('parseRule splits on the first colon only; regex args keep their own colons', () => {
  assert.deepEqual(parseRule('regex:^a:b$'), { op: 'regex', arg: '^a:b$' });
  assert.deepEqual(parseRule('json_nonempty'), { op: 'json_nonempty', arg: '' });
  assert.equal(parseRule(''), null);
  assert.equal(parseRule(undefined), null);
  assert.equal(RULE_OPS.length, 13);
});

test('contains: one positive, one negative, case-insensitive, string and object output', () => {
  expect('contains:memory', 'Letta memory blocks', {}, true);
  expect('contains:memory', 'Letta blocks', {}, false, /not found/);
  expect('contains:MEMORY', 'letta memory blocks', {}, true);
  expect('contains:memory', { what: 'memory blocks' }, {}, true, undefined);
  expect('contains:memory', { what: 'blocks' }, {}, false);
  expect('contains:', 'anything', {}, false, /empty argument/);
});

test('regex / not_regex: positive and negative, invalid pattern fails rather than throws', () => {
  expect('regex:\\d{4}-\\d{2}-\\d{2}', 'released 2026-10-31', {}, true, /matched/);
  expect('regex:\\d{4}-\\d{2}-\\d{2}', 'released in October', {}, false, /no match/);
  expect('not_regex:\\b(TODO|TBD|FIXME)\\b', 'Budget: $42,000', {}, true);
  expect('not_regex:\\b(TODO|TBD|FIXME)\\b', 'Budget: TODO', {}, false, /TODO/);
  expect('not_regex:\\b(TODO|TBD|FIXME)\\b', 'Budget: todo', {}, false, /todo/);
  expect('not_regex:\\bgate\\b', { what: 'the gate opens' }, {}, false, /gate/);
  expect('not_regex:\\bgate\\b', { what: 'the gateway opens' }, {}, true);
  expect('regex:(', 'anything', {}, false, /invalid pattern/);
  expect('not_regex:(', 'anything', {}, false, /invalid pattern/);
});

test('min_words / max_words: boundaries both sides, Han counted per character, bad argument fails', () => {
  expect('min_words:3', 'one two three', {}, true, /3 words/);
  expect('min_words:4', 'one two three', {}, false, /3 words/);
  expect('max_words:3', 'one two three', {}, true);
  expect('max_words:2', 'one two three', {}, false);
  expect('min_words:5', '上下文窗口', {}, true);
  expect('min_words:6', '上下文窗口', {}, false);
  expect('max_words:50', { what: 'short', points: ['a', 'b'] }, {}, true);
  expect('min_words:x', 'one two', {}, false, /bad argument/);
  expect('min_words:', 'one two', {}, false, /bad argument/);
});

test('json_keys: all keys present vs one missing; string output parsed first; unparseable fails', () => {
  const obj = { relevance: 0.8, reason: 'r', quote: 'q' };
  expect('json_keys:relevance,reason,quote', obj, {}, true, /all keys/);
  expect('json_keys:relevance,reason,quote,extra', obj, {}, false, /missing keys: extra/);
  expect('json_keys:relevance,reason', JSON.stringify(obj), {}, true);
  expect('json_keys:relevance', '{not json', {}, false, /not valid JSON/);
  expect('json_keys:relevance', '[1,2]', {}, false, /not a JSON object/);
  expect('json_keys:relevance', 42, {}, false, /not a JSON object/);
  expect('json_keys:', obj, {}, false, /empty argument/);
  expect('json_keys:relevance', { relevance: null }, {}, true, undefined);
});

test('json_range: inside, on the edges, outside, not a number, NaN-ish', () => {
  expect('json_range:relevance,0,1', { relevance: 0.7 }, {}, true, /in \[0,1\]/);
  expect('json_range:relevance,0,1', { relevance: 0 }, {}, true);
  expect('json_range:relevance,0,1', { relevance: 1 }, {}, true);
  expect('json_range:relevance,0,1', { relevance: 1.2 }, {}, false, /not in/);
  expect('json_range:relevance,0,1', { relevance: -0.1 }, {}, false);
  expect('json_range:relevance,0,1', { relevance: '0.7' }, {}, false, /not a number/);
  expect('json_range:relevance,0,1', { reason: 'x' }, {}, false, /not a number/);
  expect('json_range:relevance,0,1', '{"relevance":0.5}', {}, true);
  expect('json_range:relevance,0,1', 'nope', {}, false, /not valid JSON/);
  expect('json_range:relevance,a,b', { relevance: 0.5 }, {}, false, /bad argument/);
});

test('json_enum: value in the list, not in the list, not a string, missing', () => {
  expect('json_enum:freshness,new|followup|duplicate', { freshness: 'followup' }, {}, true);
  expect('json_enum:freshness,new|followup|duplicate', { freshness: 'stale' }, {}, false, /not one of/);
  expect('json_enum:freshness,new|followup|duplicate', { freshness: 'New' }, {}, false, 'enum is exact, no case folding');
  expect('json_enum:freshness,new|followup|duplicate', { freshness: 1 }, {}, false, /not a string/);
  expect('json_enum:freshness,new|followup|duplicate', {}, {}, false);
  expect('json_enum:freshness,new|followup', '{"freshness":"new"}', {}, true);
  expect('json_enum:freshness', { freshness: 'new' }, {}, false, /bad argument/);
});

test('quote_in_source: verbatim only; one extra character fails; empty fails; no source fails', () => {
  const quote = '把上下文窗口的 40% 留给记忆';
  expect('quote_in_source:quote', { quote }, { source: SOURCE }, true, /verbatim/);
  expect('quote_in_source:quote', { quote: quote + '。' }, { source: SOURCE }, true, 'the full stop is in the source too');
  expect('quote_in_source:quote', { quote: quote + '！' }, { source: SOURCE }, false, /not found verbatim/);
  expect('quote_in_source:quote', { quote: '把上下文窗口的 40 % 留给记忆' }, { source: SOURCE }, false, 'no whitespace normalisation');
  expect('quote_in_source:quote', { quote: 'letta' }, { source: SOURCE }, false, 'no case folding');
  expect('quote_in_source:quote', { quote: 'Letta' }, { source: SOURCE }, true);
  expect('quote_in_source:quote', { quote: '' }, { source: SOURCE }, false, /empty/);
  expect('quote_in_source:quote', { quote: null }, { source: SOURCE }, false, /empty/);
  expect('quote_in_source:quote', { reason: 'x' }, { source: SOURCE }, false, /empty/);
  expect('quote_in_source:quote', { quote: 'Letta' }, {}, false, /no source/);
  expect('quote_in_source:quote', JSON.stringify({ quote }), { source: SOURCE }, true);
  expect('quote_in_source:quote', 'not json', { source: SOURCE }, false, /not valid JSON/);
});

test('ids_in_set: array or single value, every id must be a candidate; number/string ids compare equal', () => {
  const ctx = { candidateIds: [1, 2, 3] };
  expect('ids_in_set:refs', { refs: [1, 3] }, ctx, true, /2 ids/);
  expect('ids_in_set:refs', { refs: [1, 7] }, ctx, false, /not in candidate set: 7/);
  expect('ids_in_set:refs', { refs: 2 }, ctx, true);
  expect('ids_in_set:refs', { refs: 9 }, ctx, false);
  expect('ids_in_set:refs', { refs: ['1', '2'] }, ctx, true, 'string ids match numeric candidates');
  expect('ids_in_set:refs', { refs: [] }, ctx, true, 'nothing cited is not a wrong citation');
  expect('ids_in_set:refs', { answer: 'x' }, ctx, false, /missing/);
  expect('ids_in_set:refs', { refs: [1] }, {}, false, 'no candidates at all');
  expect('ids_in_set:refs', '{"refs":[1]}', ctx, true);
});

test('json_nonempty: string / array / object emptiness; whitespace-only is empty; zero is not', () => {
  expect('json_nonempty:what', { what: '这是一个记忆层' }, {}, true);
  expect('json_nonempty:what', { what: '' }, {}, false, /empty/);
  expect('json_nonempty:what', { what: '   ' }, {}, false);
  expect('json_nonempty:what', { points: [] }, {}, false);
  expect('json_nonempty:points', { points: [] }, {}, false);
  expect('json_nonempty:points', { points: ['a'] }, {}, true);
  expect('json_nonempty:meta', { meta: {} }, {}, false);
  expect('json_nonempty:n', { n: 0 }, {}, true);
  expect('json_nonempty:what', { what: null }, {}, false);
  expect('json_nonempty:what', '{"what":"x"}', {}, true);
});

test('json_count: exactly n items; fewer, more, not an array', () => {
  expect('json_count:points,3', { points: ['a', 'b', 'c'] }, {}, true, /3 items/);
  expect('json_count:points,3', { points: ['a', 'b'] }, {}, false, /2 items/);
  expect('json_count:points,3', { points: ['a', 'b', 'c', 'd'] }, {}, false, /4 items/);
  expect('json_count:points,3', { points: 'a, b, c' }, {}, false, /not an array/);
  expect('json_count:points,3', {}, {}, false);
  expect('json_count:points,x', { points: [] }, {}, false, /bad argument/);
  expect('json_count:points,0', { points: [] }, {}, true);
});

test('max_chars: character count on the field (code points, not bytes); missing fails', () => {
  expect('max_chars:reason,5', { reason: '五个字的理由' }, {}, false, /6 chars/);
  expect('max_chars:reason,6', { reason: '五个字的理由' }, {}, true, /6 chars/);
  expect('max_chars:reason,120', { reason: 'x'.repeat(120) }, {}, true);
  expect('max_chars:reason,120', { reason: 'x'.repeat(121) }, {}, false);
  expect('max_chars:reason,2', { reason: '😀😀' }, {}, true, 'astral characters count one each');
  expect('max_chars:reason,10', {}, {}, false, /missing/);
  expect('max_chars:reason,10', { reason: 12345 }, {}, true, 'non-strings are measured as their JSON text');
  expect('max_chars:reason', { reason: 'x' }, {}, false, /bad argument/);
  expect('max_chars:reason,10', '{"reason":"short"}', {}, true);
});

test('unknown operator and non-string rule fail with a reason, never throw', () => {
  expect('shout:loud', 'anything', {}, false, /unknown rule op "shout"/);
  expect('', 'anything', {}, false, /not a string/);
  expect(undefined, 'anything', {}, false, /not a string/);
  expect(42, 'anything', {}, false, /not a string/);
  assert.doesNotThrow(() => checkRule('regex:(', undefined));
});

test('sentinel: every operator in RULE_OPS has at least one failing input (a rule that cannot fail checks nothing)', () => {
  const failing = {
    contains: ['contains:zzz', 'abc'],
    regex: ['regex:^z', 'abc'],
    not_regex: ['not_regex:a', 'abc'],
    min_words: ['min_words:9', 'a b'],
    max_words: ['max_words:1', 'a b'],
    json_keys: ['json_keys:k', {}],
    json_range: ['json_range:k,0,1', { k: 2 }],
    json_enum: ['json_enum:k,a|b', { k: 'c' }],
    quote_in_source: ['quote_in_source:k', { k: 'x' }],
    ids_in_set: ['ids_in_set:k', { k: [1] }],
    json_nonempty: ['json_nonempty:k', { k: '' }],
    json_count: ['json_count:k,1', { k: [] }],
    max_chars: ['max_chars:k,1', { k: 'ab' }],
  };
  for (const op of RULE_OPS) {
    assert.ok(failing[op], `no failing input written for ${op}`);
    const [rule, output] = failing[op];
    assert.equal(checkRule(rule, output, { source: 'nothing here', candidateIds: [] }).passed, false, op);
  }
});
