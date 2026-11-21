// Where a confirmed library card lives (contract 「存法」): the library folder's _card/card.json (structured),
// _card/card.md (made from it, for people), and every confirmed version in _card/history/. _state/state.json is the
// library's state (W5 fills it). Only the handlers of the two confirmed actions below write these, and only after the
// user's 确认 (actions.mjs holds the request until then, B3).
//
// writeCard(libraryDir, card, { now, language }) -> { json, md, history }
// readCard(libraryDir) -> the card | null
// cardHandlers({ libraryDirFor, dirOfLibrary, language }) -> { create_library, edit_card } for createActionRunner
//   create_library({ card }): libraryDirFor(card) is where the library goes (the desktop decides: a new empty folder);
//     createLibrary there, the card written, the state started. -> { object: { type: 'library', id: dir }, before: null, after }
//   edit_card({ library, card, why }): dirOfLibrary(library) is its folder; the card before and after are recorded.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { createLibrary } from '../library/create.mjs';
import { checkCard, renderCard } from './card.mjs';

export const CARD_DIR = '_card';
export const STATE_DIR = '_state';
export const CARD_JSON = 'card.json';
export const CARD_MD = 'card.md';

function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

export function writeCard(libraryDir, card, { now = () => new Date(), language = 'zh-CN' } = {}) {
  const dir = join(libraryDir, CARD_DIR);
  mkdirSync(join(dir, 'history'), { recursive: true });
  const at = now().toISOString();
  const json = join(dir, CARD_JSON);
  const md = join(dir, CARD_MD);
  let history = join(dir, 'history', `${at.replace(/[:.]/g, '-')}.json`);
  for (let n = 2; existsSync(history); n++) history = join(dir, 'history', `${at.replace(/[:.]/g, '-')}-${n}.json`);
  const body = JSON.stringify(card, null, 2) + '\n';
  writeAtomic(history, JSON.stringify({ confirmedAt: at, card }, null, 2) + '\n');
  writeAtomic(json, body);
  writeAtomic(md, renderCard(card, language));
  return { json, md, history };
}

export function readCard(libraryDir) {
  const p = join(libraryDir, CARD_DIR, CARD_JSON);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function startState(libraryDir, now) {
  const dir = join(libraryDir, STATE_DIR);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'state.json');
  if (!existsSync(p)) writeAtomic(p, JSON.stringify({ createdAt: now().toISOString(), sources: {}, unfinished: [], used: {} }, null, 2) + '\n');
}

export function cardHandlers({ libraryDirFor, dirOfLibrary, language = 'zh-CN' } = {}) {
  return {
    async create_library(params, { now }) {
      const card = params.card;
      const check = checkCard(card, { reads: null });
      if (!check.ok) throw new StreamsError('bad-card', `the card is not whole: ${check.problems.map((p) => p.code).join(', ')}`);
      if (typeof libraryDirFor !== 'function') throw new StreamsError('bad-argument', 'create_library needs libraryDirFor(card)');
      const dir = libraryDirFor(card);
      createLibrary(dir, { name: card.name, language });
      writeCard(dir, card, { now, language });
      startState(dir, now);
      return { object: { type: 'library', id: dir }, before: null, after: { name: card.name } };
    },
    async edit_card(params, { now }) {
      const check = checkCard(params.card, { reads: null });
      if (!check.ok) throw new StreamsError('bad-card', `the card is not whole: ${check.problems.map((p) => p.code).join(', ')}`);
      if (typeof dirOfLibrary !== 'function') throw new StreamsError('bad-argument', 'edit_card needs dirOfLibrary(library)');
      const dir = dirOfLibrary(params.library);
      const before = readCard(dir);
      writeCard(dir, params.card, { now, language });
      return { object: { type: 'card', id: dir }, before, after: params.card };
    },
  };
}
