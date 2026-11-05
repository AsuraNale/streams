// The library registry (v2 package A; docs/core-api.md 5.12): libraries.json read whole and checked field by field (a bad
// field is its default, a bad row is dropped and said), written whole through a temporary file and a rename, ids made
// once and kept; removing a registration touches nothing on disk; the first registry from v1.0's settings.json.
// Controls first: each check fails on input made to break it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ID_RE, LIBRARY_COLORS, REGISTRY_FILE, REGISTRY_SCHEMA, colorFor, defaultIcon, emptyRegistry, libraryAt, libraryOf,
  migrateRegistry, newLibraryId, normalizeRegistry, readRegistry, withActive, withLibrary, withMeta, withoutLibrary, writeRegistry,
} from '../src/registry/registry.mjs';
import { createLibrary } from '../src/library/create.mjs';
import * as core from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const T = (iso) => () => new Date(iso);

/** sha256 of every file under dir, by its path relative to dir. */
function hashTree(dir, base = dir, out = {}) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) hashTree(p, base, out);
    else out[p.slice(base.length + 1)] = createHash('sha256').update(readFileSync(p)).digest('hex');
  }
  return out;
}

test('the core exports the registry; the schema, the file name and the colour tokens are the contract\'s', () => {
  for (const name of ['readRegistry', 'writeRegistry', 'normalizeRegistry', 'migrateRegistry', 'withLibrary', 'withoutLibrary', 'withActive', 'withMeta']) assert.equal(typeof core[name], 'function', name);
  assert.equal(REGISTRY_SCHEMA, 'streams.libraries/1');
  assert.equal(REGISTRY_FILE, 'libraries.json');
  assert.ok(LIBRARY_COLORS.length >= 2 && LIBRARY_COLORS.every((c) => /^[a-z]+$/.test(c)), 'token names, not colour values');
  assert.deepEqual(emptyRegistry(), { schema: REGISTRY_SCHEMA, active: null, libraries: [] });
});

test('ids: 8 characters of [a-z0-9], never one already taken', () => {
  const taken = new Set();
  for (let i = 0; i < 200; i += 1) {
    const id = newLibraryId([...taken]);
    assert.match(id, ID_RE);
    assert.equal(taken.has(id), false);
    taken.add(id);
  }
  // control: the pattern refuses what is not an id
  for (const bad of ['ABCDEFGH', 'abc', 'abcdefghi', 'abcd-fgh']) assert.equal(ID_RE.test(bad), false, bad);
});

test('withLibrary: the defaults (folder name, its first character, colours by turn); a folder already listed is not listed twice', () => {
  const root = caseDir('registry-add');
  let reg = emptyRegistry();
  const paths = ['AI 工具', 'papers', 'third', 'fourth', 'fifth'].map((n) => join(root, n));
  const ids = [];
  for (const [i, p] of paths.entries()) {
    const r = withLibrary(reg, p, { now: T('2026-11-05T10:00:00.000Z') });
    assert.equal(r.added, true);
    reg = r.registry;
    ids.push(r.entry.id);
    assert.equal(r.entry.color, colorFor(i));
  }
  assert.deepEqual(reg.libraries[0], { id: ids[0], path: paths[0], name: 'AI 工具', icon: 'A', color: LIBRARY_COLORS[0], addedAt: '2026-11-05T10:00:00.000Z' });
  assert.equal(reg.libraries[1].icon, 'p');
  assert.equal(reg.libraries[LIBRARY_COLORS.length].color, LIBRARY_COLORS[0], 'the colours go round');
  assert.equal(defaultIcon('流息'), '流');
  const again = withLibrary(reg, paths[1].toUpperCase());
  if (process.platform === 'win32') {
    assert.equal(again.added, false, 'letter case does not count on Windows');
    assert.equal(again.entry.id, ids[1]);
    assert.equal(again.registry, reg, 'nothing changed');
  }
  assert.equal(withLibrary(reg, paths[1]).added, false);
  assert.throws(() => withLibrary(reg, 'relative\\lib'), (e) => e.code === 'bad-argument');
  // control: a new folder is added
  assert.equal(withLibrary(reg, join(root, 'sixth')).added, true);
});

test('normalizeRegistry: a bad field is its default, a bad row is dropped and said, a bad active is the first library', () => {
  const root = caseDir('registry-normalize');
  const a = join(root, 'a');
  const b = join(root, 'b');
  const lines = [];
  const reg = normalizeRegistry({
    schema: 'whatever',
    active: 'zzzzzzzz',
    libraries: [
      { id: 'aaaaaaaa', path: a, name: '   ', icon: 'toolong', color: '#ff0000', addedAt: 'yesterday' },
      { id: 'bbbbbbbb', path: b, name: '论文', icon: '论', color: 'violet', addedAt: '2026-11-01T00:00:00.000Z' },
      { id: 'BAD', path: join(root, 'c') },
      { id: 'cccccccc', path: 'relative' },
      { id: 'aaaaaaaa', path: join(root, 'd') },
      { id: 'dddddddd', path: a },
      'not a row',
      null,
    ],
  }, { log: (l) => lines.push(l) });
  assert.equal(reg.schema, REGISTRY_SCHEMA);
  assert.deepEqual(reg.libraries, [
    { id: 'aaaaaaaa', path: a, name: 'a', icon: 'a', color: LIBRARY_COLORS[0], addedAt: null },
    { id: 'bbbbbbbb', path: b, name: '论文', icon: '论', color: 'violet', addedAt: '2026-11-01T00:00:00.000Z' },
  ]);
  assert.equal(reg.active, 'aaaaaaaa', 'an active id not listed is the first library');
  assert.equal(lines.length, 6, lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('the id is listed already')) && lines.some((l) => l.includes('is listed already') && l.includes(a)));
  // control: a good active stays; nothing at all is the empty registry
  assert.equal(normalizeRegistry({ active: 'bbbbbbbb', libraries: reg.libraries }).active, 'bbbbbbbb');
  assert.deepEqual(normalizeRegistry('junk'), emptyRegistry());
  assert.deepEqual(normalizeRegistry({ active: 'aaaaaaaa', libraries: [] }), emptyRegistry());
});

test('readRegistry / writeRegistry: written whole, read back the same; a missing or broken file is the empty registry', () => {
  const root = caseDir('registry-rw');
  const file = join(root, 'app', REGISTRY_FILE);
  assert.deepEqual(readRegistry(file), emptyRegistry(), 'no file');
  let reg = withLibrary(emptyRegistry(), join(root, 'one'), { now: T('2026-11-05T10:00:00.000Z') }).registry;
  reg = withLibrary(reg, join(root, 'two'), { now: T('2026-11-05T10:01:00.000Z') }).registry;
  reg = withActive(reg, reg.libraries[1].id);
  const written = writeRegistry(file, reg);
  assert.deepEqual(written, reg);
  assert.deepEqual(readRegistry(file), reg);
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify(reg, null, 2) + '\n', '2-space JSON + final newline');
  assert.deepEqual(readdirSync(join(root, 'app')), [REGISTRY_FILE], 'no temporary file left');
  // a broken file: read as empty, said
  const lines = [];
  writeFileSync(file, '{ not json');
  assert.deepEqual(readRegistry(file, { log: (l) => lines.push(l) }), emptyRegistry());
  assert.equal(lines.length, 1);
  // a hand-edited file with one bad field: that field is its default, the rest stays
  writeFileSync(file, JSON.stringify({ ...reg, libraries: [{ ...reg.libraries[0], color: 'pink' }, reg.libraries[1]] }));
  const back = readRegistry(file);
  assert.equal(back.libraries[0].color, LIBRARY_COLORS[0]);
  assert.deepEqual(back.libraries[1], reg.libraries[1]);
});

test('writeRegistry replaces the file through a rename: a hard link to the old file keeps the old bytes (a write in place would change them)', () => {
  const root = caseDir('registry-atomic');
  const file = join(root, REGISTRY_FILE);
  const first = writeRegistry(file, withLibrary(emptyRegistry(), join(root, 'one')).registry);
  const before = readFileSync(file, 'utf8');
  const link = join(root, 'old-copy.json');
  linkSync(file, link);
  // control: a write in place through the link shows on both names (so the check below can fail)
  const probe = join(root, 'probe.json');
  writeFileSync(probe, 'a');
  linkSync(probe, join(root, 'probe-link.json'));
  writeFileSync(probe, 'b');
  assert.equal(readFileSync(join(root, 'probe-link.json'), 'utf8'), 'b');
  writeRegistry(file, withLibrary(first, join(root, 'two')).registry);
  assert.equal(readRegistry(file).libraries.length, 2, 'the new registry is there');
  assert.equal(readFileSync(link, 'utf8'), before, 'the old file was replaced, not written over');
  // a stale temporary file of an earlier crash does not stop the next write
  writeFileSync(`${file}.${process.pid}.tmp`, 'half');
  writeRegistry(file, first);
  assert.equal(readRegistry(file).libraries.length, 1);
  assert.equal(existsSync(`${file}.${process.pid}.tmp`), false);
});

test('ids are stable: reading, writing, renaming, switching and removing another library never change an id', () => {
  const root = caseDir('registry-stable');
  const file = join(root, REGISTRY_FILE);
  let reg = emptyRegistry();
  for (const n of ['a', 'b', 'c']) reg = withLibrary(reg, join(root, n)).registry;
  const ids = reg.libraries.map((l) => l.id);
  writeRegistry(file, reg);
  reg = readRegistry(file);
  reg = withMeta(reg, ids[1], { name: '新名字', icon: '新', color: 'green' });
  reg = withActive(reg, ids[2]);
  reg = withoutLibrary(reg, ids[0]);
  writeRegistry(file, reg);
  assert.deepEqual(readRegistry(file).libraries.map((l) => l.id), [ids[1], ids[2]]);
  assert.deepEqual(libraryOf(readRegistry(file), ids[1]), { ...reg.libraries[0], name: '新名字', icon: '新', color: 'green' });
});

test('withMeta: only the keys given, each checked; an unknown id is unknown-library', () => {
  const root = caseDir('registry-meta');
  const reg = withLibrary(emptyRegistry(), join(root, 'lib')).registry;
  const id = reg.libraries[0].id;
  assert.deepEqual(withMeta(reg, id, { name: '  AI  ' }).libraries[0], { ...reg.libraries[0], name: 'AI' });
  for (const bad of [{}, { name: '' }, { icon: 'abc' }, { color: '#fff' }, { path: 'C:\\x' }, null]) {
    assert.throws(() => withMeta(reg, id, bad), (e) => e.code === 'bad-argument', JSON.stringify(bad));
  }
  assert.throws(() => withMeta(reg, 'zzzzzzzz', { name: 'x' }), (e) => e.code === 'unknown-library');
  assert.throws(() => withActive(reg, 'zzzzzzzz'), (e) => e.code === 'unknown-library');
  assert.throws(() => withoutLibrary(reg, 'zzzzzzzz'), (e) => e.code === 'unknown-library');
});

test('withoutLibrary: the registration only — every file in the folder stays byte for byte; the active one moves to the next', () => {
  const root = caseDir('registry-remove');
  const dirs = ['a', 'b', 'c'].map((n) => join(root, n));
  let reg = emptyRegistry();
  for (const d of dirs) { createLibrary(d, { name: 'x' }); writeFileSync(join(d, 'notes', 'mine.md'), 'my words\n'); reg = withLibrary(reg, d).registry; }
  const [a, b, c] = reg.libraries.map((l) => l.id);
  const before = Object.fromEntries(dirs.map((d) => [d, hashTree(d)]));
  reg = withActive(reg, b);
  const r1 = withoutLibrary(reg, b);
  assert.equal(r1.active, c, 'the active one removed: the next one');
  assert.deepEqual(r1.libraries.map((l) => l.id), [a, c]);
  const r2 = withoutLibrary(withActive(r1, c), c);
  assert.equal(r2.active, a, 'the last one removed: the one before it');
  const r3 = withoutLibrary(r2, a);
  assert.equal(r3.active, null, 'none left: null');
  assert.equal(withoutLibrary(withActive(reg, a), c).active, a, 'another one removed: the active one stays');
  for (const d of dirs) {
    assert.ok(existsSync(join(d, 'streams.json')));
    assert.deepEqual(hashTree(d), before[d], d);
  }
  // control: the hash comparison sees a changed file
  writeFileSync(join(dirs[0], 'notes', 'mine.md'), 'changed\n');
  assert.notDeepEqual(hashTree(dirs[0]), before[dirs[0]]);
});

test('migrateRegistry: v1.0\'s open library first and active, then the recent ones in order; a folder not there is not registered', () => {
  const root = caseDir('registry-migrate');
  const open = join(root, 'open');
  const r1 = join(root, 'recent-1');
  const gone = join(root, 'gone');
  const r2 = join(root, 'recent-2');
  for (const d of [open, r1, r2]) mkdirSync(d);
  const lines = [];
  const reg = migrateRegistry({ libraryPath: open, recentLibraries: [r1, open, gone, r2] }, { now: T('2026-11-05T10:00:00.000Z'), log: (l) => lines.push(l) });
  assert.deepEqual(reg.libraries.map((l) => l.path), [open, r1, r2]);
  assert.equal(reg.active, reg.libraries[0].id);
  assert.deepEqual(reg.libraries.map((l) => l.name), ['open', 'recent-1', 'recent-2']);
  assert.equal(new Set(reg.libraries.map((l) => l.id)).size, 3);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes(gone), lines[0]);
  // the open library itself not there: the first recent one is active
  const noOpen = migrateRegistry({ libraryPath: gone, recentLibraries: [r2, r1] });
  assert.deepEqual(noOpen.libraries.map((l) => l.path), [r2, r1]);
  assert.equal(noOpen.active, noOpen.libraries[0].id);
  // nothing in v1.0's settings: the empty registry
  assert.deepEqual(migrateRegistry({ libraryPath: null, recentLibraries: [] }), emptyRegistry());
  assert.equal(libraryAt(reg, join(root, 'gone')), null);
});
