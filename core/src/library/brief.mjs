// streams.json `brief`: the library's 「要求」, one paragraph in the user's words (v2; docs/design/v2/architecture.md 2.1,
// docs/core-api.md 5.13). Package B writes it (an edit_brief or create_library card the user confirmed); the pipeline's
// prompts read it later.
//
// readBrief(libraryDir)          -> string | null    (null: no `brief`, or it is not a non-empty string)
// saveBrief(libraryDir, brief)   -> { brief }        the brief trimmed, 1–BRIEF_MAX characters (code points), else bad-argument
// isBrief(v)                     -> boolean          what saveBrief accepts
// saveLibraryName(libraryDir, name) -> { name }       redesign R4b (N08, 来源与要求's 库名称): streams.json `name`, trimmed,
//                                                     1–NAME_MAX characters (code points), else bad-argument
// Every write goes through setup.mjs's loadWhole / saveWhole (the whole streams.json, a temporary file and a rename; 2-space
// JSON + final newline): every other key keeps its value and order. Never touches the note folder.
// Errors: bad-argument · config:<code> (streams.json unreadable)
import { StreamsError } from '../errors.mjs';
import { loadWhole, saveWhole } from './setup.mjs';

export const BRIEF_MAX = 2000;

export function isBrief(v) {
  if (typeof v !== 'string') return false;
  const n = [...v.trim()].length;
  return n >= 1 && n <= BRIEF_MAX;
}

export function readBrief(libraryDir) {
  const whole = loadWhole(libraryDir);
  return typeof whole.brief === 'string' && whole.brief.trim() !== '' ? whole.brief : null;
}

export function saveBrief(libraryDir, brief) {
  if (!isBrief(brief)) throw new StreamsError('bad-argument', `a brief is 1–${BRIEF_MAX} characters`);
  const whole = loadWhole(libraryDir);
  whole.brief = brief.trim();
  saveWhole(libraryDir, whole);
  return { brief: whole.brief };
}

export const NAME_MAX = 100;

export function saveLibraryName(libraryDir, name) {
  const n = typeof name === 'string' ? [...name.trim()].length : 0;
  if (n < 1 || n > NAME_MAX) throw new StreamsError('bad-argument', `a library name is 1–${NAME_MAX} characters`);
  const whole = loadWhole(libraryDir);
  whole.name = name.trim();
  saveWhole(libraryDir, whole);
  return { name: whole.name };
}
