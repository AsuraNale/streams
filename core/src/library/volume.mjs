// streams.json `update.volume`: how much one update of the library may do (1.1.2 第 4 件; 维护者 11-25 「用量不够，找来的文章不
// 够多……设置里没有相关选项」, user case U2). Three steps — standard / more / most (界面: 标准 / 较多 / 最多) — scale the five
// limits of one update (core update/format.mjs UPDATE_BUDGET: the card's sources read, new links fetched, the agent's
// searches and page reads, the items it hands in) ×1 / ×2 / ×3. Whatever the step, the agent may read at least the card's
// sources and READS_OVER_SOURCES pages more (the user case: 14 sources, 20 reads — 5 sources never read).
//   update: { volume: 'standard' | 'more' | 'most' }   no key, or a value it does not know: standard
//
// VOLUMES                                  the three steps, in order
// isVolume(v)                              one of them
// readLibraryVolume(libraryDir)            -> { volume, stored }   stored: streams.json says one it knows
// saveLibraryVolume(libraryDir, volume)    -> volume   (bad-argument for any other value); every other key keeps its value
//                                             and order, and so does the rest of `update` (setup.mjs loadWhole / saveWhole)
// updateBudgetFor(volume, { sources })     -> { sources, newLinks, searches, reads, items }   sources: how many the card has
// Errors: bad-argument · config:<code> (streams.json unreadable)
import { StreamsError } from '../errors.mjs';
import { loadWhole, saveWhole } from './setup.mjs';

export const VOLUMES = Object.freeze(['standard', 'more', 'most']);
export const DEFAULT_VOLUME = 'standard';
export const VOLUME_FACTOR = Object.freeze({ standard: 1, more: 2, most: 3 });
// one update at the standard step (the 11-19 update test's numbers: 8 searches, 20 reads; at most 30 items handed in)
export const STANDARD_UPDATE = Object.freeze({ sources: 30, newLinks: 20, searches: 8, reads: 20, items: 30 });
export const READS_OVER_SOURCES = 8;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function isVolume(v) {
  return typeof v === 'string' && VOLUMES.includes(v);
}

export function readLibraryVolume(libraryDir) {
  const whole = loadWhole(libraryDir);
  const v = isObj(whole.update) ? whole.update.volume : undefined;
  return { volume: isVolume(v) ? v : DEFAULT_VOLUME, stored: isVolume(v) };
}

export function saveLibraryVolume(libraryDir, volume) {
  if (!isVolume(volume)) throw new StreamsError('bad-argument', `volume must be one of ${VOLUMES.join(', ')}`);
  const whole = loadWhole(libraryDir);
  whole.update = { ...(isObj(whole.update) ? whole.update : {}), volume };
  saveWhole(libraryDir, whole);
  return volume;
}

export function updateBudgetFor(volume = DEFAULT_VOLUME, { sources = 0 } = {}) {
  const f = VOLUME_FACTOR[isVolume(volume) ? volume : DEFAULT_VOLUME];
  const b = Object.fromEntries(Object.entries(STANDARD_UPDATE).map(([k, n]) => [k, n * f]));
  const n = Number.isInteger(sources) && sources > 0 ? sources : 0;
  b.reads = Math.max(b.reads, n + READS_OVER_SOURCES);
  return b;
}
