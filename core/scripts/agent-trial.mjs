#!/usr/bin/env node
// The main agent's real-call trial (v2 package C, contract C5; docs/design/v2/agent-trial-2026-11-05.md): does a real model,
// given AGENT_SYSTEM, answer in the JSON the turn can use?
//   node core/scripts/agent-trial.mjs [--claude-only | --codex-only] [--dry] [--lost] [--out <file.json>]
//     --dry   the same run on the scripted stand-in (no model call): checks the trial itself
//     --lost  instead of the turns: one resume of a session id that does not exist per connection (what a lost session
//             looks like; both CLIs refused it locally in about a second on 2026-11-05)
// Claude Code (the `claude` on PATH): 5 fixed turns of one conversation — a request for a new library, the follow-up, a
// change of a source, the state of a library, small talk. Codex (the desktop app's own codex.exe, found the way
// core/src/connect/codex.mjs finds it): 2 turns. Each call is recorded (JSON or not, a retry, how long), each turn too (what
// the answer asked for: cards made or dropped, lookups, a question).
// Everything goes into a new temporary folder (fs.mkdirSync): the app data (agent/, proposals.jsonl), the two libraries, and,
// beside the app data (not inside it, as in the app since 11-09), the agent's working folder cwd-<kind>. (The 11-05 run had it
// at <appData>/agent/cwd.) It never reads or writes %APPDATA%\Streams (checked before anything runs). The proposal cards are
// the real package B's (draftProposal), with the network off for their source trials (no fetch leaves the machine; a trial
// then says `failed`). At most CALL_BUDGET model calls in all (a call past it fails without running).
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createLibrary, addTopic, addSource, appendFetchLog, saveBrief,
  createSessionConnector, agentTurn, readTranscript, readSessions, draftProposal, appendProposal, readProposals, checkAnswer, scriptedAgentConnector, recordSuggestions, suggestFor,
} from '../src/index.mjs';
import { appendRoundRecord } from '../src/pipeline/rounds-log.mjs';

export const CALL_BUDGET = 15;
const args = process.argv.slice(2);
const only = args.includes('--claude-only') ? 'claude-code' : args.includes('--codex-only') ? 'codex' : null;
const outAt = args.indexOf('--out');

const root = join(tmpdir(), `streams-agent-trial-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`);
const realAppData = process.env.APPDATA ? resolve(process.env.APPDATA, 'Streams') : null;
const inside = (child, parent) => { const r = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase()); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
if (realAppData && inside(root, realAppData)) throw new Error(`refusing: ${root} is inside the real app data ${realAppData}`);
mkdirSync(root, { recursive: true });
const appData = join(root, 'appData');
const agentDir = join(appData, 'agent');
const libRoot = join(root, 'libraries');
mkdirSync(agentDir, { recursive: true });
mkdirSync(libRoot, { recursive: true });
if (realAppData && (inside(appData, realAppData) || inside(agentDir, realAppData))) throw new Error('refusing: the trial app data is inside the real one');

// two libraries: 「AI 工具」 (one source failing three rounds in a row), 「读书」
const ai = join(libRoot, 'AI 工具');
createLibrary(ai, { name: 'AI 工具' });
saveBrief(ai, '追踪 AI 编程工具与 agent 框架的发布与评测；只要一手资料。');
addTopic(ai, { name: 'agent 框架', keywords: ['agent framework', 'MCP', 'tool use'] });
addSource(ai, { name: 'feed-a', kind: 'rss', url: 'https://example.com/feed.xml', topic: 'agent 框架' });
addSource(ai, { name: 'hn-agents', kind: 'hn', query: 'AI agent' });
for (const [i, d] of ['2026-11-02', '2026-11-03', '2026-11-04'].entries()) {
  appendFetchLog(ai, { ts: `${d}T08:30:05.000Z`, round: `r${i + 1}`, source: 'feed-a', kind: 'rss', status: 'failed', http: 503, count: 0, new: 0, message: 'HTTP 503' });
  appendFetchLog(ai, { ts: `${d}T08:30:06.000Z`, round: `r${i + 1}`, source: 'hn-agents', kind: 'hn', status: 'ok', count: 10, new: 2, message: '' });
  appendRoundRecord(ai, { id: `r${i + 1}`, startedAt: `${d}T08:30:00.000Z`, finishedAt: `${d}T08:31:00.000Z`, counts: { fetched: 10, inbox: i === 2 ? 1 : 0 }, calls: 4 });
}
// the rule-based suggestion cards of package D, as a round would leave them (feed-a: three failed rounds)
recordSuggestions(ai, suggestFor(ai, { now: () => new Date('2026-11-04T09:00:00.000Z') }), { now: () => new Date('2026-11-04T09:00:00.000Z') });
const books = join(libRoot, '读书');
createLibrary(books, { name: '读书' });
saveBrief(books, '新出的科普书与书评。');
addTopic(books, { name: '科普', keywords: ['popular science'] });
addSource(books, { name: 'arxiv-none', kind: 'arxiv', query: 'popular science books' });
const registry = { libraries: [
  { id: 'aitools1', path: ai, name: 'AI 工具', addedAt: '2026-11-01T10:00:00.000Z' },
  { id: 'books001', path: books, name: '读书', addedAt: '2026-11-03T10:00:00.000Z' },
] };

// package B's cards, recorded in the trial's own proposals.jsonl; the source trials see no network
const proposalsFile = join(appData, 'proposals.jsonl');
const noNetwork = async () => { throw Object.assign(new Error('the trial keeps the network off'), { code: 'ENOTFOUND' }); };
async function createProposal(kind, params, why, { by }) {
  const entry = registry.libraries.find((l) => l.id === params?.libraryId);
  const card = await draftProposal({ kind, params, why, by }, {
    libraryDir: entry ? entry.path : null, libraryRoot: libRoot, fallbackSchedule: { enabled: true, time: '08:30' }, language: 'zh-CN',
    ctx: { fetchImpl: noNetwork, timeoutMs: 2000 },
  });
  appendProposal(proposalsFile, card);
  return card;
}

let used = 0;
const callLog = [];
// every model call counted and recorded; one past the budget does not run
function budgeted(conn, label) {
  const wrapRes = async (mode, fn, req) => {
    if (used >= CALL_BUDGET) return { ok: false, code: 'unknown', detail: 'trial budget used up', usage: { calls: 0 } };
    used++;
    const t0 = Date.now();
    const r = await fn();
    const ms = Date.now() - t0;
    const chk = mode === 'send' ? checkAnswer(r, { lookupsAllowed: true }) : null;
    callLog.push({ connection: label, mode, ms, ok: r.ok, code: r.ok ? null : r.code, json: r.ok, usable: chk ? chk.ok : null, errors: chk && !chk.ok ? chk.errors : [], sessionId: r.sessionId ?? null, resumed: r.resumed ?? false, sessionLost: r.sessionLost ?? false, text: String(r.text ?? r.detail ?? '').slice(0, 1200), prompt: String(req?.prompt ?? '').slice(0, 400) });
    return r;
  };
  return { ...conn, send: (req, o) => wrapRes('send', () => conn.send(req, o), req), complete: (req) => wrapRes('complete', () => conn.complete(req), req) };
}

if (args.includes('--lost')) {
  const lost = [];
  for (const kind of ['claude-code', 'codex']) {
    if (only && only !== kind) continue;
    const conn = budgeted(createSessionConnector({ kind }, { tmpRoot: join(root, 'side') }, { cwd: join(root, `cwd-lost-${kind}`) }), kind);
    const t0 = Date.now();
    const r = await conn.send({ prompt: 'Reply with exactly {"reply":"ok"}', format: 'json' }, { sessionId: randomUUID() });
    lost.push({ kind, ms: Date.now() - t0, ok: r.ok, code: r.code, sessionLost: r.sessionLost ?? false, detail: r.detail });
    console.log(`${kind}: ${JSON.stringify(lost.at(-1))}`);
  }
  const out = outAt >= 0 ? args[outAt + 1] : join(root, 'trial-lost.json');
  writeFileSync(out, JSON.stringify({ root, lost, used, calls: callLog }, null, 2) + '\n', 'utf8');
  console.log(`model calls used: ${used} of ${CALL_BUDGET}; results: ${out}`);
  process.exit(0);
}

const TURNS = {
  'claude-code': [
    { label: '建库请求', text: '我想追踪 AI agent 的记忆机制（长期记忆、检索、遗忘）方面的新论文和博客，帮我建一个库。' },
    { label: '追问', text: '库名就叫「Agent 记忆」，来源用 arXiv 搜 agent memory，再加 Hacker News 搜 agent memory。' },
    { label: '改来源', text: '「AI 工具」库里的 feed-a 老是抓不到，先帮我暂停它。' },
    { label: '查某库状态', text: '「AI 工具」这个库最近几轮怎么样？hn-agents 这个来源抓得正常吗？' },
    { label: '闲聊', text: '谢谢，今天先这样。' },
  ],
  codex: [
    { label: '加来源', text: '帮我在「AI 工具」库加一个来源：Simon Willison 的博客，RSS 是 https://simonwillison.net/atom/everything/ ，归到「agent 框架」主题。' },
    { label: '接着问', text: '我刚才让你加的是谁的博客？那张卡现在是什么状态？' },
  ],
};

const results = { root, startedAt: new Date().toISOString(), budget: CALL_BUDGET, connections: {} };
for (const kind of ['claude-code', 'codex']) {
  if (only && only !== kind) continue;
  // each connection its own conversation (its own agent folder), so the Codex turns do not read Claude Code's
  const thisAgentDir = kind === 'codex' ? join(appData, 'agent-codex') : agentDir;
  mkdirSync(thisAgentDir, { recursive: true });
  // --dry: the same run on the scripted stand-in (no model call), to check the trial itself
  const real = () => createSessionConnector({ kind }, { tmpRoot: join(root, 'side'), log: (l) => console.log(`  [${kind}] ${l}`) }, { cwd: join(root, `cwd-${kind}`) });
  const conn = budgeted(args.includes('--dry') ? scriptedAgentConnector({ kind }) : real(), kind);
  const turns = [];
  for (const t of TURNS[kind]) {
    const before = callLog.length;
    const t0 = Date.now();
    let r;
    try {
      r = await agentTurn({ text: t.text }, { agentDir: thisAgentDir, connector: conn, registry, proposals: () => readProposals(proposalsFile).cards, createProposal, log: (l) => console.log(`  [${kind}] ${l}`) });
    } catch (err) {
      r = { error: String(err?.stack ?? err) };
    }
    const ms = Date.now() - t0;
    const mine = callLog.slice(before);
    const row = {
      label: t.label, text: t.text, ms, calls: mine.length,
      firstJson: mine[0]?.json ?? null, firstUsable: mine[0]?.usable ?? null,
      retried: mine.some((c, i) => i > 0 && c.usable === false) || (r.notice ?? []).some((n) => n.code === 'not-understood') || mine.filter((c) => c.mode === 'send' && c.usable === false).length > 0,
      lookups: r.lookupRounds ?? 0, proposalIds: r.proposalIds ?? [], notice: r.notice ?? [], ask: r.ask ?? null, reply: r.reply ?? null, error: r.error ?? null,
      resumed: mine.map((c) => c.resumed),
    };
    turns.push(row);
    console.log(`${kind} · ${t.label}: ${ms} ms, ${mine.length} calls, first usable ${row.firstUsable}, lookups ${row.lookups}, cards ${row.proposalIds.length}, notice ${JSON.stringify(row.notice)}`);
    console.log(`  reply: ${String(row.reply).slice(0, 300)}`);
  }
  results.connections[kind] = { turns, transcript: readTranscript(thisAgentDir).rows, sessions: readSessions(thisAgentDir), cwdEmpty: !existsSync(join(root, `cwd-${kind}`)) || readdirSync(join(root, `cwd-${kind}`)).length === 0 };
}
results.calls = callLog;
results.used = used;
results.cards = readProposals(proposalsFile).cards.map((c) => ({ id: c.id, kind: c.kind, libraryId: c.libraryId, status: c.status, why: c.why, params: c.params, trial: c.trial ?? null }));
results.finishedAt = new Date().toISOString();
const out = outAt >= 0 ? args[outAt + 1] : join(root, 'trial-results.json');
writeFileSync(out, JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log(`model calls used: ${used} of ${CALL_BUDGET}; results: ${out}`);
