// sourceHealth(lastRoundStatus) -> { level: 'quiet' | 'warning' | 'blocked', counts, lines }
//
// Input is lastRoundStatus() from log.mjs: { [source]: { status, consecutive, ... } }.
// Output is internal codes only; the desktop turns them into words.
//   level   blocked  if any source is blocked (its own level: the fix is "change the source", not "retry")
//           warning  else if any source is failed or gap (a fetch problem is never "a quiet day")
//           quiet    all ok / empty (or nothing fetched yet)
//   lines   one string per state that has sources, in a fixed shape:
//           '<state> <n>/<total> <name,name> hint=<hint-code>'
//           total = sources that were not paused. blocked never shares a line with failed / gap.
//           No fetch on record -> ['no-fetch-yet'].
import { FETCH_STATES, PAUSED_STATE, hintOf } from './states.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';

export function sourceHealth(lastRoundStatus) {
  if (!isPlainObject(lastRoundStatus)) throw new TypeError('sourceHealth expects the object returned by lastRoundStatus()');
  const names = Object.keys(lastRoundStatus).sort();
  const counts = Object.fromEntries([...FETCH_STATES, PAUSED_STATE].map((s) => [s, 0]));
  const by = Object.fromEntries([...FETCH_STATES, PAUSED_STATE].map((s) => [s, []]));
  for (const name of names) {
    const st = lastRoundStatus[name]?.status;
    if (!Object.hasOwn(by, st)) continue; // an unknown status is neither quiet nor loud: ignore, do not crash
    counts[st] += 1;
    by[st].push(name);
  }
  const total = names.length - counts.paused;
  if (total === 0 && counts.paused === 0) return { level: 'quiet', counts, lines: ['no-fetch-yet'] };

  const lines = [];
  const line = (state, list) => `${state} ${list.length}/${total} ${list.join(',')} hint=${hintOf(state)}`;
  if (by.blocked.length) lines.push(line('blocked', by.blocked));
  if (by.failed.length) lines.push(line('failed', by.failed));
  if (by.gap.length) lines.push(line('gap', by.gap));
  const fine = [...by.ok, ...by.empty].sort();
  if (fine.length) lines.push(`ok ${fine.length}/${total} ${fine.join(',')} hint=none`);
  if (by.paused.length) lines.push(`paused ${by.paused.length} ${by.paused.join(',')} hint=none`);

  const level = by.blocked.length ? 'blocked' : (by.failed.length || by.gap.length ? 'warning' : 'quiet');
  return { level, counts, lines };
}
