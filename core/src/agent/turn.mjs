// One turn of the conversation with the main agent (v2 package C, contract C2; docs/core-api.md 5.15.5).
//
// agentTurn({ text, libraryId?, as? }, ctx) -> { turn, reply, ask, proposalIds, notice?, calls, lookupRounds }
//   text        the user's sentence (1–TEXT_IN_MAX characters); as 'note': something the app hands over instead (a
//               suggestion card the user accepted), written as a `note` row, not a `you` row
//   libraryId   the library whose dialog the sentence came from (said in the prompt; a library card without
//               params.libraryId takes it)
//   ctx = { agentDir, connector (connect/session.mjs createSessionConnector, or agent/fake.mjs), registry (or a function
//           giving it), proposals (cards, or a function), createProposal(kind, params, why, { by }) (package B's, the
//           desktop's services/proposals.mjs), now, log, situationMax, rawError?(where, { code, message }),
//           language?, connection? }
//           (redesign R5a: where a raw text goes besides the log — the desktop's raw-errors.mjs, for 「复制诊断信息」;
//           1.0.1 F3 · F5: the interface's language and the connection in use — or a function giving it, read at the turn —
//           handed to the situation, which reads only the connection's kind, vendor and two model slots)
//
// What the model is given: AGENT_SYSTEM (protocol.mjs) + the situation (situation.mjs) + this turn; and the context of the
// conversation — the newest summary and the last RECENT_TURNS turns, from the transcript — whenever the connection does
// not hold it: always for an API connection (it is replayed every call), and for Claude Code / Codex when a session is
// opened (the first turn, a lost or missing session.json, a resume that fails, after a compression).
// The answer (protocol.mjs checkAnswer): not usable → one retry, told what was wrong; still not → the `reply` that can be
// read out of it, else NOT_UNDERSTOOD — no card made, no lookup run, no note kept (notice 'not-understood').
// `lookups`: run read only (lookups.mjs), each one a `lookup` row, then the model is called again with the results; at
// most MAX_LOOKUP_ROUNDS rounds; the call after the last round is told so and may not ask again (an answer that does is
// not usable: retried once, then as above).
// `proposals`: each one handed to ctx.createProposal(kind, params, why, { by: 'agent' }); one that is not an object of
// { kind, params, why } or that createProposal refuses is not made — a `note` row and the end of the reply say so in the
// interface's words (words.mjs droppedSentence: 「有 N 项提议未能生成：添加来源 · 来源填写有误」 — the action's name and the
// kind of failure; notice 'proposals-dropped'). Redesign R5a (precheck fix 2): no kind name, no code, no raw text in the row's
// text or data (data.dropped = [{ index, category }]); the thrower's own text goes to ctx.log and ctx.rawError only.
// `note`: kept in agent/notes.jsonl (store.mjs appendAgentNote).
// The connection failing (not logged in, network, …): a `note` row, reply null (notice 'connection'). Redesign R5a (precheck
// fix 2): the row says it in the page's words (words.mjs connectionSentence); data.error is the code the page words
// (CONNECTIONS.codes), never the connection's own text (that goes to ctx.log and ctx.rawError).
// Every call is one line of agent/usage.jsonl (purpose 'agent'; the summary's 'agent-summary').
// At the end, compressIfNeeded: more than COMPRESS_THRESHOLD characters of transcript since the last summary → the model
// (a one-shot call, no session) writes a summary of at most AGENT_SUMMARY_MAX characters: a `summary` row (data.through = this
// turn), the session cache's summarizedThrough moves on and its session is let go (the next turn opens a new one with the
// summary and the recent turns).
import { StreamsError } from '../errors.mjs';
import { createUsageRecorder } from '../connect/usage.mjs';
import { completeJson } from '../connect/complete-json.mjs';
import { LIBRARY_KINDS } from '../proposals/params.mjs';
import { AGENT_SYSTEM, MAX_LOOKUP_ROUNDS, checkAnswer } from './protocol.mjs';
import { DROP_CATEGORIES, connectionSentence, dropCategory, droppedSentence } from './words.mjs';
import { runLookup } from './lookups.mjs';
import { situation } from './situation.mjs';
import {
  agentPaths, appendAgentNote, appendTranscript, lastSummary, nextTurn, readAgentNotes, readSessions, readTranscript, summarizedThrough, writeSession,
} from './store.mjs';

export const TEXT_IN_MAX = 4000;
export const COMPRESS_THRESHOLD = 40_000;
export const AGENT_SUMMARY_MAX = 2000;
export const RECENT_TURNS = 6;
export const RECENT_MAX_CHARS = 12_000;
export const LOOKUP_ROW_MAX = 1500;
export const NOTES_IN_SITUATION = 5;
export const NOT_UNDERSTOOD = Object.freeze({ zh: '这次没有听懂模型的回答', en: "This time the model's answer could not be understood." });
export const NOTICE_CODES = Object.freeze(['not-understood', 'proposals-dropped', 'connection', 'session-rebuilt']);

/**
 * Redesign R5b (precheck fix 3; 05 规则 8): the model calls one message takes, as the page says them (desktop screens/proposal.js
 * AGENT_CALLS holds the same numbers; core/test/r5b.test.mjs drives agentTurn to each one).
 *   lo   1 — an answer straight away
 *   hi   1 + MAX_LOOKUP_ROUNDS — an answer after every round of lookups (the usual most)
 *   max  everything that can be added to that: each of those 1 + MAX_LOOKUP_ROUNDS answers not usable and asked once more (×2),
 *        each of those calls on a session that will not resume and sent again on a new one (×2), then the summary of the
 *        conversation (compressIfNeeded: completeJson, one more try on a bad format: 2) — (1 + 3) × 2 × 2 + 2 = 18
 */
export const SUMMARY_CALLS_MAX = 2;
export const TURN_CALLS = Object.freeze({ lo: 1, hi: 1 + MAX_LOOKUP_ROUNDS, max: (1 + MAX_LOOKUP_ROUNDS) * 2 * 2 + SUMMARY_CALLS_MAX });

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const charsOf = (s) => [...String(s ?? '')].length;
const clip = (s, n) => { const c = [...String(s ?? '')]; return c.length > n ? `${c.slice(0, n).join('')}…` : c.join(''); };

/** 'zh' when the text holds a CJK character, else 'en': the language of the code's own sentences in a reply. */
export function languageOf(text) {
  return /[㐀-鿿豈-﫿]/.test(String(text ?? '')) ? 'zh' : 'en';
}

// redesign R5a (precheck fix 2): the sentence of the proposals not made is words.mjs droppedSentence (the action, the kind of failure)
export { droppedSentence };

// the kind of failure of a row written before redesign R5a's precheck fix 2 (its reason was 'shape: …', 'no-proposal-service'
// or '<code> (<reason>): <message>')
function oldCategory(reason) {
  const s = String(reason ?? '');
  if (s.startsWith('shape')) return 'format';
  const m = /^([a-z-]+)(?: \(([a-z-]+)\))?/.exec(s);
  return m ? dropCategory({ code: m[1], reason: m[2] }) : 'error';
}

const SESSION_LOST = '会话接不上，开了新会话，从对话记录（摘要 + 最近几条消息）重建上下文';

/**
 * Redesign R5a (precheck fix 2; N11 · O9): a row as the model reads it again and as the page gets it (desktop
 * getAgentTranscript): a note of the proposals not made, of a connection that failed or of a session lost says it in the
 * interface's words, and its data keeps only the keys the page words (data.dropped [{ index, category }], data.error the
 * connection's code, data.session) — no kind name, no raw text. Rows written before this fix (kind names, codes and raw texts
 * in them) are said again the same way; the rest as they are.
 */
export function publicRow(r) {
  if (!r || r.role !== 'note' || !isObject(r.data)) return r;
  const d = r.data;
  const lang = languageOf(r.text);
  if (Array.isArray(d.dropped)) {
    const list = d.dropped.map((x) => ({ index: Number.isInteger(x?.index) ? x.index : null, kind: x?.kind ?? null, category: DROP_CATEGORIES.includes(x?.category) ? x.category : oldCategory(x?.reason) }));
    const old = d.dropped.some((x) => isObject(x) && (x.reason !== undefined || x.kind !== undefined));
    return { ...r, text: old ? droppedSentence(list, lang) : r.text, data: { dropped: list.map(({ index, category }) => ({ index, category })) } };
  }
  if (typeof d.error === 'string') return { ...r, text: connectionSentence(d.error, lang), data: { error: d.error } };
  if (d.session === 'lost') return { ...r, text: SESSION_LOST, data: { session: 'lost' } };
  return r;
}

// a transcript row as the model reads it again (redesign R5a: through publicRow)
function renderRow(row) {
  const r = publicRow(row);
  switch (r.role) {
    case 'you': return `用户：${r.text}`;
    case 'agent': return `你（主 Agent）：${r.text}${r.data?.ask ? `\n（问了：${r.data.ask.question}｜${r.data.ask.options.join('｜')}）` : ''}${r.data?.proposalIds?.length ? `\n（出了主 Agent 提议：${r.data.proposalIds.join('、')}）` : ''}`;
    case 'lookup': return `（查了 ${r.text}）`;
    case 'note': return `（流息：${r.text}）`;
    default: return '';
  }
}

/** The context rebuilt from the transcript: the newest summary + the last RECENT_TURNS turns (at most RECENT_MAX_CHARS). */
export function historyBlock(rows, { recentTurns = RECENT_TURNS, maxChars = RECENT_MAX_CHARS } = {}) {
  const parts = [];
  const s = lastSummary(rows);
  // redesign R5a (N11): 「第 n 条消息」, not the word the interface no longer uses (轮)
  if (s) parts.push(`## 之前对话的摘要（到第 ${s.data?.through ?? '?'} 条消息）\n${s.text}`);
  const turns = [...new Set(rows.filter((r) => r.role !== 'summary').map((r) => r.turn))].slice(-recentTurns);
  const recent = rows.filter((r) => r.role !== 'summary' && turns.includes(r.turn)).map(renderRow).filter(Boolean);
  while (recent.length && charsOf(recent.join('\n')) > maxChars) recent.shift();
  if (recent.length) parts.push(`## 最近的对话\n${recent.join('\n')}`);
  return parts.join('\n\n');
}

function turnBlock(text, { as, libraryId, registry }) {
  const lib = libraryId ? (registry?.libraries ?? []).find((l) => l.id === libraryId) : null;
  const from = libraryId ? `（这句话是从库「${lib?.name ?? libraryId}」（id ${libraryId}）的对话框转来的）\n` : '';
  // redesign R5a (N11): 这条消息 (the user's one message, or one thing the interface hands over), not 这一轮
  if (as === 'note') return `## 这条消息\n${from}流息转来一件事（不是用户打的字，是界面上的一个动作）：\n${text}`;
  return `## 这条消息\n${from}用户：${text}`;
}

const ANSWER_NOW = 'Answer with the one JSON object only.';
const LAST_CALL = `已经查了 ${MAX_LOOKUP_ROUNDS} 次 (you looked things up ${MAX_LOOKUP_ROUNDS} times): this is the last answer of this turn. No "lookups" now: answer with what you have, the one JSON object only.`;

function lookupRowText(item, out) {
  const head = [item.what, item.libraryId, item.name, item.query].filter(nonEmpty).join(' ');
  return clip(`${head} → ${out.ok ? JSON.stringify(out.result) : `error: ${out.error}`}`, LOOKUP_ROW_MAX);
}

/** The usage line of one call. */
function recordUsage(usage, kind, r, purpose) {
  const u = r?.usage || {};
  try {
    usage.record({ kind: kind || 'unknown', model: r?.model, calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, purpose, ok: r?.ok === true, code: r?.ok ? undefined : r?.code });
  } catch { /* the record is best effort; the turn goes on */ }
}

export async function agentTurn(input, ctx) {
  const { text, libraryId = null, as = 'you' } = input ?? {};
  if (!nonEmpty(text) || charsOf(text.trim()) > TEXT_IN_MAX) throw new StreamsError('bad-argument', `a message is 1–${TEXT_IN_MAX} characters`);
  if (as !== 'you' && as !== 'note') throw new StreamsError('bad-argument', 'as is you or note');
  const { agentDir, connector, createProposal, now = () => new Date(), log = () => {}, situationMax } = ctx ?? {};
  // redesign R5a (O9): a raw text (a refusal's message, a connection's detail) goes to the log and the diagnostics only
  const rawError = (where, raw) => {
    try { log(`agent: ${where}: ${[raw?.code, raw?.message].filter(Boolean).join(' · ')}`); } catch { /* best effort */ }
    try { if (typeof ctx?.rawError === 'function') ctx.rawError(where, raw); } catch { /* best effort */ }
  };
  if (!agentDir || !connector || typeof connector.send !== 'function') throw new StreamsError('bad-argument', 'agentTurn needs agentDir and a connector');
  const registry = typeof ctx.registry === 'function' ? ctx.registry() : (ctx.registry ?? { libraries: [] });
  const cards = typeof ctx.proposals === 'function' ? ctx.proposals() : (ctx.proposals ?? []);
  const paths = agentPaths(agentDir);
  const usage = createUsageRecorder(paths.usage, { now });
  const lang = languageOf(text);
  const kind = connector.kind || 'unknown';

  const before = readTranscript(agentDir).rows;
  const turn = nextTurn(before);
  const write = (role, t, data) => appendTranscript(agentDir, { turn, role, text: t, data }, { now });
  const history = historyBlock(before);
  const through = summarizedThrough(before);
  write(as, text.trim(), libraryId ? { libraryId } : undefined);

  const connection = typeof ctx.connection === 'function' ? ctx.connection() : (ctx.connection ?? null);
  const sit = situation(registry, { now, proposals: cards, notes: readAgentNotes(agentDir, { limit: NOTES_IN_SITUATION }), agentUsageFile: paths.usage, language: ctx.language, connection, ...(situationMax ? { maxChars: situationMax } : {}) }).text;
  const thisTurn = turnBlock(text.trim(), { as, libraryId, registry });
  const pieces = [];
  const notice = [];
  let calls = 0;

  // the session of this connection kind: carried over from session.json (a CLI); none for an API connection
  const cached = readSessions(agentDir)[kind] ?? null;
  const state = { sessionId: connector.sessionful ? (cached?.sessionId ?? null) : null, startedAt: cached?.startedAt ?? null, turns: cached?.turns ?? 0, opened: false };

  const fullPrompt = (instr) => [history, sit, thisTurn, ...pieces, instr].filter(nonEmpty).join('\n\n');
  const shortPrompt = (instr) => (pieces.length === 0 ? [sit, thisTurn, instr] : [pieces.at(-1), instr]).filter(nonEmpty).join('\n\n');

  const saveSession = () => writeSession(agentDir, kind, { sessionId: state.sessionId, startedAt: state.startedAt, turns: state.turns, summarizedThrough: through });

  async function send(instr) {
    const fresh = !connector.sessionful || !state.sessionId;
    let r = await connector.send({ system: AGENT_SYSTEM, prompt: fresh ? fullPrompt(instr) : shortPrompt(instr), format: 'json' }, connector.sessionful && state.sessionId ? { sessionId: state.sessionId } : {});
    calls++;
    recordUsage(usage, kind, r, 'agent');
    if (connector.sessionful && r?.sessionLost) {
      // redesign R5a (N11 · O9): 最近几条消息 (not the old word), and the connection's own text to the log / diagnostics only
      write('note', SESSION_LOST, { session: 'lost' });
      rawError(`session of ${kind} lost`, { code: r.code ?? null, message: clip(r.detail, 300) });
      log(`agent: session ${state.sessionId} of ${kind} lost (${r.code}): a new one`);
      notice.push({ code: 'session-rebuilt' });
      state.sessionId = null;
      writeSession(agentDir, kind, { sessionId: null, startedAt: null, turns: 0, summarizedThrough: through });
      r = await connector.send({ system: AGENT_SYSTEM, prompt: fullPrompt(instr), format: 'json' }, {});
      calls++;
      recordUsage(usage, kind, r, 'agent');
    }
    if (connector.sessionful && !state.sessionId && typeof r?.sessionId === 'string' && r.sessionId !== '' && (r.ok || r.code === 'bad-format')) {
      state.sessionId = r.sessionId;
      state.startedAt = now().toISOString();
      state.turns = 0;
      state.opened = true;
      saveSession();
    }
    return r;
  }

  const connectionFailed = (r) => !r?.ok && r?.code !== 'bad-format';
  const finish = (out) => {
    if (connector.sessionful && state.sessionId) { state.turns += 1; saveSession(); }
    return { turn, calls, lookupRounds, ...out, ...(notice.length ? { notice } : {}) };
  };

  let lookupRounds = 0;
  let answer = null;
  for (;;) {
    const lookupsAllowed = lookupRounds < MAX_LOOKUP_ROUNDS;
    const instr = lookupsAllowed ? ANSWER_NOW : LAST_CALL;
    let r = await send(instr);
    if (connectionFailed(r)) return connectionEnd(r);
    let chk = checkAnswer(r, { lookupsAllowed });
    if (!chk.ok) {
      write('note', `模型的回答不能用，重试一次：${chk.errors.join('；')}`, { errors: chk.errors, text: clip(r.text, 2000) });
      pieces.push(`你上一个回答不能用：${chk.errors.join('; ')}.\n你上一个回答是：${clip(r.text, 2000)}\nAnswer again: the one JSON object of the shape in your instructions, nothing else.`);
      r = await send(instr);
      if (connectionFailed(r)) return connectionEnd(r);
      chk = checkAnswer(r, { lookupsAllowed });
      if (!chk.ok) {
        const reply = chk.replyText ?? NOT_UNDERSTOOD[lang];
        write('note', `重试后仍然不能用：${chk.errors.join('；')}；没有出卡，没有执行`, { errors: chk.errors, text: clip(r.text, 2000) });
        write('agent', reply, { fallback: true });
        notice.push({ code: 'not-understood' });
        log(`agent: turn ${turn}: two unusable answers (${chk.errors.join('; ')})`);
        return finish({ reply, ask: null, proposalIds: [] });
      }
    }
    const a = chk.answer;
    if (a.lookups.length === 0) { answer = a; break; }
    lookupRounds++;
    const results = a.lookups.map((item) => runLookup(item, { registry, proposals: cards, now }));
    a.lookups.forEach((item, i) => write('lookup', lookupRowText(item, results[i]), { request: item, result: results[i], round: lookupRounds }));
    pieces.push(`你要查的（第 ${lookupRounds} 次，最多 ${MAX_LOOKUP_ROUNDS} 次）：${JSON.stringify(a.lookups)}\n查到的结果：${JSON.stringify(results)}`);
    if (lookupRounds >= MAX_LOOKUP_ROUNDS) write('note', `已经查了 ${MAX_LOOKUP_ROUNDS} 次，这条消息不能再查`, { lookupRounds });
  }

  // the answer: cards through package B, the note kept, the reply recorded
  const proposalIds = [];
  const dropped = [];
  for (const [i, p] of answer.proposals.entries()) {
    if (!isObject(p) || typeof p.kind !== 'string' || !isObject(p.params) || !nonEmpty(p.why) || Object.keys(p).some((k) => !['kind', 'params', 'why'].includes(k))) {
      dropped.push({ index: i, kind: isObject(p) ? p.kind ?? null : null, category: 'format' });
      continue;
    }
    const params = { ...p.params };
    if (libraryId && LIBRARY_KINDS.includes(p.kind) && params.libraryId === undefined) params.libraryId = libraryId;
    if (typeof createProposal !== 'function') { dropped.push({ index: i, kind: p.kind, category: 'error' }); rawError(`proposal ${i} not made`, { code: 'no-proposal-service' }); continue; }
    try {
      const card = await createProposal(p.kind, params, p.why, { by: 'agent' });
      proposalIds.push(card.id);
    } catch (err) {
      dropped.push({ index: i, kind: p.kind, category: dropCategory(err) });
      rawError(`proposal ${i} (${p.kind}) not made`, { code: `${err?.code ?? 'error'}${err?.reason ? ` (${err.reason})` : ''}`, message: clip(err?.message ?? err, 300) });
    }
  }
  if (dropped.length) {
    // the interface's words (the action's name, the kind of failure) in the text; in the data the categories only — no kind name
    write('note', droppedSentence(dropped, lang), { dropped: dropped.map((d) => ({ index: d.index, category: d.category })) });
    notice.push({ code: 'proposals-dropped', count: dropped.length });
  }
  if (answer.note) appendAgentNote(agentDir, answer.note, { turn, now });
  const reply = dropped.length ? `${answer.reply}\n\n${droppedSentence(dropped, lang)}` : answer.reply;
  write('agent', reply, { ...(answer.ask ? { ask: answer.ask } : {}), ...(proposalIds.length ? { proposalIds } : {}), ...(answer.note ? { note: answer.note } : {}) });
  const out = finish({ reply, ask: answer.ask, proposalIds });
  try {
    const c = await compressIfNeeded({ agentDir, connector, now, log, kind, turn });
    if (c.compressed) out.compressed = true;
    out.calls += c.calls;
  } catch (err) {
    log(`agent: compression skipped: ${String(err?.message ?? err)}`);
  }
  return out;

  function connectionEnd(r) {
    // redesign R5a (precheck fix 2): the page's words of the code in the text, the code (the page words it) in the data, the
    // connection's own text to the log and the diagnostics
    const code = typeof r?.code === 'string' && r.code !== '' ? r.code : 'unknown';
    write('note', connectionSentence(code, lang), { error: code });
    rawError(`turn ${turn}: the connection failed`, { code, message: clip(r?.detail, 300) });
    notice.push({ code: 'connection', connection: r?.code ?? 'unknown' });
    return finish({ reply: null, ask: null, proposalIds: [] });
  }
}

/** The characters of the transcript since the newest summary (summary rows themselves not counted). */
export function charsSinceSummary(rows) {
  const through = summarizedThrough(rows);
  return rows.filter((r) => r.role !== 'summary' && r.turn > through).reduce((n, r) => n + charsOf(r.text), 0);
}

export const SUMMARY_PROMPT = [
  'Below is a conversation between the user of Streams and you, its main agent, with your earlier summary of what came before it.',
  `Write one summary of all of it, at most ${AGENT_SUMMARY_MAX} characters, in the language the user mostly writes in: what the user wants, what was decided, what proposals by the main agent were made and what became of them, what is still open. Facts only; nothing that was not said.`,
  'Answer with exactly this JSON and nothing else: {"summary": "..."}',
].join('\n');

/**
 * Over COMPRESS_THRESHOLD characters since the last summary: one summary row (≤ AGENT_SUMMARY_MAX), session cache moved on.
 * -> { compressed, calls, chars }
 */
export async function compressIfNeeded({ agentDir, connector, now = () => new Date(), log = () => {}, kind = connector?.kind ?? 'unknown', turn, threshold = COMPRESS_THRESHOLD }) {
  const rows = readTranscript(agentDir).rows;
  const size = charsSinceSummary(rows);
  if (size <= threshold) return { compressed: false, calls: 0, chars: size };
  const through = summarizedThrough(rows);
  const upTo = Number.isInteger(turn) ? turn : nextTurn(rows) - 1;
  const prev = lastSummary(rows);
  const segment = rows.filter((r) => r.role !== 'summary' && r.turn > through && r.turn <= upTo).map(renderRow).filter(Boolean).join('\n');
  const prompt = [SUMMARY_PROMPT, prev ? `## 之前的摘要（到第 ${through} 条消息）\n${prev.text}` : '', `## 第 ${through + 1}–${upTo} 条消息的对话\n${segment}`].filter(nonEmpty).join('\n\n');
  const usage = createUsageRecorder(agentPaths(agentDir).usage, { now });
  const r = await completeJson(connector, { prompt, format: 'json' });
  recordUsage(usage, kind, r, 'agent-summary');
  const calls = r?.usage?.calls ?? 1;
  const summary = r?.ok && isObject(r.json) && nonEmpty(r.json.summary) ? r.json.summary.trim() : null;
  if (!summary) {
    log(`agent: no summary this time (${r?.code ?? 'bad shape'}); tried again after the next turn`);
    return { compressed: false, calls, chars: size };
  }
  appendTranscript(agentDir, { turn: upTo, role: 'summary', text: [...summary].slice(0, AGENT_SUMMARY_MAX).join(''), data: { from: through + 1, through: upTo, chars: size } }, { now });
  // every cached session moves on and is let go: the next turn opens a new one with the summary and the recent turns
  const sessions = readSessions(agentDir);
  for (const k of new Set([...Object.keys(sessions), kind])) writeSession(agentDir, k, { sessionId: null, startedAt: null, turns: 0, summarizedThrough: upTo });
  log(`agent: turns ${through + 1}–${upTo} (${size} characters) summarized`);
  return { compressed: true, calls, chars: size };
}
