// addManual(libraryDir, { url, title?, topic?, date? }) -> { added, url, maybeDuplicateOf? }
//
// A link the user found by hand goes into the ledger as an ordinary `seen` event with
// source 'manual', so it can never pass for an automatic fetch and is deduped like any other item:
//   - not http(s)            -> throws StreamsError 'bad-url', nothing written
//   - url already in ledger  -> { added: false }, nothing written
//   - title matches a known title (normalized) -> registered anyway, seen event carries maybe_duplicate_of
// Writes only ledger.jsonl. Nothing else.
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { appendEvent, replayLedger } from '../library/ledger.mjs';
import { checkUrl } from './http.mjs';
import { normalizeTitle } from './html.mjs';
import { localIsoDate, toIsoDate } from './dates.mjs';

export const MANUAL_SOURCE = 'manual';

export function addManual(libraryDir, input = {}, { now = () => new Date() } = {}) {
  if (typeof libraryDir !== 'string' || libraryDir === '') throw new StreamsError('bad-argument', 'libraryDir is required');
  if (!isPlainObject(input)) throw new StreamsError('bad-argument', 'addManual needs { url, title?, topic? }');
  const url = checkUrl(input.url).href;
  const title = typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : undefined;
  const topic = typeof input.topic === 'string' && input.topic.trim() !== '' ? input.topic.trim() : undefined;
  const today = localIsoDate(now());
  const date = toIsoDate(input.date ?? '', { fallback: today });

  const { states } = replayLedger(libraryDir);
  if (states.has(url)) return { added: false, url };
  let maybeDuplicateOf;
  const key = normalizeTitle(title);
  if (key !== '') {
    for (const [u, s] of states) {
      if (u !== url && normalizeTitle(s.title) === key) { maybeDuplicateOf = u; break; }
    }
  }
  const ev = { ev: 'seen', url, source: MANUAL_SOURCE, title, date };
  if (topic !== undefined) ev.topic = topic;
  if (maybeDuplicateOf !== undefined) ev.maybe_duplicate_of = maybeDuplicateOf;
  appendEvent(libraryDir, ev);
  const out = { added: true, url };
  if (maybeDuplicateOf !== undefined) out.maybeDuplicateOf = maybeDuplicateOf;
  return out;
}
