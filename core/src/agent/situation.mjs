// The situation the main agent is given at every turn (v2 package C, contract C1; docs/core-api.md 5.15.2): a text of at
// most SITUATION_MAX characters, read from the libraries as they are now. Read only: nothing is written anywhere.
//
// situation(registry, { now, proposals, notes, agentUsageFile, maxChars }) -> { text, truncated, libraries, chars }
//   registry       { libraries: [{ id, path, name, addedAt? }] } (core readRegistry's, or the desktop's entries())
//   proposals      the proposal cards (the app's proposals.jsonl read back); the pending ones of each library are listed
//   notes          the agent's newest notes ([{ at, text }]), listed at the end
//   agentUsageFile the agent's usage.jsonl: its calls this month are in the total and on their own
// Each library: its name and id, the first BRIEF_CHARS characters of its 「要求」, each topic with its number of keywords,
// the number of sources and how many of them are in each of the five fetch states after their last fetch (and paused, not
// fetched yet), its 待看 count, its last round (when, what went into 待看), its problems (missing · sources · no-output),
// its open suggestion cards, its pending proposal cards. Then the total use of all libraries this month (+ the agent's).
// Over `maxChars`: first each library's details go (oldest registration first: the library keeps its one-line form), then
// whole libraries (oldest first; how many are left out is said); the text then ends in 「（已截短）」.
import { readConfig } from '../library/config.mjs';
import { readBrief } from '../library/brief.mjs';
import { homeNumbers, NO_OUTPUT_ROUNDS } from '../pipeline/numbers.mjs';
import { lastRoundStatus } from '../fetch/log.mjs';
import { FETCH_STATES } from '../fetch/states.mjs';
import { openSuggestions } from '../suggest/records.mjs';
import { usageTotal } from '../connect/usage.mjs';

export const SITUATION_MAX = 6000;
export const BRIEF_CHARS = 200;
export const TRUNCATED_MARK = '（已截短）';
export const LIST_MAX = 8;

const chars = (s) => [...String(s)];
const clipChars = (s, n) => { const c = chars(s ?? ''); return c.length > n ? `${c.slice(0, n).join('')}…` : c.join(''); };
const len = (s) => chars(s).length;

/** What the situation says of one library, as data (also used by the `library` lookup). */
export function libraryFacts(entry, { now = () => new Date(), proposals = [] } = {}) {
  const facts = { id: entry.id, name: entry.name, addedAt: entry.addedAt ?? null, problems: [], readable: false };
  const cfg = (() => { try { return readConfig(entry.path); } catch { return { ok: false }; } })();
  if (!cfg.ok) {
    facts.problems.push('missing');
    facts.pendingProposals = pendingOf(proposals, entry.id);
    return facts;
  }
  facts.readable = true;
  const config = cfg.config;
  try { facts.brief = readBrief(entry.path); } catch { facts.brief = null; }
  const topics = Array.isArray(config.topics) ? config.topics.filter((t) => t && typeof t.name === 'string') : [];
  facts.topics = topics.map((t) => ({ name: t.name, keywords: Array.isArray(t.keywords) ? t.keywords.length : 0 }));
  const sources = Array.isArray(config.sources) ? config.sources.filter((s) => s && typeof s.name === 'string') : [];
  let status = {};
  try { status = lastRoundStatus(entry.path); } catch { status = {}; }
  const counts = Object.fromEntries([...FETCH_STATES, 'paused', 'never'].map((k) => [k, 0]));
  for (const s of sources) {
    if (s.paused === true) counts.paused++;
    else if (status[s.name] && FETCH_STATES.includes(status[s.name].status)) counts[status[s.name].status]++;
    else counts.never++;
  }
  facts.sources = { count: sources.length, states: counts };
  let n = null;
  try { n = homeNumbers(entry.path, { now }); } catch { n = null; }
  facts.inbox = n ? n.inbox : null;
  facts.lastRound = n?.lastRound ? { at: n.lastRound.startedAt ?? null, inbox: typeof n.lastRound.counts?.inbox === 'number' ? n.lastRound.counts.inbox : 0 } : null;
  if (n && (n.sources?.level === 'warning' || n.sources?.level === 'blocked')) facts.problems.push('sources');
  if (n && n.noOutputStreak >= NO_OUTPUT_ROUNDS) facts.problems.push('no-output');
  facts.noOutputStreak = n ? n.noOutputStreak : 0;
  try { facts.suggestions = openSuggestions(entry.path).map((s) => s.key); } catch { facts.suggestions = []; }
  facts.pendingProposals = pendingOf(proposals, entry.id);
  return facts;
}

function pendingOf(proposals, libraryId) {
  return (Array.isArray(proposals) ? proposals : []).filter((c) => c && c.status === 'pending' && c.libraryId === libraryId).map((c) => ({ id: c.id, kind: c.kind }));
}

const PROBLEM_WORDS = { missing: '文件夹不在或读不出', sources: '来源出问题', 'no-output': `连续 ${NO_OUTPUT_ROUNDS} 轮以上没有产出` };
const list = (items, fmt) => {
  const shown = items.slice(0, LIST_MAX).map(fmt);
  return items.length > LIST_MAX ? `${shown.join('；')}；另有 ${items.length - LIST_MAX} 个` : shown.join('；');
};

function shortLine(f) {
  const bits = [`库「${f.name}」（id ${f.id}）`];
  if (f.readable) bits.push(`待看 ${f.inbox ?? '?'} 条`);
  if (f.problems.length) bits.push(`问题：${f.problems.map((p) => PROBLEM_WORDS[p]).join('、')}`);
  return `- ${bits.join('；')}`;
}

function detailBlock(f) {
  const out = [`## 库「${f.name}」（id ${f.id}）`];
  if (!f.readable) {
    out.push(`问题：${PROBLEM_WORDS.missing}`);
    if (f.pendingProposals.length) out.push(`待定的提议卡：${list(f.pendingProposals, (p) => `${p.id}（${p.kind}）`)}`);
    return out.join('\n');
  }
  out.push(`要求：${f.brief ? clipChars(f.brief.replace(/\s+/g, ' '), BRIEF_CHARS) : '（还没写）'}`);
  out.push(`主题：${f.topics.length ? list(f.topics, (t) => `${t.name}（${t.keywords} 个关键词）`) : '（没有）'}`);
  const st = f.sources.states;
  out.push(`来源：${f.sources.count} 个（ok ${st.ok} · empty ${st.empty} · gap ${st.gap} · failed ${st.failed} · blocked ${st.blocked} · 暂停 ${st.paused} · 还没抓过 ${st.never}）`);
  out.push(`待看：${f.inbox ?? '?'} 条`);
  out.push(`上一轮：${f.lastRound ? `${f.lastRound.at ?? '?'}，进待看 ${f.lastRound.inbox} 条` : '还没跑过'}`);
  out.push(`问题：${f.problems.length ? f.problems.map((p) => PROBLEM_WORDS[p]).join('、') : '没有'}`);
  out.push(`未处理的建议卡：${f.suggestions.length ? list(f.suggestions, (k) => k) : '没有'}`);
  out.push(`待定的提议卡：${f.pendingProposals.length ? list(f.pendingProposals, (p) => `${p.id}（${p.kind}）`) : '没有'}`);
  return out.join('\n');
}

export function situation(registry, { now = () => new Date(), proposals = [], notes = [], agentUsageFile, maxChars = SITUATION_MAX } = {}) {
  const entries = Array.isArray(registry?.libraries) ? registry.libraries.filter((l) => l && typeof l.id === 'string' && typeof l.path === 'string') : [];
  const clock = now();
  const facts = entries.map((e) => libraryFacts(e, { now: () => clock, proposals }));
  const usage = usageTotal(entries.map((e) => e.path), { month: clock.toISOString().slice(0, 7), ...(agentUsageFile ? { agentFile: agentUsageFile } : {}) });
  const createPending = (Array.isArray(proposals) ? proposals : []).filter((c) => c && c.status === 'pending' && c.kind === 'create_library');

  const head = [`# 局面（${clock.toISOString()}）`, `登记的库：${entries.length} 个${entries.length ? '' : '（还没有库）'}`];
  const tail = [];
  if (createPending.length) tail.push(`待定的建库提议卡：${list(createPending, (c) => `${c.id}（${c.params?.name ?? '?'}）`)}`);
  tail.push(`全部库本月用量合计：${usage.calls} 次调用${usage.agent ? `（其中主 Agent ${usage.agent.calls} 次）` : ''}`);
  const noteLines = (Array.isArray(notes) ? notes : []).filter((n) => n && typeof n.text === 'string');
  if (noteLines.length) tail.push(`你的笔记（最近 ${noteLines.length} 条）：\n${noteLines.map((n) => `- ${clipChars(n.text.replace(/\s+/g, ' '), 300)}`).join('\n')}`);

  // the order a library loses its details, then itself: oldest registration first (no date = oldest), registry order after
  const order = facts.map((f, i) => ({ i, t: Date.parse(f.addedAt ?? '') })).sort((a, b) => (Number.isNaN(a.t) ? -Infinity : a.t) - (Number.isNaN(b.t) ? -Infinity : b.t) || a.i - b.i).map((x) => x.i);
  const form = facts.map(() => 'detail');
  const render = (marked) => {
    const shown = facts.map((f, i) => (form[i] === 'detail' ? detailBlock(f) : form[i] === 'short' ? shortLine(f) : null)).filter((x) => x !== null);
    const dropped = form.filter((x) => x === 'gone').length;
    const parts = [...head, ...shown];
    if (dropped) parts.push(`另有 ${dropped} 个较早登记的库没有列出`);
    parts.push(...tail);
    if (marked) parts.push(TRUNCATED_MARK);
    return parts.join('\n\n');
  };
  let text = render(false);
  let truncated = false;
  if (len(text) > maxChars) {
    truncated = true;
    for (const i of order) { if (len(render(true)) <= maxChars) break; form[i] = 'short'; }
    for (const i of order) { if (len(render(true)) <= maxChars) break; form[i] = 'gone'; }
    text = render(true);
    // still over (a very small limit): cut, the mark kept at the end
    if (len(text) > maxChars) text = chars(text).slice(0, Math.max(0, maxChars - len(TRUNCATED_MARK) - 1)).join('') + '\n' + TRUNCATED_MARK;
  }
  return { text, truncated, chars: len(text), libraries: facts.map((f, i) => ({ id: f.id, shown: form[i] })) };
}
