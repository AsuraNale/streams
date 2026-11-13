// 系统检测's actions and the check that a card still fits (redesign R5a; docs/core-api.md 5.14.6–5.14.8; 维护者 11-11 动作表,
// 11-12 第 6 条): 「点一下由流息的代码执行、不调模型」 — only 「交由主 Agent 分析」 and 「生成修改提议」 hand the card to the main
// agent (the desktop runs that turn with handoffText). Nothing here calls a model or touches the note folder (V2).
//
// SUGGESTION_ACTIONS                   pause-source · edit-address · set-strictness · forward · draft-proposal · dismiss
// targetLevel(thresholds)              -> 'strict' | 'standard' | 'loose' | null   rule ②'s level: the strictest of the three
//                                         whose two thresholds are both not above the current ones and at least one below
//                                         (a custom pair too); null when none is (loose already, or looser)
// actionsFor(s, { thresholds })        -> [{ id, level? }]  the card's actions, the main one first (the 动作表)
// staleReason(libraryDir, s, { libraries? }) -> null | reason   a card that no longer fits: its source removed
//                                         ('source-removed'), paused ('source-paused') or its address changed ('source-changed');
//                                         the thresholds not the ones it was made under ('strictness-changed'); the other
//                                         library no longer registered ('library-removed') or no longer overlapping
//                                         ('overlap-gone'); the 追踪要求 changed since ('brief-changed'); rule ① now finds the
//                                         other case of the source — 地址无效 for a 暂时失败 / 访问被拒 card or the other way
//                                         round ('state-changed', precheck fix 7: the card that fits comes in its place, its
//                                         actions in the 动作表's order). `libraries`: the other REGISTERED libraries
//                                         [{ libraryId, dir }] (not given: ④ is not checked) — readable or not: one that cannot be
//                                         read now (a drive taken out) keeps its cards, only one gone from the list expires them
//                                         (precheck fix 8)
// checkSuggestions(libraryDir, { libraries?, now? }) -> [line]  every open card that no longer fits gets its `expired` line
// suggestionFacts(s)                   -> the card's evidence as the page and the model may see it: no fetcher message, no
//                                         HTTP code (O9) — the state and the hint (the 处理建议's key) instead
// suggestionText(s, { otherName?, lang?, thresholds? }) -> one sentence in the interface's words (N11)
// handoffText(s, { libraryName, otherName?, action, brief?, lang? }) -> what the main agent is handed: interface words, no
//                                         kind name, no JSON, no raw error
// runSuggestionAction(libraryDir, key, action, { libraries?, now? })
//   -> { done: true, line, changed?: [field], expired: [line] }   pause-source · set-strictness (streams.json changed,
//                                         changes.jsonl by 'you' = 手动修改) · dismiss · forward / draft-proposal (recorded as
//                                         accepted; the desktop runs the turn)
//   -> { done: false, navigate: { screen: 'sources', source, dialog: 'edit-address' } }   edit-address: nothing written —
//                                         the page opens the source's 修改地址 (the change itself is updateSource's)
//   -> { done: false, stale: reason, expired: [line] }   the card no longer fits: it is expired, nothing is done
//   throws not-open (no open card of that key) · bad-argument (an action the card does not have)
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { setSourcePaused } from '../library/sources.mjs';
import { hintOf } from '../fetch/states.mjs';
import { readFetchLog } from '../fetch/log.mjs';
import { pipelineFrom } from '../pipeline/config.mjs';
import { STRICTNESS, saveStrictness, strictnessOf } from '../pipeline/strictness.mjs';
import { recordChanges, snapshot, thresholdsOf } from '../proposals/changes.mjs';
import { wordsOf, adviceOf } from '../agent/words.mjs';
import { acceptSuggestion, actedSuggestion, dismissSuggestion, expireSuggestion, openSuggestions } from './records.mjs';
import { jaccard, overlaps, sourceFailingCase, topicKeywords } from './rules.mjs';

export const SUGGESTION_ACTIONS = Object.freeze(['pause-source', 'edit-address', 'set-strictness', 'forward', 'draft-proposal', 'dismiss']);
// the strictest first
const LEVEL_ORDER = ['strict', 'standard', 'loose'];

export function targetLevel(thresholds) {
  const r = thresholds?.relevance;
  const s = thresholds?.substance;
  if (typeof r !== 'number' || typeof s !== 'number') return null;
  for (const level of LEVEL_ORDER) {
    const L = STRICTNESS[level];
    if (L.relevance <= r && L.substance <= s && (L.relevance < r || L.substance < s)) return level;
  }
  return null;
}

export function actionsFor(s, { thresholds } = {}) {
  switch (s?.kind) {
    case 'source-failing':
      return s.evidence?.state === 'gap'
        ? [{ id: 'edit-address' }, { id: 'pause-source' }, { id: 'forward' }, { id: 'dismiss' }]
        : [{ id: 'pause-source' }, { id: 'edit-address' }, { id: 'forward' }, { id: 'dismiss' }];
    case 'no-output': {
      const level = targetLevel(thresholds);
      return [...(level ? [{ id: 'set-strictness', level }] : []), { id: 'forward' }, { id: 'dismiss' }];
    }
    case 'ai-instruction': return [{ id: 'pause-source' }, { id: 'forward' }, { id: 'dismiss' }];
    case 'topic-overlap': return [{ id: 'forward' }, { id: 'dismiss' }];
    case 'dismiss-reason': return [{ id: 'draft-proposal' }, { id: 'dismiss' }];
    default: return [{ id: 'forward' }, { id: 'dismiss' }];
  }
}

const sameNumbers = (a, b) => a?.relevance === b?.relevance && a?.substance === b?.substance;

export function staleReason(libraryDir, s, { libraries } = {}) {
  const r = readConfig(libraryDir);
  if (!r.ok) return null; // an unreadable library: the card stays as it is (nothing can be done on it anyway)
  const config = r.config;
  switch (s?.kind) {
    case 'source-failing':
    case 'ai-instruction': {
      const src = (Array.isArray(config.sources) ? config.sources : []).find((x) => x && x.name === s.subject);
      if (!src) return 'source-removed';
      if (src.paused === true) return 'source-paused';
      const b = s.basis?.source;
      if (b && ((src.url ?? null) !== (b.url ?? null) || (src.query ?? null) !== (b.query ?? null))) return 'source-changed';
      // precheck fix 7: ① has two cases under one key — the source now in the other one: this card gives way
      if (s.kind === 'source-failing') {
        let rows = [];
        try { rows = readFetchLog(libraryDir).entries.filter((e) => e.source === s.subject); } catch { rows = []; }
        const now = sourceFailingCase(rows);
        const was = s.evidence?.state === 'gap' ? 'gap' : 'failing';
        if (now !== null && now !== was) return 'state-changed';
      }
      return null;
    }
    case 'no-output': {
      const b = s.basis?.thresholds;
      if (b && !sameNumbers(b, thresholdsOf(pipelineFrom(config)))) return 'strictness-changed';
      return null;
    }
    case 'topic-overlap': {
      if (!Array.isArray(libraries)) return null;
      const other = libraries.find((l) => l && l.libraryId === s.subject);
      if (!other) return 'library-removed';
      const o = readConfig(other.dir);
      if (o.ok && !overlaps(jaccard(topicKeywords(config), topicKeywords(o.config)))) return 'overlap-gone';
      return null;
    }
    case 'dismiss-reason': {
      if (!s.basis || !Object.hasOwn(s.basis, 'brief')) return null;
      const now = typeof config.brief === 'string' && config.brief.trim() !== '' ? config.brief.trim() : null;
      return now !== s.basis.brief ? 'brief-changed' : null;
    }
    default: return null;
  }
}

export function checkSuggestions(libraryDir, { libraries, now } = {}) {
  const out = [];
  for (const s of openSuggestions(libraryDir)) {
    const reason = staleReason(libraryDir, s, { libraries });
    if (reason) out.push(expireSuggestion(libraryDir, s.key, { reason, now }));
  }
  return out;
}

export function suggestionFacts(s) {
  const e = s?.evidence && typeof s.evidence === 'object' ? s.evidence : {};
  switch (s?.kind) {
    case 'source-failing': {
      const last = e.last ?? {};
      const status = typeof last.status === 'string' ? last.status : null;
      let hint = null;
      try { hint = status ? hintOf(status) : null; } catch { hint = null; }
      return {
        rounds: e.rounds ?? 0, state: e.state === 'gap' ? 'gap' : 'failing',
        ...(e.state === 'gap' ? { gap: e.gap ?? e.rounds ?? 0 } : { failed: e.failed ?? 0, blocked: e.blocked ?? 0 }),
        since: e.since ?? null, last: { ts: last.ts ?? null, status, hint },
      };
    }
    case 'no-output': return { rounds: e.rounds ?? 0, since: e.since ?? null, lastRound: e.lastRound ?? null };
    case 'ai-instruction': return { count: e.count ?? 0, items: Array.isArray(e.items) ? e.items : [], phrases: Array.isArray(e.phrases) ? e.phrases.filter((p) => typeof p === 'string') : [], lastAt: e.lastAt ?? null };
    case 'topic-overlap': return { jaccard: e.jaccard ?? 0, percent: Math.round((e.jaccard ?? 0) * 100), shared: Array.isArray(e.shared) ? e.shared : [], inter: e.inter ?? 0, union: e.union ?? 0 };
    case 'dismiss-reason': return { quick: e.quick ?? s.subject, count: e.count ?? 0, since: e.since ?? null, titles: Array.isArray(e.titles) ? e.titles : [] };
    default: return {};
  }
}

const SEP = { zh: '、', en: ', ' };

export function suggestionText(s, { otherName, lang = 'zh', thresholds } = {}) {
  const l = lang === 'en' ? 'en' : 'zh';
  const W = wordsOf(l);
  const f = suggestionFacts(s);
  const name = s?.subject ?? '';
  switch (s?.kind) {
    case 'source-failing': {
      const last = f.last?.status ?? (f.state === 'gap' ? 'gap' : 'failed');
      if (f.state === 'gap') {
        return l === 'en'
          ? `The source "${name}" came back "${W.states.gap}" on ${f.rounds} runs in a row. What to do: ${adviceOf('gap', l)}`
          : `来源「${name}」连续 ${f.rounds} 次运行的抓取结果为「${W.states.gap}」。处理建议：${adviceOf('gap', l)}`;
      }
      return l === 'en'
        ? `The source "${name}" could not be fetched on ${f.rounds} runs in a row ("${W.states.failed}" ${f.failed} times, "${W.states.blocked}" ${f.blocked} times). What to do: ${adviceOf(last, l)}`
        : `来源「${name}」连续 ${f.rounds} 次运行未能抓取（「${W.states.failed}」${f.failed} 次、「${W.states.blocked}」${f.blocked} 次）。处理建议：${adviceOf(last, l)}`;
    }
    case 'no-output': {
      const level = thresholds ? W.levels[strictnessOf(thresholds)] : null;
      return l === 'en'
        ? `${f.rounds} runs in a row put nothing new into the inbox.${level ? ` The strictness now: "${level}".` : ''}`
        : `连续 ${f.rounds} 次运行没有新内容进入待看。${level ? `当前严格程度：「${level}」。` : ''}`;
    }
    case 'ai-instruction': {
      const phrase = f.phrases[0];
      return l === 'en'
        ? `Instructions aimed at AI were detected in ${f.count} item${f.count === 1 ? '' : 's'} of the source "${name}"${phrase ? `, for example: "${phrase}"` : ''}.`
        : `来源「${name}」的 ${f.count} 条内容中检测到面向 AI 的指令${phrase ? `，例如：「${phrase}」` : ''}。`;
    }
    case 'topic-overlap': {
      const other = otherName ?? s?.libraryId ?? name;
      const shared = f.shared.slice(0, 8).join(SEP[l]);
      return l === 'en'
        ? `Its topics and keywords overlap ${f.percent}% with the library "${other}"${shared ? ` (shared: ${shared})` : ''}.`
        : `与库「${other}」的主题与关键词重合 ${f.percent}%${shared ? `（共同的词：${shared}）` : ''}。`;
    }
    case 'dismiss-reason': {
      const word = W.quick[f.quick] ?? f.quick;
      return l === 'en'
        ? `The last ${f.count} discards all gave the reason "${word}".`
        : `最近 ${f.count} 次放弃都选择了「${word}」。`;
    }
    default: return '';
  }
}

export function handoffText(s, { libraryName, otherName, action = 'forward', brief = null, lang = 'zh', thresholds } = {}) {
  const l = lang === 'en' ? 'en' : 'zh';
  const W = wordsOf(l);
  const what = suggestionText(s, { otherName, lang: l, thresholds });
  if (action === 'draft-proposal') {
    return l === 'en'
      ? `In "to confirm", the user pressed "${W.buttons.draftProposal}" on something Streams detected in the library "${libraryName}": ${what} Write one proposal by the main agent that edits the library's brief (give the whole brief as it should read after the edit; Streams shows it as before / after). The brief stays as it is until the user confirms it.${brief ? ` The brief now: "${brief}"` : ''}`
      : `用户在「待确认」中对库「${libraryName}」的一条系统检测点击了「${W.buttons.draftProposal}」。系统检测：${what}请据此出一条修改追踪要求的主 Agent 提议（写出修改后的追踪要求全文，流息会列出修改前 / 修改后）；用户确认前，追踪要求保持不变。${brief ? `当前追踪要求：「${brief}」` : ''}`;
  }
  return l === 'en'
    ? `In "to confirm", the user pressed "${W.buttons.forward}" on something Streams detected in the library "${libraryName}": ${what} Look into why. If a setting should change, make a proposal by the main agent (it takes effect only once the user confirms it); if not, say why.`
    : `用户在「待确认」中对库「${libraryName}」的一条系统检测点击了「${W.buttons.forward}」。系统检测：${what}请分析原因；需要修改设置时，出一条主 Agent 提议（用户确认后才生效）；不需要就说明原因。`;
}

export function runSuggestionAction(libraryDir, key, action, { libraries, now } = {}) {
  if (!SUGGESTION_ACTIONS.includes(action)) throw new StreamsError('bad-argument', `an action is one of ${SUGGESTION_ACTIONS.join(' · ')}`);
  const s = openSuggestions(libraryDir).find((x) => x.key === key);
  if (!s) throw new StreamsError('not-open', `suggestion "${key}" is not open`);
  // a card that no longer fits is expired and never acted on
  const reason = staleReason(libraryDir, s, { libraries });
  if (reason) return { done: false, stale: reason, expired: [expireSuggestion(libraryDir, key, { reason, now })] };
  const r = readConfig(libraryDir);
  const thresholds = r.ok ? thresholdsOf(pipelineFrom(r.config)) : null;
  const allowed = actionsFor(s, { thresholds });
  const chosen = allowed.find((a) => a.id === action);
  if (!chosen) throw new StreamsError('bad-argument', `"${action}" is not an action of ${s.kind} (${allowed.map((a) => a.id).join(' · ')})`);
  // a change of streams.json, recorded as the user's own (变更记录: 手动修改), then the card's line
  const yours = (fields, fn) => {
    const before = snapshot(libraryDir, fields);
    fn();
    return recordChanges(libraryDir, before, snapshot(libraryDir, fields), { by: 'you', now }).map((x) => x.field);
  };
  switch (action) {
    case 'pause-source': {
      const changed = yours(['sources'], () => setSourcePaused(libraryDir, s.subject, true));
      const line = actedSuggestion(libraryDir, key, { action, now });
      return { done: true, line, changed, expired: checkSuggestions(libraryDir, { libraries, now }) };
    }
    case 'set-strictness': {
      const changed = yours(['thresholds'], () => saveStrictness(libraryDir, chosen.level));
      const line = actedSuggestion(libraryDir, key, { action, level: chosen.level, now });
      return { done: true, line, changed, expired: checkSuggestions(libraryDir, { libraries, now }) };
    }
    case 'edit-address':
      return { done: false, navigate: { screen: 'sources', source: s.subject, dialog: 'edit-address' } };
    case 'dismiss':
      return { done: true, line: dismissSuggestion(libraryDir, key, { now }), expired: [] };
    default:
      return { done: true, line: acceptSuggestion(libraryDir, key, { action, now }), expired: [] };
  }
}
