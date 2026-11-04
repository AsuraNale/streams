// Importing a folder of the user's own .md files (core-api 5.9, plan A3 / mockup S8): notesDir, the first level only,
// importFolder, applyProposedHeader, listPending's bodyHash / nameOk. Every "nothing was touched" claim is a byte
// comparison of every file that was there before, each with a reverse case that the same comparison sees a change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { caseDir } from './support/tmp.mjs';
import { TEST_CONFIG } from './support/fixtures.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, ctx, CLOCK } from './support/pipeline.mjs';
import { readConfig } from '../src/library/config.mjs';
import { notesDir, scanLibrary, listNoteFiles } from '../src/library/scan.mjs';
import { importFolder, createLibrary } from '../src/library/create.mjs';
import { listPending, pendingView, applyProposedHeader, bodyHashOf, localDate } from '../src/library/pending.mjs';
import { readIndex } from '../src/library/index.mjs';
import { parseFrontmatter, splitNoteBytes } from '../src/library/frontmatter.mjs';
import { validateNote } from '../src/library/validate.mjs';
import { editNote } from '../src/library/edit.mjs';
import { readNote, listLibrary } from '../src/library/browse.mjs';
import { search } from '../src/library/search.mjs';
import { graph } from '../src/graph/graph.mjs';
import { runRound } from '../src/pipeline/round.mjs';
import { keep } from '../src/pipeline/decide.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';

const MTIME = new Date('2026-10-20T15:00:00.000Z');
const sha = (b) => createHash('sha256').update(b).digest('hex');

// every file under dir (relative path with "/" -> sha256)
function hashTree(dir, base = dir, out = {}) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) hashTree(p, base, out);
    else out[relative(base, p).replace(/\\/g, '/')] = sha(readFileSync(p));
  }
  return out;
}

const FILES = {
  'plain.md': '# 记忆方案选型\r\n\r\n比较了三种做法。\r\n最后一行没有换行',
  'half.md': '---\nid: half\ntitle: 2025 读书笔记\nstatus: authored\ntopics: [阅读]\n---\n正文第一行\n\n',
  'fine.md': '---\nid: fine\ntitle: 合规范的一条\nsource: file:fine.md\ndate: 2026-09-01\nstatus: authored\ntopics: [阅读]\n---\n已经合规范。\n',
  'sub/deep.md': '# 子文件夹里的\n',
  '.obsidian/app.json': '{}',
  'picture.png': 'not really a picture',
};

function userFolder(name, files = FILES) {
  const dir = caseDir(name);
  for (const [rel, text] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text, 'utf8');
    utimesSync(p, MTIME, MTIME);
  }
  return dir;
}

// ---------------------------------------------------------------- notesDir

test('notesDir: default notes, "." is the library folder, a sub path is allowed; absolute / drive / ".." / empty are invalid-shape', () => {
  const dir = caseDir('import-notesdir');
  assert.equal(notesDir(dir), join(dir, 'notes'), 'no streams.json at all: the default');
  const put = (v) => writeFileSync(join(dir, 'streams.json'), JSON.stringify({ ...TEST_CONFIG, ...(v === undefined ? {} : { notesDir: v }) }), 'utf8');
  put(undefined);
  assert.equal(notesDir(dir), join(dir, 'notes'));
  put('.');
  assert.equal(notesDir(dir), dir);
  put('vault/notes');
  assert.equal(notesDir(dir), join(dir, 'vault', 'notes'));
  for (const bad of ['../x', 'C:/x', 'C:x', '/x', '\\\\server\\share', 'a/../b', 'a\\..\\b', '..', '', '  ', 5, null, ['notes']]) {
    put(bad);
    const r = readConfig(dir);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(r.error.code, 'invalid-shape', JSON.stringify(bad));
    assert.throws(() => notesDir(dir), (e) => e.code === 'config:invalid-shape', JSON.stringify(bad));
    assert.throws(() => scanLibrary(dir), (e) => e.code === 'config:invalid-shape', JSON.stringify(bad));
  }
});

test('scanLibrary reads only the first level: sub folders are listed in skippedDirs (not _pipeline, not .obsidian), their files are not read', () => {
  const dir = userFolder('import-first-level');
  writeFileSync(join(dir, 'streams.json'), JSON.stringify({ ...TEST_CONFIG, notesDir: '.' }), 'utf8');
  mkdirSync(join(dir, '_pipeline', 'inbox'), { recursive: true });
  writeFileSync(join(dir, '_pipeline', 'inbox', 'x.md'), 'an inbox file', 'utf8');
  const scan = scanLibrary(dir);
  assert.deepEqual(scan.skippedDirs, ['sub']);
  assert.deepEqual([...scan.valid.map((v) => v.file), ...scan.pending.map((p) => p.file)].sort(), ['fine.md', 'half.md', 'plain.md']);
  assert.deepEqual(listNoteFiles(dir), ['fine.md', 'half.md', 'plain.md']);
  // a default library: notes/ sub folders are reported relative to the library folder
  const lib = caseDir('import-first-level-notes');
  createLibrary(lib, { name: 'n' });
  mkdirSync(join(lib, 'notes', 'old'));
  assert.deepEqual(scanLibrary(lib).skippedDirs, ['notes/old']);
  assert.deepEqual(pendingView(lib), { items: [], skippedDirs: ['notes/old'] });
});

// ---------------------------------------------------------------- importFolder

test('importFolder: streams.json (notesDir ".") and _pipeline/ beside the files, every file that was there byte for byte the same', () => {
  const dir = userFolder('import-folder');
  const before = hashTree(dir);
  const r = importFolder(dir, { name: '我的笔记' });
  assert.deepEqual(r, { libraryDir: dir, notes: 1, pending: 2, skippedDirs: ['sub'] });
  const after = hashTree(dir);
  for (const [rel, h] of Object.entries(before)) assert.equal(after[rel], h, `${rel} is untouched (not moved, renamed or changed)`);
  const added = Object.keys(after).filter((k) => !(k in before)).sort();
  assert.deepEqual(added, ['_pipeline/fetch_log.jsonl', '_pipeline/ledger.jsonl', 'index.jsonl', 'index.meta.json', 'streams.json']);
  for (const d of ['inbox', 'cache', 'logs']) assert.ok(statSync(join(dir, '_pipeline', d)).isDirectory(), d);
  const cfg = readConfig(dir);
  assert.equal(cfg.ok, true);
  assert.equal(cfg.config.notesDir, '.');
  assert.equal(cfg.config.name, '我的笔记');
  assert.ok(Array.isArray(cfg.config.pipeline.nodes) && cfg.config.pipeline.nodes.length > 0, 'the default pipeline');
  assert.deepEqual(readIndex(dir).map((e) => e.id), ['fine']);
  assert.deepEqual(listPending(dir).map((p) => p.file), ['half.md', 'plain.md']);
  // reverse: the same comparison sees a one-byte change
  writeFileSync(join(dir, 'plain.md'), FILES['plain.md'] + '\n', 'utf8');
  assert.notEqual(hashTree(dir)['plain.md'], before['plain.md']);
});

test('importFolder refuses: a library already (exists), no .md on the first level (nothing-to-import), no folder (not-found); nothing is written', () => {
  const dir = userFolder('import-twice');
  importFolder(dir, { name: 'x' });
  const once = hashTree(dir);
  assert.throws(() => importFolder(dir, { name: 'x' }), (e) => e.code === 'exists');
  assert.deepEqual(hashTree(dir), once);
  const deepOnly = userFolder('import-nothing', { 'sub/deep.md': '# x\n', 'readme.txt': 'x' });
  const before = hashTree(deepOnly);
  assert.throws(() => importFolder(deepOnly, { name: 'x' }), (e) => e.code === 'nothing-to-import');
  assert.deepEqual(hashTree(deepOnly), before);
  assert.deepEqual(readdirSync(deepOnly).sort(), ['readme.txt', 'sub']);
  assert.throws(() => importFolder(join(deepOnly, 'missing'), { name: 'x' }), (e) => e.code === 'not-found');
  const left = userFolder('import-left-over', { 'a.md': 'x', '_pipeline/ledger.jsonl': '' });
  assert.throws(() => importFolder(left, { name: 'x' }), (e) => e.code === 'exists');
  assert.equal(existsSync(join(left, 'streams.json')), false);
  assert.throws(() => importFolder(dir, {}), (e) => e.code === 'bad-argument');
});

// ---------------------------------------------------------------- listPending: bodyHash, nameOk, the proposal

test('listPending on an imported folder: bodyHash is the body bytes\' sha256, nameOk says whether the name can be an id, a proposal per fixable file', () => {
  const dir = userFolder('import-pending', { ...FILES, 'a(b).md': '# 括号\n', 'broken.md': '---\nid: broken\ntitle\n---\nbody\n' });
  importFolder(dir, { name: 'x' });
  const by = Object.fromEntries(listPending(dir).map((p) => [p.file, p]));
  assert.deepEqual(Object.keys(by).sort(), ['a(b).md', 'broken.md', 'half.md', 'plain.md']);
  assert.equal(by['plain.md'].bodyHash, sha(Buffer.from(FILES['plain.md'], 'utf8')), 'no front matter: the whole file');
  assert.equal(by['half.md'].bodyHash, sha(Buffer.from('正文第一行\n\n', 'utf8')), 'after the closing ---');
  assert.equal(by['plain.md'].nameOk, true);
  assert.equal(by['a(b).md'].nameOk, false);
  assert.deepEqual(by['plain.md'].proposedHeader, { id: 'plain', title: '记忆方案选型', source: 'file:plain.md', date: localDate(MTIME.getTime()), status: 'authored', topics: ['未分类'] });
  assert.deepEqual(by['half.md'].proposedHeader, { id: 'half', title: '2025 读书笔记', status: 'authored', topics: ['阅读'], source: 'file:half.md', date: localDate(MTIME.getTime()) });
  assert.equal(by['broken.md'].proposedHeader, undefined);
  // an English library proposes the English fallback topic
  const en = userFolder('import-pending-en', { 'note.md': 'text' });
  importFolder(en, { name: 'x', language: 'en' });
  assert.deepEqual(listPending(en)[0].proposedHeader.topics, ['uncategorized']);
});

test('bodyHashOf: the same body behind a different header hashes the same; one more byte in the body does not', () => {
  const body = Buffer.from('line\r\nlast', 'utf8');
  const a = Buffer.concat([Buffer.from('---\nid: a\n---\n'), body]);
  const b = Buffer.concat([Buffer.from('---\r\nid: b\r\ntitle: T\r\n---\r\n'), body]);
  assert.equal(bodyHashOf(a), sha(body));
  assert.equal(bodyHashOf(b), sha(body));
  assert.notEqual(bodyHashOf(Buffer.concat([a, Buffer.from('\n')])), sha(body));
  assert.equal(bodyHashOf(Buffer.from('---\nunclosed\n')), sha(Buffer.from('---\nunclosed\n')), 'an unclosed header is body');
});

test('splitNoteBytes follows parseFrontmatter: head + body is the file, and the body is what parseFrontmatter calls body (LF files)', () => {
  const cases = ['---\na: 1\n---\nbody\n', '---\na: 1\n---', 'no header\n', '---\nnever closed\n', '\ufeff---\na: 1\n---\nx', '--- \na: 1\n---\nx', '', '---\n---\n'];
  for (const text of cases) {
    const buf = Buffer.from(text, 'utf8');
    const { bom, head, body } = splitNoteBytes(buf);
    assert.ok(Buffer.concat([bom, head, body]).equals(buf), JSON.stringify(text));
    assert.equal(body.toString('utf8'), parseFrontmatter(text).body, JSON.stringify(text));
  }
});

// ---------------------------------------------------------------- applyProposedHeader

test('applyProposedHeader with the proposal: the file conforms, is indexed as 我写的, and its body is byte for byte the old file', () => {
  const dir = userFolder('import-apply');
  importFolder(dir, { name: 'x' });
  const old = readFileSync(join(dir, 'plain.md'));
  const hash = listPending(dir).find((p) => p.file === 'plain.md').bodyHash;
  const r = applyProposedHeader(dir, 'plain.md');
  assert.equal(r.id, 'plain');
  assert.equal(r.file, 'plain.md');
  assert.equal(r.entry.status, 'authored');
  assert.equal(r.entry.title, '记忆方案选型');
  const now = readFileSync(join(dir, 'plain.md'));
  assert.ok(splitNoteBytes(now).body.equals(old), 'the body is the whole old file');
  assert.equal(bodyHashOf(now), hash, 'and listPending\'s bodyHash says the same');
  assert.equal(validateNote({ fileName: 'plain.md', text: now.toString('utf8'), config: null }).ok, true);
  assert.deepEqual(readIndex(dir).map((e) => e.id).sort(), ['fine', 'plain']);
  assert.deepEqual(listPending(dir).map((p) => p.file), ['half.md']);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'no temporary file left');
});

test('applyProposedHeader with the user\'s changes: their title and topics win, the rest is the proposal, the body is unchanged', () => {
  const dir = userFolder('import-apply-edited');
  importFolder(dir, { name: 'x' });
  const oldBody = splitNoteBytes(readFileSync(join(dir, 'half.md'))).body;
  const r = applyProposedHeader(dir, 'half.md', { header: { title: '改过的标题', topics: ['agent 记忆', '阅读'] } });
  const now = readFileSync(join(dir, 'half.md'));
  const { meta } = parseFrontmatter(now.toString('utf8'));
  assert.equal(meta.title, '改过的标题');
  assert.deepEqual(meta.topics, ['agent 记忆', '阅读']);
  assert.equal(meta.source, 'file:half.md');
  assert.equal(meta.date, localDate(MTIME.getTime()));
  assert.ok(splitNoteBytes(now).body.equals(oldBody));
  assert.equal(r.entry.title, '改过的标题');
});

test('applyProposedHeader refuses and leaves every byte: bad-file-name, not-proposable, already-conforming, not-found, bad-id, invalid-note', () => {
  const dir = userFolder('import-apply-refuse', { ...FILES, 'a(b).md': '# 括号\n', 'broken.md': '---\nid: broken\ntitle\n---\nbody\n' });
  importFolder(dir, { name: 'x' });
  const before = hashTree(dir);
  const cases = [
    ['a(b).md', undefined, 'bad-file-name'],
    ['broken.md', undefined, 'not-proposable'],
    ['fine.md', undefined, 'already-conforming'],
    ['nope.md', undefined, 'not-found'],
    ['sub/deep.md', undefined, 'not-found'],
    ['plain.md', { id: 'other' }, 'bad-id'],
    ['plain.md', { date: '2026-02-30' }, 'invalid-note'],
    ['plain.md', { topics: [] }, 'invalid-note'],
    ['plain.md', 'title: x', 'bad-argument'],
  ];
  for (const [file, header, code] of cases) {
    assert.throws(() => applyProposedHeader(dir, file, { header }), (e) => e.code === code, `${file} ${JSON.stringify(header)} -> ${code}`);
  }
  assert.deepEqual(hashTree(dir), before, 'no refusal changed a byte anywhere in the folder');
  // control: the same folder takes a header for plain.md
  applyProposedHeader(dir, 'plain.md');
  assert.notEqual(hashTree(dir)['plain.md'], before['plain.md']);
});

// ---------------------------------------------------------------- the rest of the library on notesDir "."

test('an imported library works like any other: readNote / search / graph / listLibrary read its notes, editNote edits in place, keep writes into the folder', async (t) => {
  const dir = userFolder('import-everywhere');
  importFolder(dir, { name: 'x' });
  applyProposedHeader(dir, 'plain.md');
  assert.equal(readNote(dir, 'plain').body, FILES['plain.md'].replace(/\r\n/g, '\n'), 'readNote gives the body with LF line breaks (parseFrontmatter), the file keeps its CRLF');
  assert.ok(search(dir, '记忆方案').some((h) => h.id === 'plain'));
  assert.ok(graph(dir, { status: 'all' }).nodes.some((n) => n.id === 'item:plain'));
  assert.deepEqual(listLibrary(dir, { view: 'authored' }).items.map((e) => e.id).sort(), ['fine', 'plain']);
  assert.deepEqual(listLibrary(dir, { view: 'pending' }).skippedDirs, ['sub']);
  editNote(dir, 'fine', { title: '改名了' });
  assert.match(readFileSync(join(dir, 'fine.md'), 'utf8'), /title: 改名了/);
  assert.equal(existsSync(join(dir, 'notes')), false, 'no notes/ folder appears');

  // a round from a feed on this machine, then keep: the new note is a file of the folder itself
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1, () => ({ title: 'Letta ships Memory Blocks', date: 'Thu, 02 Jul 2026 08:00:00 GMT' }));
  const feed = feedRoute(srv, items);
  const cfg = JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));
  cfg.topics = [{ name: 'agent 记忆', keywords: ['memory'] }];
  cfg.sources = [{ name: 'feed-a', kind: 'rss', url: feed, topic: 'agent 记忆', max_results: 10 }];
  writeFileSync(join(dir, 'streams.json'), JSON.stringify(cfg, null, 2), 'utf8');
  const before = hashTree(dir);
  const round = await runRound(dir, { connector: scriptedConnector({ score: 0.86 }), ctx: ctx() });
  assert.equal(round.counts.inbox, 1);
  for (const f of ['fine.md', 'half.md', 'plain.md', 'sub/deep.md']) assert.equal(hashTree(dir)[f], before[f], `the round left ${f} alone`);
  const k = keep(dir, items[0].url, { now: () => CLOCK });
  assert.ok(existsSync(join(dir, k.file)), `${k.file} is in the folder itself`);
  assert.ok(readIndex(dir).some((e) => e.id === k.id && e.status === 'kept'));
  assert.equal(existsSync(join(dir, 'notes')), false);
});
