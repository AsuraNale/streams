// 1.1 W8 「问库和笔记」 (docs/checks/2026-11-20-1.1/w8/scorecard.json; acceptance B1, B15, B16):
//   ask-original  问库's candidates are the kept notes (and the user's own notes); a kept note's saved original
//                 (_originals/<originalId(source)>.md) is material of that candidate too, under the same number, so the
//                 cite still names the note — a fact only the original has can be answered from the library
//   ask-scope     a library of 5 kept notes asked 10 questions: every cite of every answer is a candidate, the candidates
//                 are kept notes only; an item only in 待看 (with its original saved) is never a candidate nor in the
//                 prompt; a question the library has nothing on is notInLibrary
//   note-link     收藏 writes one line in the note that links to the saved original by a path relative to the note
//                 (../_originals/<id>.md, which Obsidian opens); the original stays in _originals, never in notes/; an item
//                 whose original was not saved says so on that line; writeNoteFile stays the only writer of notes/
//   b15           a note file with a broken header is listed as 待规范, and is not in the index, the graph or 问库's
//                 candidates; its bytes do not change
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ask, askCandidates, ORIGINAL_CHARS } from '../src/ask/ask.mjs';
import { keep } from '../src/pipeline/decide.mjs';
import { putInInbox, putMissingInInbox } from '../src/update/inbox.mjs';
import { saveOriginal, originalId, ORIGINALS_DIR } from '../src/read/original.mjs';
import { readIndex, rebuildIndex } from '../src/library/index.mjs';
import { listPending } from '../src/library/pending.mjs';
import { graph } from '../src/graph/graph.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { makeLibrary, keepNote, TEST_CONFIG } from './support/fixtures.mjs';

const NOW = () => new Date('2026-11-22T16:00:00.000Z');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// the original says a number the note's summary does not
const FACT = '记忆块的上限是 8192 个 token';
const ORIGINAL_TEXT = `Letta 今天发布了 memory blocks 接口。\n\n${FACT}，超过以后旧的内容会被压缩。\n`;

function checked(what) {
  return { status: 'checked', summary: { what, points: [] }, verification: { passed: true, rounds: 1, failed: [] }, original: { saved: true, method: 'direct' }, history: [] };
}

// An item put in 待看 the way an update puts it: its original saved first, then the checked card
function inboxItem(dir, { url, title, what, text = null }) {
  if (text) saveOriginal(dir, { url, title, text, method: 'direct', fetchedAt: NOW() });
  if (text) putInInbox(dir, { item: { url, title, source: 'example', date: '2026-11-20' }, checked: checked(what), now: NOW });
  else putMissingInInbox(dir, { item: { url, title, source: 'example', date: '2026-11-20' }, now: NOW });
}

// main slot -> answer(req, n); verify slot -> every judge item passes
function connector(answer, seen = []) {
  return fakeConnector({
    mode: 'counting',
    json: (req, n) => {
      seen.push(req);
      if (req.model === 'verify') {
        const ids = [...req.prompt.matchAll(/^\[([a-z-]+)\] /gm)].map((m) => m[1]);
        return { items: ids.map((id) => ({ id, passed: true, evidence: 'ok' })) };
      }
      return answer(req, n);
    },
  });
}

const LETTA = 'https://example.test/letta-blocks';

test('ask-original: a kept note\'s saved original is material of that candidate; the answer from it cites the note', async () => {
  const dir = makeLibrary('w8-original');
  inboxItem(dir, { url: LETTA, title: 'Letta memory blocks', what: 'Letta 发布了 memory blocks 接口。', text: ORIGINAL_TEXT });
  const { id } = keep(dir, LETTA, { now: NOW });
  const note = readFileSync(join(dir, 'notes', `${id}.md`), 'utf8');
  assert.equal(note.includes('8192'), false, 'control: the note itself does not have the number');

  const cands = askCandidates(dir, 'Letta memory blocks 的上限是多少？');
  assert.deepEqual(cands.map((c) => c.id), [id]);
  assert.ok(cands[0].original.includes(FACT), 'the candidate carries its original');

  const seen = [];
  const conn = connector((req) => {
    const main = req.prompt;
    assert.ok(main.includes(FACT), 'the model is given the original\'s words');
    return { answer: [{ text: '记忆块的上限是 8192 个 token。', cites: [1] }], notInLibrary: false, missing: '', claimed: [] };
  }, seen);
  const r = await ask(dir, 'Letta memory blocks 的上限是多少？', { connector: conn, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.notInLibrary, false);
  assert.deepEqual(r.sources.map((s) => s.id), [id], 'the cite names the note, not the original file');
  assert.deepEqual(r.answer, [{ text: '记忆块的上限是 8192 个 token。', cites: [1] }]);
  const judge = seen.find((q) => q.model === 'verify');
  assert.ok(judge && judge.prompt.includes(FACT), 'the check reads the same material, original included');
});

test('ask-original: an original is cut at ORIGINAL_CHARS; a note without a saved original has none', () => {
  const dir = makeLibrary('w8-original-cut');
  const long = 'https://example.test/long';
  inboxItem(dir, { url: long, title: 'Long memory page', what: '一页很长的。', text: `${'长'.repeat(ORIGINAL_CHARS + 500)}\n` });
  keep(dir, long, { now: NOW });
  keepNote(dir, 'plain-memory', { title: 'Plain memory note', source: 'https://example.test/plain' }, '没有原文的笔记。\n');
  rebuildIndex(dir);
  const c = askCandidates(dir, 'memory');
  const byTitle = Object.fromEntries(c.map((x) => [x.title, x]));
  assert.equal(Array.from(byTitle['Long memory page'].original).length, ORIGINAL_CHARS);
  assert.equal(byTitle['Plain memory note'].original, '');
});

const KEPT = [
  ['https://example.test/k1', 'Letta memory blocks', 'Letta 发布了记忆块。'],
  ['https://example.test/k2', 'MemGPT memory tiers', 'MemGPT 分层记忆。'],
  ['https://example.test/k3', 'MCP registry launch', 'MCP 注册表上线。'],
  ['https://example.test/k4', 'Agent eval harness', '一套 agent 评测工具。'],
  ['https://example.test/k5', 'RAG chunking study', '关于 RAG 切块的研究。'],
];
const INBOX_ONLY = ['https://example.test/inbox-only', 'Memory vault inbox item', '只在待看里的记忆条目。'];
const QUESTIONS = [
  'Letta memory blocks 是什么？', 'MemGPT memory 怎么分层？', 'MCP registry 什么时候上线？', 'Agent eval 用什么工具？', 'RAG chunking 有什么发现？',
  'memory 方面有哪些进展？', 'memory vault 是什么？', 'agent memory 和 MCP 有什么关系？', 'chunking 和 memory 能一起用吗？', '量子计算 blockchain 有什么新闻？',
];

test('ask-scope: 5 kept notes, 10 questions: every cite is a candidate, candidates are kept notes only, the 待看 item never shows', async () => {
  const dir = makeLibrary('w8-scope');
  const keptIds = [];
  for (const [url, title, what] of KEPT) {
    inboxItem(dir, { url, title, what, text: `${title}：${what}原文。\n` });
    keptIds.push(keep(dir, url, { now: NOW }).id);
  }
  inboxItem(dir, { url: INBOX_ONLY[0], title: INBOX_ONLY[1], what: INBOX_ONLY[2], text: `${INBOX_ONLY[1]} 的原文：vault 存放记忆。\n` });
  assert.equal(readIndex(dir).length, 5, 'control: five notes in the index');
  assert.ok(existsSync(join(dir, ORIGINALS_DIR, `${originalId(INBOX_ONLY[0])}.md`)), 'control: the 待看 item has its original saved');

  let notIn = 0;
  for (const [i, q] of QUESTIONS.entries()) {
    const prompts = [];
    // the model cites every number it was given, and once a number that is not one (it must not survive)
    const conn = connector((req) => {
      const ns = [...req.prompt.matchAll(/^\[(\d+)\] /gm)].map((m) => Number(m[1]));
      return ns.length === 0
        ? { answer: [], notInLibrary: true, missing: q, claimed: [] }
        : { answer: [{ text: `第 ${i + 1} 题的回答。`, cites: i === 3 ? [...ns, 99] : ns }], notInLibrary: false, missing: '', claimed: [] };
    }, prompts);
    const cands = askCandidates(dir, q);
    const r = await ask(dir, q, { connector: conn, now: NOW });
    assert.equal(r.ok, true, q);
    for (const c of cands) assert.ok(keptIds.includes(c.id), `${q}: candidate ${c.id} is a kept note`);
    const candIds = r.candidates.map((c) => c.id);
    for (const s of r.sources) assert.ok(candIds.includes(s.id), `${q}: source ${s.id} is a candidate`);
    for (const a of r.answer) for (const n of a.cites) assert.ok(n >= 1 && n <= r.candidates.length, `${q}: cite ${n} in 1..${r.candidates.length}`);
    for (const p of prompts) {
      assert.equal(p.prompt.includes(INBOX_ONLY[1]), false, `${q}: the 待看 item's title is not in any prompt`);
      assert.equal(p.prompt.includes('vault 存放记忆'), false, `${q}: the 待看 item's original is not in any prompt`);
    }
    if (r.notInLibrary) notIn += 1;
    if (i === 3) assert.deepEqual(r.removedCites, [99], 'a number outside the candidates is taken out');
    if (i === 9) assert.equal(r.notInLibrary, true, 'nothing in the library on it: notInLibrary');
  }
  assert.ok(notIn >= 1);
});

test('note-link: 收藏 writes a line linking to the saved original (relative to the note); without one, the line says so', () => {
  const dir = makeLibrary('w8-link');
  inboxItem(dir, { url: LETTA, title: 'Letta memory blocks', what: 'Letta 发布了 memory blocks 接口。', text: ORIGINAL_TEXT });
  const missing = 'https://example.test/unreadable';
  inboxItem(dir, { url: missing, title: 'Unreadable page' });
  const a = keep(dir, LETTA, { now: NOW });
  const b = keep(dir, missing, { now: NOW });

  const notePath = join(dir, 'notes', `${a.id}.md`);
  const body = readFileSync(notePath, 'utf8');
  const m = /^\*\*原文：\*\*\[[^\]]+\]\(([^)]+)\)$/m.exec(body);
  assert.ok(m, `the note has the line: ${body}`);
  const target = resolve(dirname(notePath), m[1]);
  assert.equal(target, resolve(dir, ORIGINALS_DIR, `${originalId(LETTA)}.md`), 'the link lands on the saved original');
  assert.ok(existsSync(target));
  assert.ok(!m[1].startsWith('/') && !/^[A-Za-z]:/.test(m[1]), 'a relative path');
  assert.ok(readFileSync(target, 'utf8').includes(FACT), 'the original is the page\'s own words');

  const other = readFileSync(join(dir, 'notes', `${b.id}.md`), 'utf8');
  assert.match(other, /^\*\*原文：\*\*原文没存下来$/m);
  assert.equal(/\]\(\.\.\/_originals\//.test(other), false);

  assert.deepEqual(readdirSync(join(dir, 'notes')).sort(), [`${a.id}.md`, `${b.id}.md`].sort(), 'notes/ holds the two notes and no original');
  assert.deepEqual(readdirSync(join(dir, ORIGINALS_DIR)), [`${originalId(LETTA)}.md`]);
  assert.deepEqual(readIndex(dir).map((e) => e.links_unresolved ?? []), [[], []], 'the link is not a [[link]]: nothing unresolved in the graph');
});

test('note-link: an English library writes the line in English', () => {
  const dir = makeLibrary('w8-link-en', { ...TEST_CONFIG, pipeline: { ...(TEST_CONFIG.pipeline ?? {}), language: 'en' } });
  inboxItem(dir, { url: LETTA, title: 'Letta memory blocks', what: 'Letta released memory blocks.', text: ORIGINAL_TEXT });
  const { id } = keep(dir, LETTA, { now: NOW });
  assert.match(readFileSync(join(dir, 'notes', `${id}.md`), 'utf8'), /^\*\*Original:\*\* \[[^\]]+\]\(\.\.\/_originals\/[0-9a-f]{16}\.md\)$/m);
});

test('b15: a note with a broken header is 待规范, not in the index, the graph or 问库; its bytes do not change', async () => {
  const dir = makeLibrary('w8-b15');
  keepNote(dir, 'good-memory', { title: 'Good memory note' }, 'memory 正常的笔记。\n');
  const bad = join(dir, 'notes', 'broken-memory.md');
  writeFileSync(bad, '---\ntitle: Broken memory note\nstatus: [kept\n---\nmemory 写坏的笔记，库里只有它说 vault。\n', 'utf8');
  const before = sha(bad);
  rebuildIndex(dir);

  assert.ok(listPending(dir).some((p) => p.file.endsWith('broken-memory.md')), '待规范 lists it');
  assert.deepEqual(readIndex(dir).map((e) => e.id), ['good-memory'], 'the index has the good note only');
  const g = graph(dir, { now: NOW });
  assert.equal(JSON.stringify(g).includes('broken-memory'), false, 'not in the graph');
  assert.ok(JSON.stringify(g).includes('good-memory'), 'control: the graph has the good note');
  assert.equal(askCandidates(dir, 'memory vault').some((c) => c.id === 'broken-memory'), false, 'not a candidate');
  const prompts = [];
  await ask(dir, 'memory vault 是什么？', { connector: connector(() => ({ answer: [], notInLibrary: true, missing: 'vault', claimed: [] }), prompts), now: NOW });
  for (const p of prompts) assert.equal(p.prompt.includes('vault。'), false, 'its words are not in the prompt');
  assert.equal(sha(bad), before, 'the file is byte for byte the same');
});
