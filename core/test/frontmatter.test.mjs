import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, serializeFrontmatter, KEY_ORDER } from '../src/library/frontmatter.mjs';
import { SPEC_SAMPLE_COMMENTED, SPEC_HEADER, SPEC_BODY, SPEC_META } from './support/fixtures.mjs';

// 对照 test_pipeline.py::test_index (frontmatter title / inline list) and index_db.parse_frontmatter,
// but stricter: unknown syntax is an error with a line number, not silently ignored.

test('parse: the spec sample (with comments) yields the documented meta and body', () => {
  const r = parseFrontmatter(SPEC_SAMPLE_COMMENTED);
  assert.equal(r.ok, true);
  assert.deepEqual(r.meta, SPEC_META);
  assert.equal(r.body, SPEC_BODY);
  assert.equal(typeof r.meta.scores.relevance.score, 'number');
});

test('parse -> serialize reproduces the spec header byte for byte (comments dropped)', () => {
  const r = parseFrontmatter(SPEC_SAMPLE_COMMENTED);
  const out = serializeFrontmatter(r.meta);
  assert.equal(out, SPEC_HEADER);
  assert.equal(Buffer.from(out, 'utf8').equals(Buffer.from(SPEC_HEADER, 'utf8')), true);
  // negative: a changed score must change the bytes (the comparison is not vacuous)
  const changed = serializeFrontmatter({ ...r.meta, scores: { ...r.meta.scores, relevance: { score: 0.87, reason: '直接讲 agent 记忆的实现' } } });
  assert.notEqual(changed, SPEC_HEADER);
});

test('serialize -> parse round-trips scalars, quoting, nesting, lists and extra keys', () => {
  const meta = {
    extra_last: 'kept after the known keys',
    scores: { relevance: { score: 1, reason: 'needs, quoting: here' }, custom: { value: 'true', reason: '' } },
    topics: ['a b', '2026', 'with, comma', ''],
    status: 'authored',
    title: 'Colon: inside',
    id: 'x',
    source: 'file:x.md',
    date: '2026-01-01',
    nested: { deep: { k: 'v', n: -3.5 }, flag: false, nothing: null },
    empty_list: [],
    empty_map: {},
    hash: '#not a comment',
    quoted: 'say "hi"\twith\\slash',
  };
  const text = serializeFrontmatter(meta) + 'body\n';
  const r = parseFrontmatter(text);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.meta, meta);
  assert.equal(r.body, 'body\n');
  // key order: known keys first in KEY_ORDER order, then the rest in insertion order
  const keys = Object.keys(r.meta);
  const known = keys.filter((k) => KEY_ORDER.includes(k));
  assert.deepEqual(known, KEY_ORDER.filter((k) => known.includes(k)));
  assert.deepEqual(keys.slice(known.length), ['extra_last', 'nested', 'empty_list', 'empty_map', 'hash', 'quoted']);
});

test('parse: quoted strings, block lists, blank/comment lines, CRLF', () => {
  const text = '---\r\ntitle: "a: b \\"c\\""\r\nsource: \'it\'\'s\'\r\n\r\n# comment line\r\ntopics:\r\n  - one\r\n  - "two"\r\nstatus: kept # trailing\r\nsame_indent_list:\r\n- x\r\n---\r\nbody line\r\n';
  const r = parseFrontmatter(text);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.meta, { title: 'a: b "c"', source: "it's", topics: ['one', 'two'], status: 'kept', same_indent_list: ['x'] });
  assert.equal(r.body, 'body line\n');
});

test('parse: empty front matter and empty values', () => {
  assert.deepEqual(parseFrontmatter('---\n---\nx').meta, {});
  const r = parseFrontmatter('---\ntopics:\nkept:\n---\n');
  assert.deepEqual(r.meta, { topics: null, kept: null });
});

test('parse: BOM before --- is tolerated', () => {
  const r = parseFrontmatter('﻿---\nid: a\n---\n');
  assert.equal(r.ok, true);
  assert.equal(r.meta.id, 'a');
});

test('parse rejects: no front matter (code no-frontmatter, line 1)', () => {
  for (const text of ['# heading\n', '', ' ---\nid: a\n---\n', '--- \nid: a\n---\n']) {
    const r = parseFrontmatter(text);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'no-frontmatter');
    assert.equal(r.error.line, 1);
    assert.equal(r.meta, null);
    assert.equal(r.body, text);
  }
});

test('parse rejects: unclosed front matter reports the last line', () => {
  const r = parseFrontmatter('---\nid: a\ntitle: b\n');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'unclosed');
  assert.equal(r.error.line, 4);
  assert.match(r.error.message, /never closed/);
});

test('parse rejects: YAML errors carry the file line number and a reason', () => {
  const cases = [
    ['---\nid: a\ntitle\n---\n', 3, /key: value/],
    ['---\nid: a\n\ttitle: b\n---\n', 3, /tab/],
    ['---\nid: a\nid: b\n---\n', 3, /duplicate key "id"/],
    ['---\ntitle: "open\n---\n', 2, /unterminated/],
    ["---\ntitle: 'open\n---\n", 2, /unterminated/],
    ['---\ntopics: [a, b\n---\n', 2, /never closed/],
    ['---\nscores:\n  r: { score: 1\n---\n', 3, /never closed/],
    ['---\nscores:\n  r: { score: [1] }\n---\n', 3, /nested/],
    ['---\ntopics: [a, [b]]\n---\n', 2, /nested/],
    ['---\ntopics: [a,, b]\n---\n', 2, /empty item/],
    ['---\nscores:\n  r: { nokey }\n---\n', 3, /key: value/],
    ['---\ntitle: "x" trailing\n---\n', 2, /unexpected text/],
    ['---\ntitle: "bad \\q escape"\n---\n', 2, /unknown escape/],
    ['---\n- a\n- b\n---\n', 2, /must be a mapping/],
    ['---\nid: a\n  title: b\n---\n', 3, /unexpected indent/],
    ['---\ntopics:\n  - a\n    - b\n---\n', 4, /nested structures/],
    ['---\n  id: a\n---\n', 2, /unexpected indent/],
  ];
  for (const [text, line, re] of cases) {
    const r = parseFrontmatter(text);
    assert.equal(r.ok, false, `should reject: ${JSON.stringify(text)}`);
    assert.equal(r.error.code, 'yaml', text);
    assert.equal(r.error.line, line, `line for ${JSON.stringify(text)}: ${r.error.message}`);
    assert.match(r.error.message, re, text);
  }
});

test('serialize rejects what it cannot represent', () => {
  assert.throws(() => serializeFrontmatter('not an object'), TypeError);
  assert.throws(() => serializeFrontmatter(null), TypeError);
  assert.throws(() => serializeFrontmatter({ 'bad key': 1 }), /invalid YAML key/);
  assert.throws(() => serializeFrontmatter({ topics: [['nested']] }), /scalars/);
  assert.throws(() => serializeFrontmatter({ scores: { r: { deep: { x: 1 } } } }), /scalar/);
  assert.throws(() => serializeFrontmatter({ n: Infinity }), /non-finite/);
  assert.throws(() => serializeFrontmatter({ f: () => 1 }), /cannot serialize/);
});

test('sentinel: a string that looks like a number must come back as a string, a number as a number', () => {
  const text = serializeFrontmatter({ title: '2026', count: 2026, date: '2026-10-31' });
  assert.equal(text, '---\ntitle: "2026"\ndate: 2026-10-31\ncount: 2026\n---\n');
  const r = parseFrontmatter(text);
  assert.equal(r.meta.title, '2026');
  assert.equal(r.meta.count, 2026);
  assert.equal(r.meta.date, '2026-10-31');
  // and the plain, unquoted form is really a number (the sentinel: a wrong parser would pass as "2026")
  assert.equal(parseFrontmatter('---\ntitle: 2026\n---\n').meta.title, 2026);
});
