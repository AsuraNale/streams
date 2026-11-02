// TEST-ONLY helper. Plants arbitrary bytes as notes/<fileName> so tests can create
// deliberately broken files (no front matter, missing fields, bad YAML, id mismatch)
// and overwrite a note to simulate a hand edit in Obsidian.
//
// Production code must never do this: src/library/write-note.mjs is the single
// writer into notes/ (acceptance V2). Keep this file out of src/.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function writeRawNote(libraryDir, fileName, text) {
  const path = join(libraryDir, 'notes', fileName);
  writeFileSync(path, text, 'utf8');
  return path;
}

export function readRawNote(libraryDir, fileName) {
  return readFileSync(join(libraryDir, 'notes', fileName), 'utf8');
}

// sha256 of every file in notes/, keyed by file name, for before/after comparisons.
export function hashNotes(libraryDir) {
  const dir = join(libraryDir, 'notes');
  const out = {};
  for (const f of readdirSync(dir).sort()) {
    out[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
  }
  return out;
}
