// What the code fills into the update SOP (sop/update.md): the tools, the budget, the library's state, the new originals,
// the actions and the format the answer comes back in. The format is the code's side of the contract (run.mjs reads
// exactly this); how to pick is the SOP's and the card's.
import { actionsFor } from '../actions/definition.mjs';
import { API_TOOLS } from '../build/format.mjs';

// one update: how many of the card's sources the code reads, how many new links it fetches, and the agent's own use of
// the web (the 11-19 update test's numbers: 8 searches, 20 reads)
export const UPDATE_BUDGET = Object.freeze({ sources: 30, newLinks: 20, searches: 8, reads: 20 });
export const NEW_TEXT_CHARS = 4000;

export const UPDATE_TOOLS = '- 只有搜索（WebSearch）和读网页（WebFetch）两个工具。不读写本地文件，不跑命令，不用别的工具。';
// 1.1.1 P3: the update agent's tools as its connection has them (the same words as the build's, build/format.mjs toolsText)
const UPDATE_TOOLS_BY_KIND = { 'claude-code': UPDATE_TOOLS, codex: '- 只有网页搜索（web_search）一个工具：可以搜索、打开网页、在打开的网页里找字。不跑命令，不读写本地文件，不用别的工具。' };
export function updateToolsText(kind, { search = true } = {}) {
  // 1.1.1 P4: an API connection's two tools are Streams' own (the same words as the build's)
  if (kind === 'api') return search ? API_TOOLS.search : API_TOOLS.noSearch;
  return UPDATE_TOOLS_BY_KIND[kind] ?? UPDATE_TOOLS;
}

export function updateBudgetText(b = UPDATE_BUDGET, { search = true, hard = false } = {}) {
  const about = hard ? '' : '约 ';
  const stop = hard ? '（流息数着，到了就不再执行）' : '';
  return search ? `这一次最多${about}${b.searches} 次搜索、${b.reads} 次读网页${stop}。` : `这一次最多${about}${b.reads} 次读网页${stop}。`;
}

export function updateActionsText(definition) {
  const lines = actionsFor(definition, 'update_agent').filter((a) => !a.tool).map((a) => `- ${a.name}：${a.about}`);
  return [...lines, '你交回的 items 就是 submit_items 这个动作：流息逐条查重、核出处、存原文、核验摘要，过了的放进待看。别的都不用做。submit_items 不是可以调用的工具：按「交回的格式」把 JSON 直接写在回答里。'].join('\n');
}

/** 1.1.1 P7 (B21): an instant as this computer's local date and time, 「2026-11-23 21:00」 (the update agent was given the UTC
 * date before: an evening update was already the next day, and the agent left out what came later that same day). */
export function localStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 1.1.1 P7: the first update looks back this many days (unless the card says otherwise)
export const FIRST_LOOKBACK_DAYS = 30;

export function stateText({ lastAgentAt, today, known, unfinished, sources, sweep, queries = [] }) {
  const out = [];
  if (queries.length) out.push(`卡上的检索词（流息不替你搜，这一次用搜索查一遍）：${queries.join('、')}`);
  out.push(lastAgentAt
    ? `上次更新：${localStamp(lastAgentAt)}（本地时间）。找这之后新出现的东西：上次更新那天稍后才发布的也算，下面「新取回的原文」都是上次之后才出现在来源上的，不要按日期排除。和库里已有的说同一件事的不交，同一个网址流息会去掉。`
    : `这是这座库的第一次更新：找最近 ${FIRST_LOOKBACK_DAYS} 天的新东西（建库卡上另写了时间范围的，按卡），日期核得到的才收。`);
  if (sweep) out.push(`这一次请把建库卡上的来源自己读一遍${lastAgentAt ? `（离上次你读来源已经 ${sweep} 天，按卡上的节奏该读了）` : ''}：流息只能认出来源页上新出现的链接，单篇文章、项目页、数据页上的变化要你自己看。`);
  if (unfinished.length) out.push(`上一次额度用完没读到的来源：${unfinished.join('、')}`);
  const bad = Object.entries(sources).filter(([, v]) => v && v.ok === false).map(([u, v]) => `${u}（${v.reason ?? '读不到'}）`);
  if (bad.length) out.push(`流息这次读不到的来源：${bad.join('、')}`);
  out.push(known.length ? `库里已经有的条目（不要再交）：\n${known.map((k) => `- ${k.title ? `${k.title} — ` : ''}${k.url}`).join('\n')}` : '库里还没有条目。');
  return out.join('\n');
}

export function newText(originals, missing) {
  if (!originals.length && !missing.length) return '这一次来源上没有新链接。';
  const out = originals.map((o, i) => `### [${i + 1}] ${o.title || '（无标题）'}\n网址：${o.url}\n读法：${o.method}\n\n${o.text.length > NEW_TEXT_CHARS ? `${o.text.slice(0, NEW_TEXT_CHARS)}……（后面还有，原文已存）` : o.text}`);
  if (missing.length) out.push(`读不到原文的新链接（要收的话你自己读，读不到就别收）：\n${missing.map((m) => `- ${m.url}（${m.reason}）`).join('\n')}`);
  return out.join('\n\n');
}

export const UPDATE_OUTPUT = `只交一个 JSON 对象，前后不要有别的字：
{"items": [{"url": "出处网址：上面附的原文之一，或你这一次打开过的网址",
            "title": "标题",
            "date": "发布日期 YYYY-MM-DD，核不到写空字符串",
            "due": "到期日（截止日期之类）YYYY-MM-DD，没有写空字符串",
            "what": "一句话：这是什么",
            "points": [{"text": "要点", "quote": "原文里对应的那一句，一字不改"}, {"text": "…", "quote": "…"}, {"text": "…", "quote": "…"}],
            "why": "为什么收：对着建库卡说"}],
 "sources": [{"url": "来源", "status": "读得到并且有新东西 / 读得到但没有新东西 / 读不到：原因"}],
 "gaps": ["卡上哪里不够用、哪里要猜"]}
每条恰好三个要点。没有合格的就交 "items": []，不凑数。
你交的条目里有摘要没通过核验的，流息会把那几条和原因发回给你，请改了重交那几条，格式同上。`;
