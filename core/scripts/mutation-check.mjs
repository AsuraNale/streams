#!/usr/bin/env node
// Each check of the core named here must be able to fail: break a copy of core/ on purpose (a folder under the OS temp
// folder, made with mkdirSync), run the check there, and see it fail; the same check on an unbroken copy passes. The
// originals are never edited — the files the mutants edit are hashed before and after.
//   node core/scripts/mutation-check.mjs              all of them
//   node core/scripts/mutation-check.mjs <id> …       some
// (The desktop's own mutants: desktop/scripts/mutation-check.mjs.)
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MUTANTS = [
  {
    id: 'b-hash-whole-config',
    what: 'a card\'s baseHash covers the whole configuration again, not only the part the card changes (v2 package G, 11-09)',
    edits: [['src/proposals/proposals.mjs', 'hashOf(snapshot(libraryDir, HASH_FIELDS[kind]))', "hashOf(snapshot(libraryDir, ['brief', 'sources', 'topics', 'thresholds', 'schedule', 'cap']))"]],
    test: ['test/proposals.test.mjs', '--test-name-pattern=UC3: an add_source'],
  },
  // redesign R2 (docs/checks/2026-11-11-r2/contract.md 「测」)
  {
    id: 'r2-dismiss-placeholder',
    what: 'a dismissal without a reason gets a made-up placeholder reason in the ledger',
    edits: [['src/pipeline/decide.mjs', "  if (words !== '') ev.reason = words;", "  ev.reason = words !== '' ? words : '未说明';"]],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-2 dismiss with no reason'],
  },
  {
    id: 'r2-move-writes-notes',
    what: '移入待看 also keeps the item (a note file is written) instead of only putting it in the inbox',
    edits: [['src/pipeline/decide.mjs', "  appendEvent(libraryDir, { ts, ev: 'inbox', url, moved: 'rejected', from: below.gate });\n  return { url };", "  appendEvent(libraryDir, { ts, ev: 'inbox', url, moved: 'rejected', from: below.gate });\n  keep(libraryDir, url, { now });\n  return { url };"]],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-4 moveToInbox'],
  },
  {
    id: 'r2-calls-part-off',
    what: 'one part of the run\'s calls is off by one (核验 counts one call too many)',
    edits: [['src/pipeline/round.mjs', '    callsBy.verify += judged;', '    callsBy.verify += judged + 1;']],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-6 callsBy'],
  },
  {
    id: 'r2-later-kept',
    what: 'releaseLater leaves the 稍后 file in place (the items never come back to 待看)',
    edits: [['src/pipeline/later.mjs', '  unlinkSync(path);\n  return { released };', '  return { released };']],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-3 later'],
  },
  // redesign R3 (docs/checks/2026-11-11-r3/contract.md 「测」)
  {
    id: 'r3-all-lists-caught',
    what: '资料库 「全部」 also lists the caught items that have no file (the old 「抓到的」)',
    edits: [['src/library/browse.mjs', "    items = readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e));", "    items = [...readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e)), ...(view === 'all' ? caughtItems(libraryDir, { topics, days, now }) : [])];"]],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-1'],
  },
  {
    id: 'r3-graph-caught',
    what: 'the graph also draws the ledger items that have no file',
    edits: [
      ['src/graph/graph.mjs', "import { cmp, entryFilter } from '../library/browse.mjs';", "import { cmp, entryFilter, listLibrary } from '../library/browse.mjs';"],
      ['src/graph/graph.mjs', "  const items = readIndex(libraryDir).filter((e) => (status === 'all' || e.status === 'kept') && keep(e));", "  const items = [...readIndex(libraryDir), ...listLibrary(libraryDir, { view: 'caught' }).items.map((c) => ({ id: c.url, title: c.title, topics: [], source_name: c.source, date: c.date, status: 'kept' }))].filter((e) => (status === 'all' || e.status === 'kept') && keep(e));"],
    ],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-2'],
  },
  {
    id: 'r3-header-changes-body',
    what: 'writing a header also changes the body (a line added at its end)',
    edits: [['src/library/write-note.mjs', "  const bytes = Buffer.concat([bom, Buffer.from(serializeFrontmatter(header), 'utf8'), body]);", "  const bytes = Buffer.concat([bom, Buffer.from(serializeFrontmatter(header), 'utf8'), body, Buffer.from('\\n')]);"]],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-4'],
  },
  {
    id: 'r3-snippet-marks',
    what: 'a search snippet is cut from the raw body again (its Markdown marks show)',
    edits: [['src/library/search.mjs', '    snippet: snippetOf(plainBody(body), tokens, entry.summary),', '    snippet: snippetOf(body, tokens, entry.summary),']],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=search snippets'],
  },
  {
    id: 'r3-edit-source',
    what: '编辑 also takes the source (a record field)',
    edits: [['src/library/edit.mjs', "export const EDITABLE_KEYS = ['title', 'topics', 'body'];", "export const EDITABLE_KEYS = ['title', 'topics', 'body', 'source'];"]],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-3'],
  },
];

function runTest(dir, [file, ...opts]) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...opts, file], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  const failed = [...r.stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  const passed = [...r.stdout.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { status: r.status, failed, passed, tail: `${r.stdout}${r.stderr}`.split('\n').slice(-25).join('\n') };
}

const only = process.argv.slice(2);
const chosen = MUTANTS.filter((m) => only.length === 0 || only.includes(m.id));
if (only.some((id) => !MUTANTS.some((m) => m.id === id))) { process.stderr.write(`ids: ${MUTANTS.map((m) => m.id).join(', ')}\n`); process.exit(2); }
const targets = [...new Set(chosen.flatMap((m) => m.edits.map((e) => e[0])))];
const hashes = () => Object.fromEntries(targets.map((f) => [f, createHash('sha256').update(readFileSync(join(CORE, f))).digest('hex')]));
const before = hashes();
const results = [];
for (const m of chosen) {
  const root = join(tmpdir(), `st-core-mutant-${m.id}-${randomBytes(4).toString('hex')}`);
  mkdirSync(root);
  try {
    const copy = join(root, 'core');
    cpSync(CORE, copy, { recursive: true });
    const control = runTest(copy, m.test);
    for (const [file, from, to] of m.edits) {
      const path = join(copy, file);
      const text = readFileSync(path, 'utf8');
      if (text.split(from).length !== 2) throw new Error(`${m.id}: the text is not in ${file} exactly once`);
      writeFileSync(path, text.replace(from, () => to));
    }
    const broken = runTest(copy, m.test);
    const caught = control.status === 0 && control.passed.length > 0 && broken.status !== 0 && broken.failed.length > 0;
    results.push({ id: m.id, caught });
    process.stdout.write(`${caught ? 'CAUGHT ' : 'MISSED '} ${m.id} · control ${control.status === 0 ? 'passes' : 'FAILS'} (${control.passed.length} ok) · broken copy ${broken.status !== 0 ? 'fails' : 'PASSES'}: ${broken.failed.join(' | ')}\n`);
    if (!caught) process.stdout.write(`--- control\n${control.tail}\n--- broken\n${broken.tail}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const untouched = JSON.stringify(before) === JSON.stringify(hashes());
process.stdout.write(`${JSON.stringify({ mutants: results.length, caught: results.filter((r) => r.caught).length, originals_unchanged: untouched })}\n`);
process.exit(results.every((r) => r.caught) && untouched ? 0 : 1);
