// Rule-based suggestion cards (v2 package D2; architecture 2.2 「建议卡 suggest」). No model call, no write.
//
// suggestFor(libraryDir, { now?, otherLibraries? }) -> [{ key, kind, libraryId?, subject, evidence, createdAt }]
//   key = `${kind}:${subject}` (the dedup key of suggestions.jsonl). Reads streams.json, fetch_log.jsonl, rounds.jsonl,
//   ai-instructions.jsonl, suggestions.jsonl (and the other libraries' streams.json); writes nothing anywhere. The maintainer 11-05
//   「先不放权」: a suggestion is only ever shown to you; nothing in src/suggest/ changes a source, a topic or a setting.
//
//   1. source-failing  subject = source name. The source's newest fetch_log lines, counted back from the last one, are
//                      `failed` (暂时失败) or `blocked` (被拒绝), mixed or not, at least SOURCE_FAILING_ROUNDS (3) in a row.
//                      Any other status (ok / empty / gap / paused) ends the run. Paused or removed sources are skipped.
//   2. no-output       subject = 'library'. noOutputStreak (v1.0, rounds.jsonl newest first) >= NO_OUTPUT_ROUNDS (3).
//   3. ai-instruction  subject = source name. The source has at least one ai-instructions.jsonl line. Paused or
//                      removed sources are skipped.
//   4. topic-overlap   subject = the other library's id (also in `libraryId`), only when `otherLibraries`
//                      ([{ libraryId, dir }]) is given. K(lib) = the set of every topic name and keyword of the library's
//                      streams.json topics[], each NFKC + lower case + trimmed + inner whitespace collapsed, empty dropped.
//                      Jaccard J = |K(this) ∩ K(other)| / |K(this) ∪ K(other)|; fires when the union is not empty and
//                      J >= TOPIC_OVERLAP_PERCENT (60%), computed in integers: 100·|∩| >= 60·|∪| (no float rounding).
//
//   After you handled a key (dismissed / accepted in suggestions.jsonl), its rule only counts evidence newer than that:
//   1–3 count fetch_log lines / rounds / ai-instructions lines whose time is after the handling (so a dismissed
//   source-failing needs three new failing rounds); 4 fires again only if the set of shared keywords changed.
import { readConfig } from '../library/config.mjs';
import { readFetchLog } from '../fetch/log.mjs';
import { readRounds } from '../pipeline/rounds-log.mjs';
import { noOutputStreak, NO_OUTPUT_ROUNDS } from '../pipeline/numbers.mjs';
import { readAiInstructions } from '../verify/ai-instructions.mjs';
import { replaySuggestions, suggestionKey, clockOf } from './records.mjs';

export const SOURCE_FAILING_ROUNDS = 3;
export const SOURCE_FAILING_STATES = ['failed', 'blocked'];
export const TOPIC_OVERLAP_PERCENT = 60;
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
    let n = 0;
    const counts = { failed: 0, blocked: 0 };
    for (let i = recent.length - 1; i >= 0 && SOURCE_FAILING_STATES.includes(recent[i].status); i -= 1) {
      n += 1;
      counts[recent[i].status] += 1;
    }
    if (n < SOURCE_FAILING_ROUNDS) continue;
    const last = recent[recent.length - 1];
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
  ];
  return found.map((s) => ({
    key: suggestionKey(s.kind, s.subject),
    kind: s.kind,
    ...(s.libraryId ? { libraryId: s.libraryId } : {}),
    subject: s.subject,
    evidence: s.evidence,
    createdAt,
  }));
}
