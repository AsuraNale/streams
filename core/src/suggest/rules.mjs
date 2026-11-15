// Rule-based suggestion cards (v2 package D2; architecture 2.2 「建议卡 suggest」). No model call, no write.
//
// suggestFor(libraryDir, { now?, otherLibraries? }) -> [{ key, kind, libraryId?, subject, evidence, createdAt }]
//   key = `${kind}:${subject}` (the dedup key of suggestions.jsonl). Reads streams.json, fetch_log.jsonl, rounds.jsonl,
//   ai-instructions.jsonl, suggestions.jsonl (and the other libraries' streams.json); writes nothing anywhere. The maintainer 11-05
//   「先不放权」: a suggestion is only ever shown to you; nothing in src/suggest/ changes a source, a topic or a setting.
//
//   1. source-failing  subject = source name. The source's newest fetch_log lines, counted back from the last one, are
//                      `failed` (暂时失败) or `blocked` (访问被拒), mixed or not, at least SOURCE_FAILING_ROUNDS (3) in a row.
//                      Any other status (ok / empty / gap / paused) ends the run. Paused or removed sources are skipped.
//                      Redesign R5a (维护者 11-12 第 6 条): or the newest lines are `gap` (地址无效) at least SOURCE_GAP_ROUNDS
//                      (2) in a row — evidence then { rounds, gap, state: 'gap', since, last }; any other status ends that run.
//   2. no-output       subject = 'library'. noOutputStreak (v1.0, rounds.jsonl newest first) >= NO_OUTPUT_ROUNDS (3).
//   3. ai-instruction  subject = source name. The source has at least one ai-instructions.jsonl line. Paused or
//                      removed sources are skipped.
//   4. topic-overlap   subject = the other library's id (also in `libraryId`), only when `otherLibraries`
//                      ([{ libraryId, dir }]) is given. K(lib) = the set of every topic name and keyword of the library's
//                      streams.json topics[], each NFKC + lower case + trimmed + inner whitespace collapsed, empty dropped.
//                      Jaccard J = |K(this) ∩ K(other)| / |K(this) ∪ K(other)|; fires when the union is not empty and
//                      J >= TOPIC_OVERLAP_PERCENT (60%), computed in integers: 100·|∩| >= 60·|∪| (no float rounding).
//
//   5. dismiss-reason  redesign R5a (N04): subject = a quick reason id (the core's DISMISS_QUICK). The library's newest
//                      DISMISS_REASON_COUNT (3) dismissals that carry a quick reason (the ledger's `dismissed` events with
//                      `quick`) all carry this one. A dismissal with words only (「其他原因…」) or with no reason is not
//                      counted (and does not break the run); one undone never reached the ledger. Evidence { quick, count,
//                      since, titles }.
//
//   overlapSuggestions(libraryDir, { now?, otherLibraries }) -> rule 4 alone, the same cards (precheck fix 3: the desktop records
//                      the other library's card when this library's check finds the overlap, so each of the two has one).
//   sourceFailingCase(rows) -> 'gap' | 'failing' | null   what rule 1 finds now in a source's fetch_log lines (oldest first),
//                      counted back from the newest: 地址无效 SOURCE_GAP_ROUNDS times, or 暂时失败 / 访问被拒 SOURCE_FAILING_ROUNDS
//                      times (precheck fix 7: act.mjs staleReason expires a card of the other case, 'state-changed').
//
//   After you handled a key (dismissed / accepted / acted / expired in suggestions.jsonl), its rule only counts evidence newer
//   than that: 1–3 and 5 count fetch_log lines / rounds / ai-instructions lines / dismissals whose time is after the handling
//   (so a dismissed source-failing needs three new failing rounds); 4 fires again only if the set of shared keywords changed.
//   A card expired because its case changed ('state-changed', precheck fix 7) is not a handling: the count goes on from the
//   handling before it (records.mjs), so the card that fits now comes at once.
import { readConfig } from '../library/config.mjs';
import { readFetchLog } from '../fetch/log.mjs';
import { readRounds } from '../pipeline/rounds-log.mjs';
import { noOutputStreak, NO_OUTPUT_ROUNDS } from '../pipeline/numbers.mjs';
import { readAiInstructions } from '../verify/ai-instructions.mjs';
import { replaySuggestions, suggestionKey, clockOf } from './records.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { ledgerPath, replayLedger } from '../library/ledger.mjs';
import { DISMISS_QUICK } from '../pipeline/decide.mjs';

export const SOURCE_FAILING_ROUNDS = 3;
export const SOURCE_FAILING_STATES = ['failed', 'blocked'];
// redesign R5a (维护者 11-12 第 6 条): 地址无效 twice in a row is ① as well
export const SOURCE_GAP_ROUNDS = 2;
export const TOPIC_OVERLAP_PERCENT = 60;
// redesign R5a (N04): the same quick reason on the last three dismissals that carry one
export const DISMISS_REASON_COUNT = 3;
export { NO_OUTPUT_ROUNDS };

function timeOf(iso) {
  const t = Date.parse(typeof iso === 'string' ? iso : '');
  return Number.isNaN(t) ? null : t;
}

// true when the line is newer than the handling (no handling -> everything counts; a line without a time counts only then)
function after(iso, handledAt) {
  if (handledAt === null) return true;
  const t = timeOf(iso);
  return t !== null && t > handledAt;
}

function handledTimes(libraryDir) {
  const out = new Map();
  for (const [key, s] of replaySuggestions(libraryDir)) {
    if (s.handledAt === null || s.handledAt === undefined) continue;
    // an open key (suggested again after a handling) keeps the handling time, so it does not double-count
    out.set(key, { at: timeOf(s.handledAt), suggestion: s.handledSuggestion });
  }
  return out;
}

function activeSources(config) {
  const out = new Set();
  for (const s of config?.sources ?? []) {
    if (s && typeof s.name === 'string' && s.name !== '' && s.paused !== true) out.add(s.name);
  }
  return out;
}

export function normalizeKeyword(k) {
  return String(k).normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

export function topicKeywords(config) {
  const set = new Set();
  for (const t of config?.topics ?? []) {
    const words = typeof t === 'string' ? [t] : [t?.name, ...(Array.isArray(t?.keywords) ? t.keywords : [])];
    for (const w of words) {
      if (typeof w !== 'string') continue;
      const n = normalizeKeyword(w);
      if (n !== '') set.add(n);
    }
  }
  return set;
}

// J = |A ∩ B| / |A ∪ B|; overlaps() is the integer form of J >= percent
export function jaccard(a, b) {
  const shared = [...a].filter((x) => b.has(x)).sort();
  const union = new Set([...a, ...b]).size;
  return { shared, inter: shared.length, union, value: union === 0 ? 0 : shared.length / union };
}

export function overlaps({ inter, union }, percent = TOPIC_OVERLAP_PERCENT) {
  return union > 0 && inter * 100 >= percent * union;
}

export function sourceFailingCase(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let gaps = 0;
  for (let i = list.length - 1; i >= 0 && list[i]?.status === 'gap'; i -= 1) gaps += 1;
  if (gaps >= SOURCE_GAP_ROUNDS) return 'gap';
  let n = 0;
  for (let i = list.length - 1; i >= 0 && SOURCE_FAILING_STATES.includes(list[i]?.status); i -= 1) n += 1;
  return n >= SOURCE_FAILING_ROUNDS ? 'failing' : null;
}

function sourceFailing(libraryDir, sources, handled) {
  const bySource = new Map();
  for (const e of readFetchLog(libraryDir).entries) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source).push(e);
  }
  const out = [];
  for (const [source, rows] of bySource) {
    if (!sources.has(source)) continue;
    const key = suggestionKey('source-failing', source);
    const since = handled.get(key)?.at ?? null;
    const recent = rows.filter((r) => after(r.ts, since));
    const last = recent[recent.length - 1];
    // redesign R5a: 地址无效 (gap) twice in a row, counted back from the newest line
    let gaps = 0;
    for (let i = recent.length - 1; i >= 0 && recent[i].status === 'gap'; i -= 1) gaps += 1;
    if (gaps >= SOURCE_GAP_ROUNDS) {
      out.push({
        kind: 'source-failing',
        subject: source,
        evidence: {
          rounds: gaps, gap: gaps, state: 'gap', since: recent[recent.length - gaps].ts ?? null,
          last: { ts: last.ts ?? null, status: last.status, message: last.message ?? '', ...(last.http !== undefined && last.http !== null ? { http: last.http } : {}) },
        },
      });
      continue;
    }
    let n = 0;
    const counts = { failed: 0, blocked: 0 };
    for (let i = recent.length - 1; i >= 0 && SOURCE_FAILING_STATES.includes(recent[i].status); i -= 1) {
      n += 1;
      counts[recent[i].status] += 1;
    }
    if (n < SOURCE_FAILING_ROUNDS) continue;
    out.push({
      kind: 'source-failing',
      subject: source,
      evidence: {
        rounds: n,
        failed: counts.failed,
        blocked: counts.blocked,
        since: recent[recent.length - n].ts ?? null,
        last: { ts: last.ts ?? null, status: last.status, message: last.message ?? '', ...(last.http !== undefined && last.http !== null ? { http: last.http } : {}) },
      },
    });
  }
  return out;
}

function noOutput(libraryDir, handled) {
  const since = handled.get(suggestionKey('no-output', 'library'))?.at ?? null;
  const rounds = readRounds(libraryDir).filter((r) => after(r.startedAt ?? r.finishedAt, since)).reverse();
  const streak = noOutputStreak(rounds);
  if (streak < NO_OUTPUT_ROUNDS) return [];
  return [{ kind: 'no-output', subject: 'library', evidence: { rounds: streak, lastRound: rounds[0]?.id ?? null, since: rounds[streak - 1]?.startedAt ?? null } }];
}

function aiInstruction(libraryDir, sources, handled) {
  const bySource = new Map();
  for (const l of readAiInstructions(libraryDir)) {
    if (!sources.has(l.source)) continue;
    const since = handled.get(suggestionKey('ai-instruction', l.source))?.at ?? null;
    if (!after(l.at, since)) continue;
    if (!bySource.has(l.source)) bySource.set(l.source, []);
    bySource.get(l.source).push(l);
  }
  const out = [];
  for (const [source, lines] of bySource) {
    const items = [...new Set(lines.map((l) => l.itemId))];
    const phrases = [...new Set(lines.flatMap((l) => (Array.isArray(l.phrases) ? l.phrases : [])))];
    out.push({
      kind: 'ai-instruction',
      subject: source,
      evidence: { count: items.length, items: items.slice(0, 5), phrases: phrases.slice(0, 5), by: [...new Set(lines.map((l) => l.by))].sort(), lastAt: lines[lines.length - 1].at ?? null },
    });
  }
  return out;
}

function topicOverlap(config, otherLibraries, handled) {
  if (!Array.isArray(otherLibraries) || otherLibraries.length === 0) return [];
  const mine = topicKeywords(config);
  const out = [];
  for (const o of otherLibraries) {
    if (!o || typeof o.libraryId !== 'string' || o.libraryId === '' || typeof o.dir !== 'string') continue;
    const r = readConfig(o.dir);
    if (!r.ok) continue;
    const j = jaccard(mine, topicKeywords(r.config));
    if (!overlaps(j)) continue;
    const h = handled.get(suggestionKey('topic-overlap', o.libraryId));
    if (h && JSON.stringify(h.suggestion?.evidence?.shared ?? null) === JSON.stringify(j.shared)) continue;
    out.push({
      kind: 'topic-overlap',
      subject: o.libraryId,
      libraryId: o.libraryId,
      evidence: { jaccard: Math.round(j.value * 1000) / 1000, shared: j.shared, inter: j.inter, union: j.union },
    });
  }
  return out;
}

// redesign R5a (N04): the ledger's dismissals with a quick reason, oldest first ({ ts, quick, url })
function quickDismissals(libraryDir) {
  const path = ledgerPath(libraryDir);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let ev;
    try { ev = JSON.parse(raw); } catch { continue; }
    if (!ev || ev.ev !== 'dismissed' || typeof ev.url !== 'string' || !DISMISS_QUICK.includes(ev.quick)) continue;
    out.push({ ts: typeof ev.ts === 'string' ? ev.ts : null, quick: ev.quick, url: ev.url });
  }
  return out;
}

function dismissReason(libraryDir, handled) {
  const all = quickDismissals(libraryDir);
  if (all.length < DISMISS_REASON_COUNT) return [];
  const newest = all.slice(-DISMISS_REASON_COUNT);
  const quick = newest[0].quick;
  if (!newest.every((d) => d.quick === quick)) return [];
  const since = handled.get(suggestionKey('dismiss-reason', quick))?.at ?? null;
  // after a handling (忽略, 生成修改提议, …) only the dismissals since then count
  if (!newest.every((d) => after(d.ts, since))) return [];
  let titles = [];
  try { const states = replayLedger(libraryDir).states; titles = newest.map((d) => states.get(d.url)?.title ?? '').filter((t) => t !== ''); } catch { titles = []; }
  return [{ kind: 'dismiss-reason', subject: quick, evidence: { quick, count: DISMISS_REASON_COUNT, since: newest[0].ts, titles } }];
}

const asCard = (createdAt) => (s) => ({
  key: suggestionKey(s.kind, s.subject),
  kind: s.kind,
  ...(s.libraryId ? { libraryId: s.libraryId } : {}),
  subject: s.subject,
  evidence: s.evidence,
  createdAt,
});

export function overlapSuggestions(libraryDir, { now, otherLibraries } = {}) {
  const r = readConfig(libraryDir);
  if (!r.ok) return [];
  return topicOverlap(r.config, otherLibraries, handledTimes(libraryDir)).map(asCard(clockOf(now).toISOString()));
}

export function suggestFor(libraryDir, { now, otherLibraries } = {}) {
  const createdAt = clockOf(now).toISOString();
  const r = readConfig(libraryDir);
  const config = r.ok ? r.config : {};
  const sources = activeSources(config);
  const handled = handledTimes(libraryDir);
  const found = [
    ...sourceFailing(libraryDir, sources, handled),
    ...noOutput(libraryDir, handled),
    ...aiInstruction(libraryDir, sources, handled),
    ...(r.ok ? topicOverlap(config, otherLibraries, handled) : []),
    ...dismissReason(libraryDir, handled),
  ];
  return found.map(asCard(createdAt));
}
