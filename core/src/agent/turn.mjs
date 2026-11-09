// One turn of the conversation with the main agent (v2 package C, contract C2; docs/core-api.md 5.15.5).
//
// agentTurn({ text, libraryId?, as? }, ctx) -> { turn, reply, ask, proposalIds, notice?, calls, lookupRounds }
//   text        the user's sentence (1–TEXT_IN_MAX characters); as 'note': something the app hands over instead (a
//               suggestion card the user accepted), written as a `note` row, not a `you` row
//   libraryId   the library whose dialog the sentence came from (said in the prompt; a library card without
//               params.libraryId takes it)
//   ctx = { agentDir, connector (connect/session.mjs createSessionConnector, or agent/fake.mjs), registry (or a function
//           giving it), proposals (cards, or a function), createProposal(kind, params, why, { by }) (package B's, the
//           desktop's services/proposals.mjs), now, log, situationMax }
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
// { kind, params, why } or that createProposal refuses is not made — its reason in a `note` row, and the reply ends with
// 「有 N 张提议没出（格式不对）」 (notice 'proposals-dropped').
// `note`: kept in agent/notes.jsonl (store.mjs appendAgentNote).
// The connection failing (not logged in, network, …): a `note` row, reply null (notice 'connection').
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

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const charsOf = (s) => [...String(s ?? '')].length;
const clip = (s, n) => { const c = [...String(s ?? '')]; return c.length > n ? `${c.slice(0, n).join('')}…` : c.join(''); };

/** 'zh' when the text holds a CJK character, else 'en': the language of the code's own sentences in a reply. */
export function languageOf(text) {
  return /[㐀-鿿豈-﫿]/.test(String(text ?? '')) ? 'zh' : 'en';
}

export function droppedSentence(n, lang) {
  return lang === 'zh' ? `有 ${n} 张提议没出（格式不对）` : `${n} proposal${n === 1 ? ' was' : 's were'} not made (wrong format)`;
}

// a transcript row as the model reads it again
function renderRow(r) {
  switch (r.role) {
    case 'you': return `用户：${r.text}`;
    case 'agent': return `你（主 Agent）：${r.text}${r.data?.ask ? `\n（问了：${r.data.ask.question}｜${r.data.ask.options.join('｜')}）` : ''}${r.data?.proposalIds?.length ? `\n（出了提议卡：${r.data.proposalIds.join('、')}）` : ''}`;
    case 'lookup': return `（查了 ${r.text}）`;
    case 'note': return `（流息：${r.text}）`;
    default: return '';
  }
}

/** The context rebuilt from the transcript: the newest summary + the last RECENT_TURNS turns (at most RECENT_MAX_CHARS). */
export function historyBlock(rows, { recentTurns = RECENT_TURNS, maxChars = RECENT_MAX_CHARS } = {}) {
  const parts = [];
  const s = lastSummary(rows);
  if (s) parts.push(`## 之前对话的摘要（到第 ${s.data?.through ?? '?'} 轮）\n${s.text}`);
  const turns = [...new Set(rows.filter((r) => r.role !== 'summary').map((r) => r.turn))].slice(-recentTurns);
  const recent = rows.filter((r) => r.role !== 'summary' && turns.includes(r.turn)).map(renderRow).filter(Boolean);
  while (recent.length && charsOf(recent.join('\n')) > maxChars) recent.shift();
  if (recent.length) parts.push(`## 最近的对话\n${recent.join('\n')}`);
  return parts.join('\n\n');
}

function turnBlock(text, { as, libraryId, registry }) {
  const lib = libraryId ? (registry?.libraries ?? []).find((l) => l.id === libraryId) : null;
  const from = libraryId ? `（这句话是从库「${lib?.name ?? libraryId}」（id ${libraryId}）的对话框转来的）\n` : '';
  if (as === 'note') return `## 这一轮\n${from}流息转来一件事（不是用户打的字，是界面上的一个动作）：\n${text}`;
  return `## 这一轮\n${from}用户：${text}`;
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

  const sit = situation(registry, { now, proposals: cards, notes: readAgentNotes(agentDir, { limit: NOTES_IN_SITUATION }), agentUsageFile: paths.usage, ...(situationMax ? { maxChars: situationMax } : {}) }).text;
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
      write('note', '会话接不上，开了新会话，从对话记录（摘要 + 最近几轮）重建上下文', { session: 'lost', code: r.code ?? null, detail: clip(r.detail, 300) });
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
    if (lookupRounds >= MAX_LOOKUP_ROUNDS) write('note', `已经查了 ${MAX_LOOKUP_ROUNDS} 次，这一轮不能再查`, { lookupRounds });
  }

  // the answer: cards through package B, the note kept, the reply recorded
  const proposalIds = [];
  const dropped = [];
  for (const [i, p] of answer.proposals.entries()) {
    if (!isObject(p) || typeof p.kind !== 'string' || !isObject(p.params) || !nonEmpty(p.why) || Object.keys(p).some((k) => !['kind', 'params', 'why'].includes(k))) {
      dropped.push({ index: i, kind: isObject(p) ? p.kind ?? null : null, reason: 'shape: a proposal is { kind, params, why }' });
      continue;
    }
    const params = { ...p.params };
    if (libraryId && LIBRARY_KINDS.includes(p.kind) && params.libraryId === undefined) params.libraryId = libraryId;
    if (typeof createProposal !== 'function') { dropped.push({ index: i, kind: p.kind, reason: 'no-proposal-service' }); continue; }
    try {
      const card = await createProposal(p.kind, params, p.why, { by: 'agent' });
      proposalIds.push(card.id);
    } catch (err) {
      dropped.push({ index: i, kind: p.kind, reason: `${err?.code ?? 'error'}${err?.reason ? ` (${err.reason})` : ''}: ${clip(err?.message ?? err, 300)}` });
    }
  }
  if (dropped.length) {
    write('note', `有 ${dropped.length} 张提议没出：${dropped.map((d) => `${d.kind ?? '?'}：${d.reason}`).join('；')}`, { dropped });
    notice.push({ code: 'proposals-dropped', count: dropped.length });
  }
  if (answer.note) appendAgentNote(agentDir, answer.note, { turn, now });
  const reply = dropped.length ? `${answer.reply}\n\n${droppedSentence(dropped.length, lang)}` : answer.reply;
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
    write('note', `连接出了问题（${r?.code ?? 'unknown'}），这一轮没有回答`, { error: r?.code ?? 'unknown', detail: clip(r?.detail, 300) });
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
  `Write one summary of all of it, at most ${AGENT_SUMMARY_MAX} characters, in the language the user mostly writes in: what the user wants, what was decided, what proposal cards were made and what became of them, what is still open. Facts only; nothing that was not said.`,
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
  const prompt = [SUMMARY_PROMPT, prev ? `## 之前的摘要（到第 ${through} 轮）\n${prev.text}` : '', `## 第 ${through + 1}–${upTo} 轮的对话\n${segment}`].filter(nonEmpty).join('\n\n');
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
