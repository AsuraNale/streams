// The main agent's lookups (v2 package C, contract C2; docs/core-api.md 5.15.4): what it may ask to see, looked up by the
// code, read only (nothing is written anywhere; the result goes into the transcript as a `lookup` row by the turn).
//
// runLookup(item, { registry, proposals, now }) -> { what, ok: true, result } | { what, ok: false, error }
//   library       { libraryId }            the library's configuration and state: name, brief, topics with their keywords,
//                                          every source with its last fetch, the gates' thresholds, the cap, the schedule,
//                                          待看, the last round, problems, open suggestions, pending cards
//   source_log    { libraryId, name }      the source's newest SOURCE_LOG_LINES fetch_log lines (newest first)
//   proposals     { libraryId? }           the newest PROPOSALS_SHOWN cards of that library (or all), in short
//   suggestions   { libraryId? }           the open suggestion cards of that library (or every library)
//   notes_search  { libraryId, query }     kept items (index.jsonl, status kept) whose title holds every word of the query
//                                          (case aside): at most NOTES_SEARCH_MAX, title and date only — never the text
// Redesign R5a (N11 · O9): every result in the interface's words — a fetch's state as the page says it with what to do
// about it (words.mjs stateWord / adviceOf), never its internal code, its HTTP code or the fetcher's message; a proposal's
// kind and status as the page names them; a 系统检测 as one sentence (act.mjs suggestionText), never its kind or evidence.
// Errors: unknown-what · missing-field · unknown-library · library-unreadable · unknown-source. A result longer than
// RESULT_MAX characters once written out is cut (and says so).
import { readConfig } from '../library/config.mjs';
import { readIndex } from '../library/index.mjs';
import { lastRoundStatus, readFetchLog } from '../fetch/log.mjs';
import { pipelineFrom } from '../pipeline/config.mjs';
import { scheduleOf } from '../pipeline/schedule.mjs';
import { thresholdsOf } from '../proposals/changes.mjs';
import { openSuggestions } from '../suggest/records.mjs';
import { LOOKUP_KINDS } from './protocol.mjs';
import { suggestionText } from '../suggest/act.mjs';
import { PROPOSAL_KIND_WORDS, PROPOSAL_STATUS_WORDS, adviceOf, stateWord } from './words.mjs';
import { PROBLEM_WORDS, libraryFacts } from './situation.mjs';

export const SOURCE_LOG_LINES = 10;
export const PROPOSALS_SHOWN = 20;
export const NOTES_SEARCH_MAX = 10;
export const RESULT_MAX = 6000;

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const err = (what, error, extra = {}) => ({ what, ok: false, error, ...extra });

function entryOf(registry, id) {
  return (Array.isArray(registry?.libraries) ? registry.libraries : []).find((l) => l && l.id === id) ?? null;
}

const kindWord = (k) => PROPOSAL_KIND_WORDS.zh[k] ?? k;
const shortCard = (c) => ({ id: c.id, kind: c.kind, what: kindWord(c.kind), libraryId: c.libraryId ?? null, status: PROPOSAL_STATUS_WORDS.zh[c.status] ?? '', why: c.why, createdAt: c.createdAt, ...(c.reviseText ? { reviseText: c.reviseText } : {}) });
// a source's last fetch as the model may see it: the state in words and what to do (no code, no HTTP code, no message)
const fetchFacts = (status) => ({ state: stateWord(status, 'zh'), advice: adviceOf(status, 'zh') });
const namesOf = (registry) => Object.fromEntries((Array.isArray(registry?.libraries) ? registry.libraries : []).filter((l) => l && typeof l.id === 'string').map((l) => [l.id, l.name]));

function cut(out) {
  const text = JSON.stringify(out.result ?? null);
  if (text.length <= RESULT_MAX) return out;
  return { ...out, result: { truncated: true, text: `${text.slice(0, RESULT_MAX)}…` } };
}

export function runLookup(item, { registry, proposals = [], now = () => new Date() } = {}) {
  const what = item?.what;
  if (!LOOKUP_KINDS.includes(what)) return err(String(what), 'unknown-what', { allowed: LOOKUP_KINDS });
  const needLibrary = what === 'library' || what === 'source_log' || what === 'notes_search';
  const id = item.libraryId;
  if (needLibrary && !nonEmpty(id)) return err(what, 'missing-field', { field: 'libraryId' });
  const entry = nonEmpty(id) ? entryOf(registry, id) : null;
  if (nonEmpty(id) && !entry) return err(what, 'unknown-library', { libraryId: id });
  const cards = Array.isArray(proposals) ? proposals : [];

  switch (what) {
    case 'library': {
      const cfg = readConfig(entry.path);
      if (!cfg.ok) return err(what, 'library-unreadable', { libraryId: id });
      const facts = libraryFacts(entry, { now, proposals: cards, names: namesOf(registry) });
      const status = (() => { try { return lastRoundStatus(entry.path); } catch { return {}; } })();
      const c = cfg.config;
      const pipeline = pipelineFrom(c);
      const result = {
        id: entry.id, name: entry.name, brief: facts.brief ?? null,
        topics: (Array.isArray(c.topics) ? c.topics : []).filter((t) => t && typeof t.name === 'string').map((t) => ({ name: t.name, keywords: Array.isArray(t.keywords) ? t.keywords : [] })),
        sources: (Array.isArray(c.sources) ? c.sources : []).filter((s) => s && typeof s.name === 'string').map((s) => ({
          name: s.name, kind: s.kind, ...(s.url ? { url: s.url } : {}), ...(s.query ? { query: s.query } : {}), ...(s.topic ? { topic: s.topic } : {}),
          paused: s.paused === true, last: status[s.name] ? { ...fetchFacts(status[s.name].status), consecutive: status[s.name].consecutive, at: status[s.name].lastTs ?? null } : null,
        })),
        thresholds: thresholdsOf(pipeline), cap: pipeline.cap ?? null, schedule: scheduleOf(c.schedule),
        inbox: facts.inbox, lastRound: facts.lastRound,
        // redesign R5a (precheck fix 5): the problems in the interface's words, as the situation says them (not missing / sources / no-output)
        problems: facts.problems.map((p) => PROBLEM_WORDS[p] ?? p), noOutputStreak: facts.noOutputStreak,
        suggestions: facts.suggestions, pendingProposals: facts.pendingProposals.map((p) => ({ id: p.id, kind: p.kind, what: kindWord(p.kind) })),
      };
      return cut({ what, ok: true, result });
    }
    case 'source_log': {
      if (!nonEmpty(item.name)) return err(what, 'missing-field', { field: 'name' });
      const cfg = readConfig(entry.path);
      if (!cfg.ok) return err(what, 'library-unreadable', { libraryId: id });
      const known = (Array.isArray(cfg.config.sources) ? cfg.config.sources : []).some((s) => s && s.name === item.name);
      const { entries } = readFetchLog(entry.path);
      const rows = entries.filter((e) => e.source === item.name);
      if (!known && rows.length === 0) return err(what, 'unknown-source', { libraryId: id, name: item.name });
      const result = rows.slice(-SOURCE_LOG_LINES).reverse().map((e) => ({ ts: e.ts, ...fetchFacts(e.status), count: e.count, new: e.new }));
      return cut({ what, ok: true, result: { libraryId: id, name: item.name, inConfig: known, lines: result } });
    }
    case 'proposals': {
      const list = cards.filter((c) => c && (!entry || c.libraryId === id)).slice(-PROPOSALS_SHOWN).reverse().map(shortCard);
      return cut({ what, ok: true, result: { libraryId: entry ? id : null, cards: list } });
    }
    case 'suggestions': {
      const libs = entry ? [entry] : (Array.isArray(registry?.libraries) ? registry.libraries : []);
      const out = [];
      for (const l of libs) {
        let open = [];
        try { open = openSuggestions(l.path); } catch { open = []; }
        for (const s of open) out.push({ libraryId: l.id, library: l.name, text: suggestionText(s, { otherName: namesOf(registry)[s.libraryId ?? s.subject], lang: 'zh' }), createdAt: s.createdAt });
      }
      return cut({ what, ok: true, result: { libraryId: entry ? id : null, suggestions: out } });
    }
    case 'notes_search': {
      if (!nonEmpty(item.query)) return err(what, 'missing-field', { field: 'query' });
      const words = item.query.toLowerCase().split(/\s+/).filter(Boolean);
      let index = [];
      try { index = readIndex(entry.path); } catch { return err(what, 'library-unreadable', { libraryId: id }); }
      const hits = index.filter((e) => e && e.status === 'kept' && typeof e.title === 'string' && words.every((w) => e.title.toLowerCase().includes(w)));
      const items = hits.slice(0, NOTES_SEARCH_MAX).map((e) => ({ title: e.title, date: e.date ?? null }));
      return cut({ what, ok: true, result: { libraryId: id, query: item.query, items, more: Math.max(0, hits.length - items.length) } });
    }
    default:
      return err(String(what), 'unknown-what');
  }
}
