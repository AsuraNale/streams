// streams.json: library configuration. Here the core only reads `topics[].name` and `notesDir` (the library's language,
// `pipeline.language`, is library/language.mjs's); everything else is passed through untouched. 1.1 W7b: v1.0's scoring steps
// (`pipeline.nodes`) are no longer read or checked here — a library made by v1.0 keeps them as they are.
//   notesDir (optional): the note folder, relative to the library folder; default "notes", "." = the library folder
//   itself (an imported folder, core-api 5.9). An absolute path, a drive, a ".." step or a path outside the library
//   folder is invalid-shape.
//
// readConfig(libraryDir) -> { ok, config, error?: { code, message } }
//   error.code: 'missing' | 'invalid-json' | 'invalid-shape'
import { existsSync, readFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { isPlainObject } from './frontmatter.mjs';

export const CONFIG_FILE = 'streams.json';
// The topic a note gets when nothing else names one (keep without a source topic, an imported file without a header):
// spec v0 wants topics non-empty. Redesign R6d-4: defined here so validateNote can know it (pipeline/decide.mjs
// re-exports it under the name it always had).
export const FALLBACK_TOPIC = Object.freeze({ 'zh-CN': '未分类', en: 'uncategorized' });

export function readConfig(libraryDir) {
  const path = join(libraryDir, CONFIG_FILE);
  if (!existsSync(path)) {
    return { ok: false, config: null, error: { code: 'missing', message: `${CONFIG_FILE} not found in ${libraryDir}` } };
  }
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return { ok: false, config: null, error: { code: 'missing', message: `${path}: ${e.message}` } };
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let config;
  try {
    config = JSON.parse(text);
  } catch (e) {
    return { ok: false, config: null, error: { code: 'invalid-json', message: `${path}: ${e.message}` } };
  }
  const shape = checkShape(config);
  if (shape) {
    return { ok: false, config: null, error: { code: 'invalid-shape', message: `${path}: ${shape}` } };
  }
  return { ok: true, config };
}

// null when `v` is a usable notesDir, else what is wrong with it
export function notesDirProblem(v) {
  if (typeof v !== 'string' || v.trim() === '') return '"notesDir" must be a non-empty relative path';
  if (posix.isAbsolute(v) || win32.isAbsolute(v) || v.includes(':')) return `"notesDir" must be relative to the library folder, got ${JSON.stringify(v)}`;
  if (/[\0\r\n]/.test(v)) return `"notesDir" must be one line, got ${JSON.stringify(v)}`;
  const steps = v.split(/[\\/]/);
  if (steps.includes('..')) return `"notesDir" must stay inside the library folder (no ".."), got ${JSON.stringify(v)}`;
  return null;
}

function checkShape(config) {
  if (!isPlainObject(config)) return 'top level must be a JSON object';
  if (config.notesDir !== undefined) {
    const p = notesDirProblem(config.notesDir);
    if (p) return p;
  }
  if (config.topics !== undefined) {
    if (!Array.isArray(config.topics)) return '"topics" must be an array';
    for (const [i, t] of config.topics.entries()) {
      if (!isPlainObject(t) || typeof t.name !== 'string' || t.name.trim() === '') return `topics[${i}] must be an object with a non-empty "name"`;
    }
  }
  if (config.pipeline !== undefined && !isPlainObject(config.pipeline)) return '"pipeline" must be an object';
  return null;
}

export function topicNames(config) {
  return (config?.topics ?? []).map((t) => t.name);
}
