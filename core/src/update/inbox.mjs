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

export function putInInbox(libraryDir, { item, checked, round, now = () => new Date() } = {}) {
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
    ...(typeof round === 'string' && round !== '' ? { round } : {}),
    inboxAt: ts,
  };
  const { file } = writeInboxItem(libraryDir, card);
  appendEvent(libraryDir, { ts, ev: 'inbox', url: item.url, ...(typeof round === 'string' && round !== '' ? { round } : {}), verified: checked.verification.passed === true });
  return { file, verified: checked.verification.passed === true };
}
