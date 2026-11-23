import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateNote, NOTE_STATUSES, REQUIRED_FIELDS, isIsoDate } from '../src/library/validate.mjs';
import { serializeFrontmatter } from '../src/library/frontmatter.mjs';
import { SPEC_SAMPLE_COMMENTED, SPEC_META, SPEC_ID, SPEC_BODY, TEST_CONFIG } from './support/fixtures.mjs';

const FILE = `${SPEC_ID}.md`;

function noteText(metaOverrides = {}, { drop = [] } = {}) {
  const meta = { ...SPEC_META, ...metaOverrides };
  for (const k of drop) delete meta[k];
  return serializeFrontmatter(meta) + SPEC_BODY;
}

function codes(r) {
  return r.problems.map((p) => p.code);
}

test('exports: statuses and required fields match spec v0', () => {
  assert.deepEqual(NOTE_STATUSES, ['kept', 'authored', 'archived']);
  assert.deepEqual(REQUIRED_FIELDS, ['id', 'title', 'source', 'date', 'status', 'topics']);
});

test('the spec sample conforms: ok, no problems, no warnings', () => {
  const r = validateNote({ fileName: FILE, text: SPEC_SAMPLE_COMMENTED, config: TEST_CONFIG });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.meta, SPEC_META);
  assert.equal(r.body, SPEC_BODY);
});

test('each required field missing or empty -> missing:<field>, not ok', () => {
  for (const f of REQUIRED_FIELDS) {
    for (const variant of [{ drop: [f] }, { set: { [f]: '' } }, { set: { [f]: null } }]) {
      const text = variant.drop ? noteText({}, { drop: variant.drop }) : noteText(variant.set);
      const r = validateNote({ fileName: FILE, text, config: TEST_CONFIG });
      assert.equal(r.ok, false, `${f} ${JSON.stringify(variant)}`);
      assert.ok(codes(r).includes(`missing:${f}`), `${f} ${JSON.stringify(variant)} -> ${codes(r)}`);
    }
  }
  const r = validateNote({ fileName: FILE, text: noteText({ topics: [] }), config: TEST_CONFIG });
  assert.deepEqual(codes(r), ['missing:topics']);
});

test('id must equal the file name without .md', () => {
  const r = validateNote({ fileName: 'other-name.md', text: SPEC_SAMPLE_COMMENTED, config: TEST_CONFIG });
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['id-mismatch']);
  assert.match(r.problems[0].message, /other-name/);
  // path prefixes are ignored, only the base name counts
  assert.equal(validateNote({ fileName: `C:/lib/notes/${FILE}`, text: SPEC_SAMPLE_COMMENTED, config: TEST_CONFIG }).ok, true);
});

test('dates: real ISO calendar dates only', () => {
  assert.equal(isIsoDate('2026-10-31'), true);
  assert.equal(isIsoDate('2024-02-29'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2025-02-29', '31/10/2026', '2026-1-1', '2026-10-31T00:00', 20261031, '', null]) {
    assert.equal(isIsoDate(bad), false, String(bad));
  }
  for (const f of ['date', 'collected', 'kept']) {
    const r = validateNote({ fileName: FILE, text: noteText({ [f]: '2026-02-30' }), config: TEST_CONFIG });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [`bad-date:${f}`]);
    assert.match(r.problems[0].message, /2026-02-30/);
  }
  // a numeric value for a date is also rejected (YAML would make `date: 2026` a number)
  assert.deepEqual(codes(validateNote({ fileName: FILE, text: noteText({ date: 2026 }), config: TEST_CONFIG })), ['bad-date:date']);
});

test('status must be kept | authored | archived', () => {
  for (const s of ['authored', 'archived']) {
    assert.equal(validateNote({ fileName: FILE, text: noteText({ status: s }), config: TEST_CONFIG }).ok, true);
  }
  for (const s of ['Kept', 'draft', 'pending', 'inbox']) {
    const r = validateNote({ fileName: FILE, text: noteText({ status: s }), config: TEST_CONFIG });
    assert.deepEqual(codes(r), ['bad-status'], s);
    assert.match(r.problems[0].message, new RegExp(s));
  }
});

test('topics must be a non-empty list of names', () => {
  assert.deepEqual(codes(validateNote({ fileName: FILE, text: noteText({ topics: 'agent 记忆' }), config: TEST_CONFIG })), ['bad-topics']);
  assert.deepEqual(codes(validateNote({ fileName: FILE, text: noteText({ topics: ['agent 记忆', ''] }), config: TEST_CONFIG })), ['bad-topics']);
  assert.deepEqual(codes(validateNote({ fileName: FILE, text: noteText({ topics: [1] }), config: TEST_CONFIG })), ['bad-topics']);
});

test('scores must map gate id -> { score } or { value } (plus reason)', () => {
  assert.equal(validateNote({ fileName: FILE, text: noteText({}, { drop: ['scores'] }), config: TEST_CONFIG }).ok, true);
  assert.equal(validateNote({ fileName: FILE, text: noteText({ scores: {} }), config: TEST_CONFIG }).ok, true);
  const bad = [
    { scores: 'high' },
    { scores: { relevance: 0.9 } },
    { scores: { relevance: { reason: 'no score or value' } } },
    { scores: { relevance: { score: '0.9' } } },
    { scores: { relevance: { score: 0.9, value: 'new' } } },
  ];
  for (const b of bad) {
    const r = validateNote({ fileName: FILE, text: noteText(b), config: TEST_CONFIG });
    assert.equal(r.ok, false, JSON.stringify(b));
    assert.ok(codes(r).every((c) => c === 'bad-scores'), JSON.stringify(b));
    assert.ok(r.problems.length >= 1);
  }
});

test('text fields must be plain text (numbers coerced, lists refused)', () => {
  const r = validateNote({ fileName: '2026.md', text: noteText({ id: 2026, title: 42 }), config: TEST_CONFIG });
  assert.equal(r.ok, true);
  assert.equal(r.meta.id, '2026');
  assert.equal(r.meta.title, '42');
  const bad = validateNote({ fileName: FILE, text: noteText({ title: ['a', 'b'] }), config: TEST_CONFIG });
  assert.deepEqual(codes(bad), ['bad-title']);
});

test('no front matter / broken front matter -> problem with line number, meta null, body kept', () => {
  const none = validateNote({ fileName: FILE, text: '# Just a heading\n\ntext\n', config: TEST_CONFIG });
  assert.equal(none.ok, false);
  assert.deepEqual(codes(none), ['no-frontmatter']);
  assert.equal(none.problems[0].line, 1);
  assert.equal(none.meta, null);
  assert.equal(none.body, '# Just a heading\n\ntext\n');

  const unclosed = validateNote({ fileName: FILE, text: '---\nid: x\n', config: TEST_CONFIG });
  assert.deepEqual(codes(unclosed), ['bad-frontmatter']);
  assert.equal(unclosed.problems[0].line, 3);

  const yaml = validateNote({ fileName: FILE, text: '---\nid: x\ntitle\n---\n', config: TEST_CONFIG });
  assert.deepEqual(codes(yaml), ['bad-frontmatter']);
  assert.equal(yaml.problems[0].line, 3);
  assert.match(yaml.problems[0].message, /key: value/);
});

// 1.1 W7b: a score key is no longer held against v1.0's scoring steps (unknown-score is gone); a v1.0 note's scores are data
test('warnings: an unknown topic is flagged but still ok; a score key of any name is not', () => {
  const r = validateNote({ fileName: FILE, text: noteText({ topics: ['agent 记忆', '不存在的主题'], scores: { ...SPEC_META.scores, legacy: { score: 0.5, reason: 'old gate' } } }), config: TEST_CONFIG });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.warnings.map((w) => w.code), ['unknown-topic:不存在的主题']);
  assert.match(r.warnings[0].message, /不存在的主题/);
  assert.deepEqual(r.meta.scores.legacy, { score: 0.5, reason: 'old gate' }, 'the score is kept as it is');
  // known topic -> no warning (the check is not firing on everything)
  assert.deepEqual(validateNote({ fileName: FILE, text: SPEC_SAMPLE_COMMENTED, config: TEST_CONFIG }).warnings, []);
  // no config -> no warnings at all
  assert.deepEqual(validateNote({ fileName: FILE, text: noteText({ topics: ['不存在的主题'] }), config: null }).warnings, []);
});

test('argument checks', () => {
  assert.throws(() => validateNote({ fileName: '', text: 'x' }), TypeError);
  assert.throws(() => validateNote({ fileName: 'a.md', text: 42 }), TypeError);
});

test('sentinel: a note wrong in every way is refused with every reason listed', () => {
  const text = '---\nid: wrong\nstatus: pending\ndate: 2026-02-30\ntopics: []\n---\nbody\n';
  const r = validateNote({ fileName: FILE, text, config: TEST_CONFIG });
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r).sort(), ['bad-date:date', 'bad-status', 'id-mismatch', 'missing:source', 'missing:title', 'missing:topics']);
});
