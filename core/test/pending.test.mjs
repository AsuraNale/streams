import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { listPending, localDate } from '../src/library/pending.mjs';
import { makeLibrary, keepNote } from './support/fixtures.mjs';
import { writeRawNote, hashNotes } from './support/raw-notes.mjs';

const MTIME = new Date('2026-10-20T23:30:00.000Z');

function plant(dir, file, text) {
  const path = writeRawNote(dir, file, text);
  utimesSync(path, MTIME, MTIME);
  return path;
}

test('no front matter: proposed header from "# heading", file name, mtime; nothing written', () => {
  const dir = makeLibrary('pending-plain');
  keepNote(dir, 'fine');
  plant(dir, 'my-notes.md', '# 我的笔记\n\nsome text\n');
  plant(dir, 'no-heading.md', 'just text\n');
  const before = hashNotes(dir);
  const list = listPending(dir);
  assert.deepEqual(list.map((p) => p.file), ['my-notes.md', 'no-heading.md']);
  assert.deepEqual(list[0].codes, ['no-frontmatter']);
  assert.deepEqual(list[0].messages, ['line 1: first line is not "---"']);
  assert.deepEqual(list[0].proposedHeader, {
    id: 'my-notes', title: '我的笔记', source: 'file:my-notes.md', date: localDate(MTIME.getTime()), status: 'authored', topics: ['未分类'],
  });
  assert.equal(list[1].proposedHeader.title, 'no-heading');
  assert.equal(list[1].proposedHeader.id, 'no-heading');
  assert.deepEqual(hashNotes(dir), before, 'listPending must not touch the files');
  assert.deepEqual(readdirSync(join(dir, 'notes')).sort(), ['fine.md', 'my-notes.md', 'no-heading.md']);
});

test('has front matter but missing source / date: only the missing fields are proposed', () => {
  const dir = makeLibrary('pending-fill');
  plant(dir, 'both.md', '---\nid: both\ntitle: Both missing\nstatus: authored\ntopics: [MCP]\n---\nx\n');
  plant(dir, 'only-source.md', '---\nid: only-source\ntitle: T\ndate: 2026-09-09\nstatus: kept\ntopics: [MCP]\nextra: keep me\n---\nx\n');
  plant(dir, 'only-date.md', '---\nid: only-date\ntitle: T\nsource: https://x\nstatus: kept\ntopics: [MCP]\n---\nx\n');
  const list = listPending(dir);
  const by = Object.fromEntries(list.map((p) => [p.file, p]));
  assert.deepEqual(by['both.md'].codes, ['missing:source', 'missing:date']);
  assert.deepEqual(by['both.md'].proposedHeader, { id: 'both', title: 'Both missing', status: 'authored', topics: ['MCP'], source: 'file:both.md', date: localDate(MTIME.getTime()) });
  assert.deepEqual(by['only-source.md'].proposedHeader, { id: 'only-source', title: 'T', date: '2026-09-09', status: 'kept', topics: ['MCP'], extra: 'keep me', source: 'file:only-source.md' });
  assert.deepEqual(by['only-date.md'].proposedHeader, { id: 'only-date', title: 'T', source: 'https://x', status: 'kept', topics: ['MCP'], date: localDate(MTIME.getTime()) });
});

test('other problems get codes and messages but no proposed header', () => {
  const dir = makeLibrary('pending-noproposal');
  plant(dir, 'no-title.md', '---\nid: no-title\nstatus: kept\ntopics: [MCP]\n---\n');
  plant(dir, 'bad-yaml.md', '---\nid: bad-yaml\ntitle\n---\n');
  plant(dir, 'unclosed.md', '---\nid: unclosed\n');
  plant(dir, 'wrong-id.md', '---\nid: other\ntitle: T\nsource: s\ndate: 2026-01-01\nstatus: kept\ntopics: [MCP]\n---\n');
  plant(dir, 'bad-date.md', '---\nid: bad-date\ntitle: T\nsource: s\ndate: 2026-02-30\nstatus: kept\ntopics: [MCP]\n---\n');
  const list = listPending(dir);
  const by = Object.fromEntries(list.map((p) => [p.file, p]));
  assert.deepEqual(Object.keys(by).sort(), ['bad-date.md', 'bad-yaml.md', 'no-title.md', 'unclosed.md', 'wrong-id.md']);
  for (const p of list) assert.equal(p.proposedHeader, undefined, p.file);
  assert.deepEqual(by['no-title.md'].codes, ['missing:title', 'missing:source', 'missing:date']);
  assert.deepEqual(by['bad-yaml.md'].codes, ['bad-frontmatter']);
  assert.match(by['bad-yaml.md'].messages[0], /^line 3: /);
  assert.deepEqual(by['unclosed.md'].codes, ['bad-frontmatter']);
  assert.match(by['unclosed.md'].messages[0], /^line 3: .*never closed/);
  assert.deepEqual(by['wrong-id.md'].codes, ['id-mismatch']);
  assert.deepEqual(by['bad-date.md'].codes, ['bad-date:date']);
});

test('non-.md files are ignored, an empty library has nothing pending', () => {
  const dir = makeLibrary('pending-empty');
  assert.deepEqual(listPending(dir), []);
  writeRawNote(dir, 'readme.txt', 'not a note');
  assert.deepEqual(listPending(dir), []);
});

test('localDate formats the local calendar day', () => {
  assert.match(localDate(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(localDate(new Date(2026, 0, 5, 12).getTime()), '2026-01-05');
});

test('sentinel: a conforming note is never listed as pending', () => {
  const dir = makeLibrary('pending-sentinel');
  keepNote(dir, 'good');
  plant(dir, 'bad.md', 'no header');
  const list = listPending(dir);
  assert.deepEqual(list.map((p) => p.file), ['bad.md']);
});
