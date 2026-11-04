// createLibrary(libraryDir, { name, language? }) -> { libraryDir }
// Lays out an empty library:
//   streams.json (with the default pipeline, core-api 4.0), the note folder, _pipeline/{inbox,cache,logs},
//   _pipeline/ledger.jsonl, _pipeline/fetch_log.jsonl
// (the note folder is only created here, never written into: see write-note.mjs)
// Refuses with code 'exists' when libraryDir already holds anything.
//
// importFolder(dir, { name, language? }) -> { libraryDir, notes, pending, skippedDirs }   (core-api 5.9, plan A3)
// Makes a folder of the user's own .md files a library without touching any of them: streams.json with
// notesDir "." (the folder itself holds the notes), _pipeline/{inbox,cache,logs}, the empty ledger and fetch_log,
// then rebuildIndex (index.jsonl / index.meta.json beside them). No .md is read for writing, moved or renamed;
// nothing that is already there is overwritten (every new file is written create-only).
//   notes / pending = how many files conform / do not (listPending), skippedDirs = scanLibrary's (sub folders, not read).
//   Refuses: no such folder -> 'not-found'; streams.json, _pipeline, index.jsonl or index.meta.json already there ->
//   'exists'; not one .md on the first level -> 'nothing-to-import'.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { CONFIG_FILE } from './config.mjs';
import { ensureNotesDir, scanLibrary, IMPORTED_NOTES_DIR } from './scan.mjs';
import { INDEX_FILE, INDEX_META_FILE, rebuildIndex } from './index.mjs';
import { DEFAULT_PIPELINE } from '../pipeline/config.mjs';
import { LANGUAGES } from '../pipeline/prompts.mjs';

// The score keys a kept note carries by default (gate ids + gate 2's freshness enum).
export const DEFAULT_NODE_IDS = ['relevance', 'substance', 'freshness'];
const PIPELINE_DIRS = ['inbox', 'cache', 'logs'];
const PIPELINE_FILES = ['ledger.jsonl', 'fetch_log.jsonl'];

export function defaultConfig(name, language = 'zh-CN') {
  return {
    name,
    topics: [],
    sources: [],
    pipeline: DEFAULT_PIPELINE(language),
  };
}

function checkNameAndLanguage(dir, name, language) {
  if (typeof dir !== 'string' || dir === '') throw new StreamsError('bad-argument', 'libraryDir is required');
  if (typeof name !== 'string' || name.trim() === '') throw new StreamsError('bad-argument', 'library name is required');
  if (!LANGUAGES.includes(language)) throw new StreamsError('bad-argument', `language must be one of ${LANGUAGES.join(' | ')}`);
}

// _pipeline/ with its folders and empty files; create-only
function layOutPipeline(dir) {
  for (const d of PIPELINE_DIRS) mkdirSync(join(dir, '_pipeline', d), { recursive: true });
  for (const f of PIPELINE_FILES) writeFileSync(join(dir, '_pipeline', f), '', { encoding: 'utf8', flag: 'wx' });
}

export function createLibrary(libraryDir, { name, language = 'zh-CN' } = {}) {
  checkNameAndLanguage(libraryDir, name, language);
  if (existsSync(libraryDir) && readdirSync(libraryDir).length > 0) {
    throw new StreamsError('exists', `${libraryDir} already exists and is not empty`);
  }
  mkdirSync(libraryDir, { recursive: true });
  writeFileSync(join(libraryDir, CONFIG_FILE), JSON.stringify(defaultConfig(name.trim(), language), null, 2) + '\n', 'utf8');
  ensureNotesDir(libraryDir);
  layOutPipeline(libraryDir);
  return { libraryDir };
}

/** How many .md files are on the first level of `dir` (what importFolder would take). */
export function countFirstLevelMd(dir) {
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && /\.md$/i.test(d.name)).length;
}

export function importFolder(dir, { name, language = 'zh-CN' } = {}) {
  checkNameAndLanguage(dir, name, language);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new StreamsError('not-found', `${dir} is not a folder`);
  for (const f of [CONFIG_FILE, '_pipeline', INDEX_FILE, INDEX_META_FILE]) {
    if (existsSync(join(dir, f))) throw new StreamsError('exists', `${dir} already has ${f}: it is a library already, or was one`);
  }
  if (countFirstLevelMd(dir) === 0) throw new StreamsError('nothing-to-import', `${dir} has no .md file on its first level`);
  const { name: n, ...rest } = defaultConfig(name.trim(), language);
  const config = { name: n, notesDir: IMPORTED_NOTES_DIR, ...rest };
  writeFileSync(join(dir, CONFIG_FILE), JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  layOutPipeline(dir);
  const { entries, pending } = rebuildIndex(dir);
  return { libraryDir: dir, notes: entries.length, pending: pending.length, skippedDirs: scanLibrary(dir).skippedDirs };
}
