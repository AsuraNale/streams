// The record of proposal cards (v2 package B; docs/core-api.md 5.13): proposals.jsonl, append only — one line per card when
// it is made and one more at every change of its status, each line the whole card as it is then. The app keeps one in
// <appData>\Streams\ (every card) and each library one in its _pipeline\ (the cards about that library).
//
// appendProposal(file, card)   one line (the folder is made when it is not there)
// readProposals(file)          -> { cards, skipped }   for each id its last line, in the order the ids first appear; a line
//                                 that is not JSON or not a card (isCard) is skipped and counted; no file → no cards
// isCard(v)                    -> boolean   an object with a string id, a known kind and status, a string createdAt
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isPlainObject } from '../library/frontmatter.mjs';
import { PROPOSAL_KINDS } from './params.mjs';

export const PROPOSALS_FILE = 'proposals.jsonl';
export const PROPOSAL_STATUSES = Object.freeze(['pending', 'confirmed', 'declined', 'revise', 'stale', 'failed']);

export const libraryProposalsPath = (libraryDir) => join(libraryDir, '_pipeline', PROPOSALS_FILE);

export function isCard(v) {
  return isPlainObject(v) && typeof v.id === 'string' && v.id !== '' && PROPOSAL_KINDS.includes(v.kind)
    && PROPOSAL_STATUSES.includes(v.status) && typeof v.createdAt === 'string';
}

export function appendProposal(file, card) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(card) + '\n', 'utf8');
}

export function readProposals(file) {
  if (!existsSync(file)) return { cards: [], skipped: 0 };
  const byId = new Map();
  let skipped = 0;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let v;
    try { v = JSON.parse(raw); } catch { skipped += 1; continue; }
    if (!isCard(v)) { skipped += 1; continue; }
    byId.set(v.id, v);
  }
  return { cards: [...byId.values()], skipped };
}
