// streams.json: library configuration. Today the core only reads `topics[].name`,
// `pipeline.nodes[].id` and `notesDir`; everything else is passed through untouched.
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
  if (config.pipeline !== undefined) {
    if (!isPlainObject(config.pipeline)) return '"pipeline" must be an object';
    if (config.pipeline.nodes !== undefined) {
      if (!Array.isArray(config.pipeline.nodes)) return '"pipeline.nodes" must be an array';
      for (const [i, n] of config.pipeline.nodes.entries()) {
        if (!isPlainObject(n) || typeof n.id !== 'string' || n.id.trim() === '') return `pipeline.nodes[${i}] must be an object with a non-empty "id"`;
      }
    }
  }
  return null;
}

export function topicNames(config) {
  return (config?.topics ?? []).map((t) => t.name);
}

// The keys a note's `scores` may use: every node id, plus every enum output field of a gate
// (gate 2's freshness is recorded as its own scored event and its own scores key, core-api 4.1).
export function nodeIds(config) {
  const out = [];
  for (const n of config?.pipeline?.nodes ?? []) {
    out.push(n.id);
    const output = n && typeof n.output === 'object' && n.output !== null ? n.output : {};
    for (const [k, v] of Object.entries(output)) if (typeof v === 'string' && v.startsWith('enum:') && !out.includes(k)) out.push(k);
  }
  return out;
}
