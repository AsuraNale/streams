// What the code fills into the update SOP (sop/update.md): the tools, the budget, the library's state, the new originals,
// the actions and the format the answer comes back in. The format is the code's side of the contract (run.mjs reads
// exactly this); how to pick is the SOP's and the card's.
import { actionsFor } from '../actions/definition.mjs';

// one update: how many of the card's sources the code reads, how many new links it fetches, and the agent's own use of
// the web (the 11-19 update test's numbers: 8 searches, 20 reads)
export const UPDATE_BUDGET = Object.freeze({ sources: 30, newLinks: 20, searches: 8, reads: 20 });
export const NEW_TEXT_CHARS = 4000;

export const UPDATE_TOOLS = '- 只有搜索（WebSearch）和读网页（WebFetch）两个工具。不读写本地文件，不跑命令，不用别的工具。';

export function updateBudgetText(b = UPDATE_BUDGET) {
  return `这一次最多约 ${b.searches} 次搜索、${b.reads} 次读网页。`;
}

export function updateActionsText(definition) {
  const lines = actionsFor(definition, 'update_agent').filter((a) => !a.tool).map((a) => `- ${a.name}：${a.about}`);
  return [...lines, '你交回的 items 就是 submit_items 这个动作：流息逐条查重、核出处、存原文、核验摘要，过了的放进待看。别的都不用做。'].join('\n');
}

export function stateText({ lastAgentAt, today, known, unfinished, sources, sweep }) {
  const out = [];
  out.push(lastAgentAt ? `上次更新：${lastAgentAt.slice(0, 10)}。只找这之后的新东西。` : '这是这座库的第一次更新：找近期的新东西，日期核得到的才收。');
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
            "due": "到期日（截止日期之类），没有写空字符串",
            "what": "一句话：这是什么",
            "points": [{"text": "要点", "quote": "原文里对应的那一句，一字不改"}, {"text": "…", "quote": "…"}, {"text": "…", "quote": "…"}],
            "why": "为什么收：对着建库卡说"}],
 "sources": [{"url": "来源", "status": "读得到并且有新东西 / 读得到但没有新东西 / 读不到：原因"}],
 "gaps": ["卡上哪里不够用、哪里要猜"]}
每条恰好三个要点。没有合格的就交 "items": []，不凑数。
你交的条目里有摘要没通过核验的，流息会把那几条和原因发回给你，请改了重交那几条，格式同上。`;
