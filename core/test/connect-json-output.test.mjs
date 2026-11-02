import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/connect/json-output.mjs';

test('extractJson: plain object, plain array, surrounding whitespace', () => {
  assert.deepEqual(extractJson('{"ok":true}'), { ok: true, json: { ok: true } });
  assert.deepEqual(extractJson('  \n[1,2]\n'), { ok: true, json: [1, 2] });
});

test('extractJson: tolerates a ```json fence and prose around it', () => {
  const t = 'Sure, here is the result:\n```json\n{"score": 0.8, "reason": "has code"}\n```\nHope this helps.';
  assert.deepEqual(extractJson(t), { ok: true, json: { score: 0.8, reason: 'has code' } });
  assert.deepEqual(extractJson('```\n{"a":1}\n```'), { ok: true, json: { a: 1 } });
});

test('extractJson: prose before and after without a fence; braces inside strings do not confuse it', () => {
  assert.deepEqual(extractJson('Answer: {"a":"x } y {","b":[1,{"c":2}]} -- done'), { ok: true, json: { a: 'x } y {', b: [1, { c: 2 }] } });
  assert.deepEqual(extractJson('escaped quote: {"a":"say \\"hi\\" {"}'), { ok: true, json: { a: 'say "hi" {' } });
});

test('extractJson: never repairs bad JSON', () => {
  assert.deepEqual(extractJson('{"a":1,}'), { ok: false, reason: 'invalid-json' });
  assert.deepEqual(extractJson("{'a': 1}"), { ok: false, reason: 'invalid-json' });
  assert.deepEqual(extractJson('{"a":1'), { ok: false, reason: 'invalid-json' });
  assert.deepEqual(extractJson('```json\n{"a":1,}\n```'), { ok: false, reason: 'invalid-json' });
});

test('extractJson: scalars, empty and prose are not answers', () => {
  assert.deepEqual(extractJson('42'), { ok: false, reason: 'not-object' });
  assert.deepEqual(extractJson('"text"'), { ok: false, reason: 'not-object' });
  assert.deepEqual(extractJson('null'), { ok: false, reason: 'not-object' });
  assert.deepEqual(extractJson(''), { ok: false, reason: 'empty' });
  assert.deepEqual(extractJson('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(extractJson(undefined), { ok: false, reason: 'empty' });
  assert.deepEqual(extractJson('I cannot answer that.'), { ok: false, reason: 'no-json' });
});

test('sentinel: a trailing-comma object must not come back as ok', () => {
  const r = extractJson('{"ok":true,}');
  assert.equal(r.ok, false);
  assert.equal(r.json, undefined);
});
