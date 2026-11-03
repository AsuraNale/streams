// createLibrary(libraryDir, { name, language? }) -> { libraryDir }
// Lays out an empty library:
//   streams.json (with the default pipeline, core-api 4.0), the note folder, _pipeline/{inbox,cache,logs},
//   _pipeline/ledger.jsonl, _pipeline/fetch_log.jsonl
// (the note folder is only created here, never written into: see write-note.mjs)
// Refuses with code 'exists' when libraryDir already holds anything.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { CONFIG_FILE } from './config.mjs';
import { NOTES_DIR } from './scan.mjs';
import { DEFAULT_PIPELINE } from '../pipeline/config.mjs';
import { LANGUAGES } from '../pipeline/prompts.mjs';

// The score keys a kept note carries by default (gate ids + gate 2's freshness enum).
export const DEFAULT_NODE_IDS = ['relevance', 'substance', 'freshness'];

export function defaultConfig(name, language = 'zh-CN') {
  return {
    name,
    topics: [],
    sources: [],
    pipeline: DEFAULT_PIPELINE(language),
  };
}

export function createLibrary(libraryDir, { name, language = 'zh-CN' } = {}) {
  if (typeof libraryDir !== 'string' || libraryDir === '') throw new StreamsError('bad-argument', 'libraryDir is required');
  if (typeof name !== 'string' || name.trim() === '') throw new StreamsError('bad-argument', 'library name is required');
  if (!LANGUAGES.includes(language)) throw new StreamsError('bad-argument', `language must be one of ${LANGUAGES.join(' | ')}`);
  if (existsSync(libraryDir) && readdirSync(libraryDir).length > 0) {
    throw new StreamsError('exists', `${libraryDir} already exists and is not empty`);
  }
  mkdirSync(join(libraryDir, NOTES_DIR), { recursive: true });
  for (const d of ['inbox', 'cache', 'logs']) mkdirSync(join(libraryDir, '_pipeline', d), { recursive: true });
  writeFileSync(join(libraryDir, CONFIG_FILE), JSON.stringify(defaultConfig(name.trim(), language), null, 2) + '\n', 'utf8');
  writeFileSync(join(libraryDir, '_pipeline', 'ledger.jsonl'), '', 'utf8');
  writeFileSync(join(libraryDir, '_pipeline', 'fetch_log.jsonl'), '', 'utf8');
  return { libraryDir };
}
