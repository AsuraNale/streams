// What the code fills into the build SOP (sop/build.md): the tools of the connection, the budget, the actions of the
// definition and the format the answer comes back in. These are the code's side of the contract with the agent (the
// checks in questions.mjs / card.mjs read exactly this format); how to build a library is the SOP's.
import { actionsFor } from '../actions/definition.mjs';

// the maintainer 11-19 (the sixth round's numbers): the whole build, and a change of the card that needs looking up again
export const BUILD_BUDGET = Object.freeze({ searches: 20, reads: 35, changeSearches: 5, changeReads: 10 });

const TOOLS = {
  'claude-code': '- 只有搜索（WebSearch）和读网页（WebFetch）两个工具。不读写本地文件，不跑命令，不用别的工具。',
  // 1.1.1 P3: Codex's one web tool as it is (codex --search exec, 0.167): web_search searches, opens a page, finds words in
  // an open page
  codex: '- 只有网页搜索（web_search）一个工具：可以搜索、打开网页、在打开的网页里找字。不跑命令，不读写本地文件，不用别的工具。',
};

// 1.1.1 P4: an API connection's tools are Streams' own (connect/api-tools.mjs): reading a page always, searching only with a
// search service — without one, nothing here speaks of searching
export const API_TOOLS = Object.freeze({
  search: '- 只有两个工具，都由流息执行：读网页（read_page，流息自己的读取器读）和搜索（search）。不读写本地文件，不跑命令，不用别的工具；要别的工具，流息不会执行。',
  noSearch: '- 只有一个工具，由流息执行：读网页（read_page，流息自己的读取器读）。不读写本地文件，不跑命令，不用别的工具；要别的工具，流息不会执行。',
});

export function toolsText(kind, { search = true } = {}) {
  if (kind === 'api') return search ? API_TOOLS.search : API_TOOLS.noSearch;
  return TOOLS[kind] ?? TOOLS['claude-code'];
}

// hard: an API connection — Streams counts and stops at the number (not 「约」); search: false — no searching at all
export function budgetText(b = BUILD_BUDGET, { search = true, hard = false } = {}) {
  const about = hard ? '' : '约 ';
  const stop = hard ? '（流息数着，到了就不再执行）' : '';
  if (!search) return `建库全程最多 ${about}${b.reads} 次读网页；用户的改动需要再查的话，改卡另有 ${b.changeReads} 次读网页${stop}。`;
  return `建库全程最多${about}${b.searches} 次搜索、${b.reads} 次读网页；用户的改动需要再查的话，改卡另有 ${b.changeSearches} 次搜索、${b.changeReads} 次读网页${stop}。`;
}

// the actions the main agent may hand in (its tools are the two above, not listed here), from the definition file
export function actionsText(definition) {
  const lines = actionsFor(definition, 'main_agent').filter((a) => !a.tool).map((a) => {
    const name = definition.actions[a.name]?.names?.zh ?? a.name;
    return `- ${name}（${a.name}）：${a.about}${a.confirm ? '要用户确认。' : ''}`;
  });
  return [
    ...lines,
    '这一次建库里，你交出的建库卡就是「建库」这个动作：流息检查卡齐不齐、卡上的网址你有没有读过，齐了就把卡给用户，用户点「确认」才建库。别的动作这一次用不到。',
  ].join('\n');
}

export const OUTPUT_TEXT = `每一轮只交一个 JSON 对象，前后不要有别的字。三种里选一种：
1. 提一个问题：{"say": "问题前想说的一两句，可以是空字符串", "question": {"text": "问题", "kind": "input", "options": []}}
   kind 写 input（纯输入题，options 留空）、single（单选）或 multi（多选）；选择题的 options 写 2 到 4 个，不要写「其它」，界面会自己加上。
2. 交建库卡：{"say": "给用户的话：请他看卡，没问题就点「确认」", "card": {建库卡}}
3. 只说话（例如回答用户的疑问）：{"say": "……"}

用户的回答以「用户：」开头转给你；选择题会写明他点了哪几个、「其它」里填了什么。用户点卡上的「确认」才算确认，那一下你看不到。他在话里说了改动也说了确认、改动又不用再查的：改完直接交新卡，在 say 里写明改了哪几行（改前和改后）。
你交的问题或建库卡不合要求时，流息会告诉你哪里不合，请你重交这一轮。

建库卡的格式（键名照写，内容用用户的语言）：
{"name": "库的名字，短",
 "definition": {"summary": "一段话说清这是一座什么样的库", "purpose": "用途", "scope": "边界：对象、行业、地域、规模", "exclude": "不要什么", "trust": "多可信才算数", "rhythm": "节奏", "language": "语言", "hard": "硬条件"},
 "decide": [{"what": "要你定的事", "default": "你的默认"}],
 "collect": ["收什么，一条一句"],
 "skip": ["不收什么，一条一句"],
 "sources": [{"name": "来源", "url": "你这一次打开过的网址", "status": "当天看到的状态", "note": "看它的什么"}],
 "unreadable": [{"name": "来源", "url": "你试过的网址", "reason": "为什么读不到"}],
 "pick": ["每次怎么挑，一条一句"],
 "write": ["每条怎么写：要点写什么"],
 "samples": [{"title": "样例的标题", "url": "网址", "date": "日期", "why": "为什么收它"}]}
定义里由你替用户定的那一行，末尾写「（我替你定的）」；还不知道、也没法替他定的写「我还不知道」。没有读不到的来源就写 "unreadable": []。卡上出现的每个网址（包括写在句子里的）都必须是你这一次打开过的。`;
