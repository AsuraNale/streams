// Putting a checked summary in 待看 (1.1 W3, acceptance B14). The update (W5) calls this for each item the update agent
// hands in, after verify/summary.mjs checkSummary.
//
// putInInbox(libraryDir, { item: { url, title, source, date }, checked, round, now }) -> { file, verified }
//   Only a checked summary goes in (status 'checked'): one with no original, one that never came back readable, one whose
//   check could not be reached is refused (bad-argument) and 待看 is not touched.
//   One that did not pass after its rounds goes in all the same, verification.passed false: the card shows 未通过核验 and
//   it stays until the user decides — it does not disappear.
//   Writes: one line per round to the check record (_pipeline/verdicts.jsonl), a `seen` event when the ledger does not
//   know the address yet, the card (_pipeline/inbox/<key>.json) and the ledger's `inbox` event { verified }.
import { StreamsError } from '../errors.mjs';
import { appendEvent, replayLedger } from '../library/ledger.mjs';
import { writeInboxItem } from '../pipeline/inbox.mjs';
import { appendVerdict } from '../verify/verdicts.mjs';
import { recordMark } from '../verify/ai-instructions.mjs';
import { ORIGINAL_MISSING } from '../read/original.mjs';

// 1.1 W5: what an item carries besides its summary — the deadline the agent read (due), the agent's reason (why), and
// 「写给 AI 的话」 found in its original (aiInstruction: the rule mark of verify/ai-instructions.mjs, C6)
const extras = (item, mark) => ({
  ...(typeof item.due === 'string' && item.due !== '' ? { due: item.due } : {}),
  ...(typeof item.why === 'string' && item.why !== '' ? { why: item.why } : {}),
  ...(mark ? { aiInstruction: true } : {}),
});

export function putInInbox(libraryDir, { item, checked, round, now = () => new Date(), aiInstruction = null } = {}) {
  if (!item || typeof item.url !== 'string' || item.url === '') throw new StreamsError('bad-argument', 'an item for 待看 needs its url');
  if (!checked || checked.status !== 'checked') throw new StreamsError('bad-argument', `only a checked summary goes to 待看 (this one is ${checked?.status ?? 'missing'})`);
  const ts = now().toISOString();
  (checked.history ?? []).forEach((h, i) => appendVerdict(libraryDir, { node: 'summary', url: item.url, round: i + 1, items: h.items, ts }));
  if (!replayLedger(libraryDir).states.has(item.url)) {
    appendEvent(libraryDir, { ts, ev: 'seen', url: item.url, source: item.source ?? '', title: item.title ?? '', date: item.date ?? '' });
  }
  const card = {
    url: item.url,
    title: item.title ?? '',
    source: item.source ?? '',
    date: item.date ?? '',
    scores: {},
    summary: checked.summary,
    verification: checked.verification,
    original: checked.original,
    materials: 'original',
    ...extras(item, aiInstruction),
    ...(typeof round === 'string' && round !== '' ? { round } : {}),
    inboxAt: ts,
  };
  const { file } = writeInboxItem(libraryDir, card);
  if (aiInstruction) recordMark(libraryDir, aiInstruction, { at: ts, source: item.source ?? '', itemId: item.url, node: 'update' });
  appendEvent(libraryDir, { ts, ev: 'inbox', url: item.url, ...(typeof round === 'string' && round !== '' ? { round } : {}), verified: checked.verification.passed === true, ...(aiInstruction ? { aiInstruction: true } : {}) });
  return { file, verified: checked.verification.passed === true };
}

// 1.1 W5 (B6): an item whose original could not be read goes to 待看 with no summary: the card says 「原文没存下来」
// (original.missing) and why (original.reason: the reading's reason, read/read-page.mjs). reason 'summary-not-written':
// the original is there but no summary came back for it.
export function putMissingInInbox(libraryDir, { item, reason = 'no-article', missing = ORIGINAL_MISSING, round, now = () => new Date() } = {}) {
  if (!item || typeof item.url !== 'string' || item.url === '') throw new StreamsError('bad-argument', 'an item for 待看 needs its url');
  const ts = now().toISOString();
  if (!replayLedger(libraryDir).states.has(item.url)) {
    appendEvent(libraryDir, { ts, ev: 'seen', url: item.url, source: item.source ?? '', title: item.title ?? '', date: item.date ?? '' });
  }
  const card = {
    url: item.url, title: item.title ?? '', source: item.source ?? '', date: item.date ?? '', scores: {},
    summary: null,
    original: missing ? { saved: false, missing, reason } : { saved: true, reason },
    ...(missing ? {} : { summaryMissing: reason }),
    materials: 'none',
    ...extras(item, null),
    ...(typeof round === 'string' && round !== '' ? { round } : {}),
    inboxAt: ts,
  };
  const { file } = writeInboxItem(libraryDir, card);
  appendEvent(libraryDir, { ts, ev: 'inbox', url: item.url, ...(typeof round === 'string' && round !== '' ? { round } : {}), verified: false });
  return { file };
}
