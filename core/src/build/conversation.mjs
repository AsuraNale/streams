// Building a library is one run of the main agent (1.1 W4; contract 「总原则」, handoff 改动一): the agent asks, reads the
// web, writes the card; the code gives it the build SOP and the two web tools, keeps the state, checks what it hands
// back and waits for the user. The code never decides what to ask or what to read.
//
// createBuild({ connector, definition, runner, kind, language, today, budget, sopDir, state, now, maxTurns })
//   connector  a session connection with the web tools: createSessionConnector(connection, deps, { cwd, web: true });
//              send(req, { sessionId }) -> { ok, text, sessionId, reads, searches, otherTools, … }
//   runner     createActionRunner(...) with cardHandlers (store.mjs): a whole card is handed in as the action create_library,
//              held until the user confirms (B3)
//   state      a build's state as state() gave it (to go on after a restart); a new build when left out
// -> { start(opener), reply(answer), confirm(), state() }, each turn -> one of
//   { kind: 'question', say, question }                 a question that passed checkQuestion: the interface shows it
//   { kind: 'card', say, card, canConfirm, problems, proposal? }
//                                                       canConfirm only for a whole card whose every address was read in
//                                                       this build (all turns' reads); then proposal is its pending card
//   { kind: 'say', say, notice? }                       words only; notice 'question-not-shown' when a question failed its
//                                                       checks twice (the user never sees it)
//   { kind: 'failed', code, detail? }                   the connection failed; the state is as before, the turn can be tried again
//   { kind: 'stopped', notice }                         'over-budget' · 'too-many-turns' · 'other-tool' · 'session-lost' · 'bad-format'
// An answer that does not pass (not JSON, a question or a card that fails its checks) is sent back once with what is
// wrong; the second answer is taken as it is.
import { loadSop, renderSop, placeholdersOf } from '../sop/sop.mjs';
import { answerJson } from '../agentrun/stream.mjs';
import { StreamsError } from '../errors.mjs';
import { checkQuestion, answerText } from './questions.mjs';
import { checkCard, CARD_WORDS } from './card.mjs';
import { toolsText, budgetText, actionsText, OUTPUT_TEXT, BUILD_BUDGET } from './format.mjs';
import { proposalCards } from './proposals.mjs';

export const MAX_BUILD_TURNS = 16;

const QUESTION_WORDS = {
  'too-many-questions': '已经问满 5 个问题，不能再问了：请去查证并交建库卡',
  'first-not-input': '第 1 题问用途，要用纯输入题（kind 写 input，不给选项）',
  'too-many-inputs': '纯输入题全程最多 2 个：这一题请改成选择题',
  'too-many-options': '选择题最多 4 个选项（「其它」不算在内，界面会自己加）',
  'too-few-options': '选择题至少要有 2 个选项',
  'options-on-input': '纯输入题不给选项',
  'bad-kind': 'kind 只能写 input、single 或 multi',
  'no-text': '问题没有写字',
  'bad-option': '选项不能为空，也不能重复',
};

export function problemText(p) {
  const w = CARD_WORDS['zh-CN'];
  if (typeof p === 'string') return QUESTION_WORDS[p] ?? p;
  switch (p.code) {
    case 'missing-part': return `建库卡缺「${w[p.part] ?? p.part}」这一部分`;
    case 'missing-line': return p.line === 'summary' ? '库的定义缺开头那一段话' : `库的定义缺「${w[p.line] ?? p.line}」一行`;
    case 'not-read': return `网址 ${p.url} 你这一次没有打开过：打开它再写进卡里；打不开的写进「读不到的来源」`;
    case 'too-many-decisions': return '「要你定的事」最多 3 件';
    case 'no-name': return '建库卡缺库的名字（name）';
    case 'bad-entry': return `「${w[p.part] ?? p.part}」里第 ${(p.index ?? 0) + 1} 条缺内容或缺网址`;
    case 'not-an-object': return '建库卡不是一个 JSON 对象';
    default: return p.code;
  }
}

// the places of the build SOP the code fills: one left out of the file would leave the agent without it (the format the
// checks read, the tools, the budget …), so a SOP without one is refused rather than sent
export const BUILD_SOP_PLACES = Object.freeze(['TODAY', 'TOOLS', 'BUDGET', 'ACTIONS', 'OUTPUT']);

export function buildPrompt({ definition, kind, today, budget = BUILD_BUDGET, sopDir, opener }) {
  const text = loadSop('build', sopDir ? { dir: sopDir } : {});
  const missing = BUILD_SOP_PLACES.filter((k) => !placeholdersOf(text).includes(k));
  if (missing.length) throw new StreamsError('sop-incomplete', `the build SOP has no place for ${missing.join(', ')}`);
  const sop = renderSop(text, {
    TODAY: today, TOOLS: toolsText(kind), BUDGET: budgetText(budget), ACTIONS: actionsText(definition), OUTPUT: OUTPUT_TEXT,
  });
  return `${sop}\n\n## 用户的开场白\n用户：${opener}`;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createBuild({ connector, definition, runner, kind = 'claude-code', language = 'zh-CN', today, budget = BUILD_BUDGET, sopDir, state, now = () => new Date(), maxTurns = MAX_BUILD_TURNS } = {}) {
  if (!connector || typeof connector.send !== 'function') throw new StreamsError('bad-argument', 'a build needs a session connection with the web tools');
  if (!runner) throw new StreamsError('bad-argument', 'a build needs the action runner');
  const s = state ?? { v: 1, language, kind, opener: null, sessionId: null, status: 'new', turns: [], asked: [], reads: [], searches: [], calls: 0, card: null, pendingId: null, libraryDir: null };
  const day = today ?? now().toISOString().slice(0, 10);

  // a reply that is not JSON is still the agent's answer (interpret sends it back once); any other failure is the connection's
  const usable = (r) => r.ok || (r.code === 'bad-format' && typeof r.text === 'string' && r.text !== '');
  const over = () => s.searches.length > budget.searches + budget.changeSearches || s.reads.length > budget.reads + budget.changeReads;

  async function call(prompt) {
    const r = await connector.send({ prompt, format: 'json', model: 'main' }, { sessionId: s.sessionId ?? undefined });
    s.calls += 1;
    if (r.sessionId) s.sessionId = r.sessionId;
    const turn = s.turns.length;
    for (const x of r.reads ?? []) s.reads.push({ url: x.url, ok: x.ok !== false, turn });
    for (const q of r.searches ?? []) s.searches.push({ query: q, turn });
    return r;
  }

  function interpret(r) {
    const json = isObj(r.json) ? r.json : answerJson(r.text);
    if (!isObj(json)) return { problem: 'bad-format', problems: ['只交一个 JSON 对象，前后不要别的字'] };
    const say = typeof json.say === 'string' ? json.say : '';
    if (json.question !== undefined && json.card !== undefined) return { problem: 'two', say, problems: ['一轮只交一样：一个问题，或一张建库卡'] };
    if (json.question !== undefined) {
      const c = checkQuestion(json.question, s.asked);
      return c.ok ? { kind: 'question', say, question: c.question } : { problem: 'question', say, problems: c.problems };
    }
    if (json.card !== undefined) {
      const c = checkCard(json.card, { reads: s.reads });
      return c.ok ? { kind: 'card', say, card: json.card } : { problem: 'card', say, card: json.card, problems: c.problems };
    }
    return { kind: 'say', say };
  }

  async function turn(prompt, userText) {
    if (s.status === 'built' || s.status === 'stopped') throw new StreamsError('bad-state', `this build is ${s.status}`);
    if (s.turns.filter((t) => t.role === 'agent').length >= maxTurns) { s.status = 'stopped'; return { kind: 'stopped', notice: 'too-many-turns' }; }
    if (userText !== undefined) s.turns.push({ role: 'user', text: userText, at: now().toISOString() });
    let r = await call(prompt);
    if (!usable(r)) {
      if (userText !== undefined) s.turns.pop();
      if (r.sessionLost) { s.status = 'stopped'; return { kind: 'stopped', notice: 'session-lost' }; }
      return { kind: 'failed', code: r.code, detail: r.detail };
    }
    if ((r.otherTools ?? []).length) { s.status = 'stopped'; return { kind: 'stopped', notice: 'other-tool' }; }
    let a = interpret(r);
    if (a.problem) {
      const back = `（流息）你上一轮交的内容没有给用户看，原因：${a.problems.map(problemText).join('；')}。请按要求重交这一轮，只交一个 JSON。`;
      s.turns.push({ role: 'note', text: back, at: now().toISOString() });
      r = await call(back);
      if (!usable(r)) return { kind: 'failed', code: r.code, detail: r.detail };
      if ((r.otherTools ?? []).length) { s.status = 'stopped'; return { kind: 'stopped', notice: 'other-tool' }; }
      a = interpret(r);
    }
    if (over()) s.overBudget = true;
    let out;
    if (a.kind === 'question') {
      s.asked.push(a.question);
      out = { kind: 'question', say: a.say, question: a.question };
    } else if (a.kind === 'card') {
      out = await offerCard(a.card, a.say);
    } else if (a.problem === 'card') {
      s.card = a.card;
      out = { kind: 'card', say: a.say, card: a.card, canConfirm: false, problems: a.problems };
    } else if (a.problem === 'question' || a.problem === 'two') {
      out = { kind: 'say', say: a.say, notice: 'question-not-shown', problems: a.problems };
    } else if (a.problem === 'bad-format') {
      s.status = 'stopped';
      out = { kind: 'stopped', notice: 'bad-format' };
    } else {
      out = { kind: 'say', say: a.say };
    }
    s.turns.push({ role: 'agent', ...out, at: now().toISOString() });
    if (s.status === 'new') s.status = 'talking';
    if (s.overBudget && out.kind !== 'card' && s.status !== 'stopped') { s.status = 'stopped'; return { ...out, kind: 'stopped', notice: 'over-budget' }; }
    return out;
  }

  async function offerCard(card, say) {
    s.card = card;
    if (s.pendingId) { runner.reject(s.pendingId); s.pendingId = null; }
    const r = await runner.request('main_agent', { action: 'create_library', params: { card } });
    if (r.status !== 'pending') return { kind: 'card', say, card, canConfirm: false, problems: [{ code: 'rejected', errors: r.errors ?? [] }] };
    s.pendingId = r.pending.id;
    const [proposal] = proposalCards([r.pending], definition, { language: s.language });
    return { kind: 'card', say, card, canConfirm: true, problems: [], proposal };
  }

  return {
    async start(opener) {
      if (s.status !== 'new') throw new StreamsError('bad-state', 'this build has started already');
      if (typeof opener !== 'string' || opener.trim() === '') throw new StreamsError('bad-argument', 'what the user wants to follow is needed');
      s.opener = opener.trim();
      const prompt = buildPrompt({ definition, kind: s.kind, today: day, budget, sopDir, opener: s.opener });
      return turn(prompt, s.opener);
    },
    async reply(answer) {
      if (s.status === 'new') throw new StreamsError('bad-state', 'the build has not started');
      const last = [...s.turns].reverse().find((t) => t.role === 'agent');
      const text = answerText(last?.kind === 'question' ? last.question : null, answer, s.language);
      if (!text) throw new StreamsError('bad-argument', 'an empty answer');
      return turn(`用户：${text}`, text);
    },
    async confirm() {
      if (!s.pendingId) throw new StreamsError('bad-state', 'no card waiting for 确认');
      const out = await runner.confirm(s.pendingId);
      if (out.status === 'done') { s.status = 'built'; s.libraryDir = out.result.object.id; s.pendingId = null; }
      else if (out.status === 'rejected') s.pendingId = null; // taken back, or no longer allowed by the definition
      return out;
    },
    state: () => s,
  };
}
