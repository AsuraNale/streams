// createLibrary(libraryDir, { name }) -> { libraryDir }
// Lays out an empty library:
//   streams.json, the note folder, _pipeline/{inbox,cache,logs}, _pipeline/ledger.jsonl, _pipeline/fetch_log.jsonl
// (the note folder is only created here, never written into: see write-note.mjs)
// Refuses with code 'exists' when libraryDir already holds anything.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { CONFIG_FILE } from './config.mjs';
import { NOTES_DIR } from './scan.mjs';

export const DEFAULT_NODE_IDS = ['relevance', 'substance', 'freshness'];

export function defaultConfig(name) {
  return {
    name,
    topics: [],
    sources: [],
    pipeline: { nodes: DEFAULT_NODE_IDS.map((id) => ({ id })) },
  };
}

export function createLibrary(libraryDir, { name } = {}) {
  if (typeof libraryDir !== 'string' || libraryDir === '') throw new StreamsError('bad-argument', 'libraryDir is required');
  if (typeof name !== 'string' || name.trim() === '') throw new StreamsError('bad-argument', 'library name is required');
  if (existsSync(libraryDir) && readdirSync(libraryDir).length > 0) {
    throw new StreamsError('exists', `${libraryDir} already exists and is not empty`);
  }
  mkdirSync(join(libraryDir, NOTES_DIR), { recursive: true });
  for (const d of ['inbox', 'cache', 'logs']) mkdirSync(join(libraryDir, '_pipeline', d), { recursive: true });
  writeFileSync(join(libraryDir, CONFIG_FILE), JSON.stringify(defaultConfig(name.trim()), null, 2) + '\n', 'utf8');
  writeFileSync(join(libraryDir, '_pipeline', 'ledger.jsonl'), '', 'utf8');
  writeFileSync(join(libraryDir, '_pipeline', 'fetch_log.jsonl'), '', 'utf8');
  return { libraryDir };
}
