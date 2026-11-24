#!/usr/bin/env node
// Acceptance C4 / C7 on real connections (1.1 W4): each of the four simulated customers builds a library with the main
// agent — core's own build (core/src/build/, the shipped build SOP, the two web tools) — and another model answers as
// the customer, by personas.json's rules. Then score.mjs's lines, and a model that only judges reads the confirmed card
// against the customer's requirements.
//   node tests/live/build/build-live.mjs --connection claude-code|codex [--model <id>] [--persona 1,2,3,5] --out <folder>
//   [--no-streams-read]   only the model's opens count for the card's addresses (1.1.0's rule, for comparison)
// 1.1.1 P6: --connection deepseek — the model API (DeepSeek, its recommended model unless --model) with Streams' own tools
//   (core connect/api-tools.mjs: read_page with Streams' reader, search with DeepSeek's search API on the same key, the build's
//   budget as hard numbers). The key is read from the environment variable DEEPSEEK_API_KEY at call time and goes only into
//   request headers: nothing here prints, logs or records it (the records hold no key, the session folder is the run's own
//   temp folder, removed after the run).
//   node tests/live/build/build-live.mjs --judge-control --out <folder>   one judge call on a card made to miss things
// Spends quota (real connections). Writes <out>/<connection>-<n>.json after every step (a run cut short keeps what it
// had) and <out>/<connection>-summary.json. Page texts are not kept: the questions, the cards, the addresses read.
// The customer and the judge are Claude Code with no tools (core's zero-tool connector) on CUSTOMER_MODEL / JUDGE_MODEL.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { scoreRun, scoreAll, controls } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
const core = await import(pathToFileURL(join(REPO, 'core', 'src', 'index.mjs')).href);
const { createBuild, createActionRunner, cardHandlers, loadDefinition, createSessionConnector, createConnector, renderCard, createPageReader, createLinkReader, createApiToolSession, searchFor, BUILD_BUDGET } = core;
// 1.1.1 P1 (B19): the card's addresses are read by Streams itself, as the app does — here without the hidden browser window
// (no Electron): direct and a PDF's text only, so Streams reads no more than the app would
const { pdfText } = await import(pathToFileURL(join(REPO, 'desktop', 'src', 'main', 'pdf-text.mjs')).href);

export const CUSTOMER_MODEL = 'claude-sonnet-5-5';
export const JUDGE_MODEL = 'claude-opus-5-5';
export const MAIN_MODEL = { 'claude-code': 'claude-opus-5-5', codex: null, deepseek: null };
const MAX_STEPS = 9; // answers the harness gives before it stops a run that does not end (the line is 6)

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const has = (name) => process.argv.includes(`--${name}`);
const PERSONAS = JSON.parse(readFileSync(join(here, 'personas.json'), 'utf8'));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const zeroTool = (model) => createConnector({ kind: 'claude-code', model }, { env, timeoutMs: 300_000 });

function newDir(label) {
  const d = join(tmpdir(), `streams-live-${label}-${process.pid}-${randomBytes(3).toString('hex')}`);
  mkdirSync(d, { recursive: true });
  return d;
}

// ---- the customer ----
function shown(turn) {
  if (turn.kind === 'question') {
    const q = turn.question;
    const opts = q.kind === 'input' ? '（纯输入题，自己打字回答）' : `（${q.kind === 'multi' ? '多选' : '单选'}，选项：${q.options.map((o) => `「${o}」`).join(' ')}，另有「其它」可以自己填）`;
    return `${turn.say ? `${turn.say}\n` : ''}问题：${q.text}\n${opts}`;
  }
  if (turn.kind === 'card') return `${turn.say ?? ''}\n\n【建库卡】\n${renderCard(turn.card, 'zh-CN')}\n${turn.canConfirm ? '（卡下面有「确认」按钮）' : '（这张卡下面没有「确认」按钮）'}`;
  return turn.say ?? '';
}

function customerPrompt(p, history, turn, answered) {
  const fixed = Object.entries(p.fixed).map(([k, v]) => `- ${k}：${v}`).join('\n');
  return [
    '你在扮演一位客户，正在和一个资料库应用的助手对话，让它帮你建一座库。照下面的人设和规矩回答，像真人一样。',
    '## 规矩', ...PERSONAS.rules.map((r) => `- ${r}`),
    `## 你是谁\n${p.title}`,
    `## 你的开场白（已经说过了）\n${p.opener}`,
    `## 藏着的情况（不主动说，被问到才说）\n${p.hidden.map((h) => `- ${h}`).join('\n')}`,
    `## 固定回答（问到哪一样，照那一栏说）\n${fixed}`,
    `## 看到建库卡后的反应\n${p.reaction}`,
    `## 到现在为止你已经回答了 ${answered} 个问题`,
    `## 之前的对话\n${history.map((h) => `${h.who}：${h.text}`).join('\n') || '（没有）'}`,
    `## 助手刚刚发给你的\n${shown(turn)}`,
    '## 你怎么回',
    '只回一个 JSON 对象，前后不要别的字：',
    '- 选择题：{"picked": ["点的选项，原字照抄"], "other": "选项都不合适时填的字，没有就空字符串"}',
    '- 纯输入题或别的话：{"answer": "你要说的话"}',
    '- 建库卡：{"answer": "你对卡说的话", "confirm": true 或 false, "change": true 或 false}  confirm 是你要不要建库，change 是你有没有要改的地方',
  ].join('\n\n');
}

async function askCustomer(conn, p, history, turn, answered) {
  for (let i = 0; i < 2; i++) {
    const r = await conn.complete({ prompt: customerPrompt(p, history, turn, answered), format: 'json' });
    if (r.ok && r.json && typeof r.json === 'object') return r.json;
  }
  throw new Error('the customer model gave no readable answer twice');
}

// ---- the judge ----
function judgePrompt(p, card) {
  return [
    '你是只打分的核对员，不做任务、不给建议。下面是一位客户没说出口（或说过）的要求，和最后确认的建库卡。',
    '逐条判：建库卡（含库的定义）是不是按客户的意思写对了这一条。写对了算 caught:true（问出来的、默认猜对的都算）；没写、写错、写反都算 false。只看卡，不信卡里的自我声明。',
    `## 客户的要求\n${p.requirements.map((r) => `[${r.id}] ${r.text}`).join('\n')}`,
    `## 建库卡（JSON）\n${JSON.stringify(card, null, 1)}`,
    '只回 JSON：{"items":[{"id":"…","caught":true,"evidence":"卡上哪一句，或为什么没有"}]}',
  ].join('\n\n');
}

async function judge(conn, p, card) {
  for (let i = 0; i < 2; i++) {
    const r = await conn.complete({ prompt: judgePrompt(p, card), format: 'json' });
    if (r.ok && Array.isArray(r.json?.items)) {
      return p.requirements.map((q) => {
        const v = r.json.items.find((x) => x?.id === q.id);
        return { id: q.id, text: q.text, caught: v?.caught === true, evidence: typeof v?.evidence === 'string' ? v.evidence : 'no verdict' };
      });
    }
  }
  throw new Error('the judge gave no readable verdicts twice');
}

// ---- one build ----
async function runOne(kind, model, p, out) {
  const file = join(out, `${kind}-${p.n}.json`);
  const work = newDir(`${kind}-${p.n}`);
  const libDir = join(work, 'library');
  const definition = loadDefinition();
  const runner = createActionRunner({
    definition, handlers: cardHandlers({ libraryDirFor: () => libDir, dirOfLibrary: () => libDir, language: p.language }),
    pendingDir: join(work, 'pending'), logFile: (a, params, result) => join(result.object.id, '_actions.jsonl'),
  });
  const readers = has('no-streams-read') ? {} : { readPage: createPageReader({ pdfText }).read, readLinks: createLinkReader().read };
  let session;
  let buildKind = kind;
  let search = true;
  if (kind === 'deepseek') {
    const conn = { kind: 'api', ...(model ? { model } : {}), api: { vendor: 'deepseek', keyRef: 'env' } };
    const getKey = async () => process.env.DEEPSEEK_API_KEY;
    const found = await searchFor(conn, { getKey });
    search = Boolean(found);
    session = createApiToolSession(conn, { getKey, timeoutMs: 300_000 }, {
      sessionDir: join(work, 'sessions'), readPage: createPageReader({ pdfText }).read, search: found?.search ?? null,
      budget: { reads: BUILD_BUDGET.reads + BUILD_BUDGET.changeReads, searches: BUILD_BUDGET.searches + BUILD_BUDGET.changeSearches },
    });
    buildKind = 'api';
  } else {
    const conn = { kind, ...(model ? { model } : {}) };
    session = createSessionConnector(conn, { env }, { cwd: join(work, 'cwd'), web: true });
  }
  const build = createBuild({ connector: session, definition, runner, kind: buildKind, language: p.language, search, ...readers });
  const customer = zeroTool(CUSTOMER_MODEL);
  const record = { connection: kind, model: model ?? 'default', persona: p.n, title: p.title, startedAt: new Date().toISOString(), steps: [], answers: 0, dropped: 0, questions: [], built: false, card: null };
  const history = [{ who: '客户', text: p.opener }];
  const save = () => {
    const st = build.state();
    Object.assign(record, { reads: st.reads, searches: st.searches, checked: st.checked ?? {}, calls: st.calls, status: st.status });
    writeFileSync(file, JSON.stringify(record, null, 1));
  };
  const t0 = Date.now();
  let turn = await build.start(p.opener);
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      record.steps.push({ at: new Date().toISOString(), agent: turn });
      if (turn.notice === 'question-not-shown') record.dropped += 1;
      if (turn.kind === 'question') record.questions.push(turn.question);
      save();
      if (turn.kind === 'stopped' || turn.kind === 'failed') { record.end = turn; break; }
      history.push({ who: '助手', text: shown(turn) });
      const c = await askCustomer(customer, p, history, turn, record.questions.length);
      record.steps[record.steps.length - 1].customer = c;
      if (turn.kind === 'card' && c.confirm === true && c.change !== true && turn.canConfirm) {
        const done = await build.confirm();
        record.built = done.status === 'done';
        record.card = turn.card;
        record.end = { kind: 'confirmed', status: done.status };
        break;
      }
      const answer = turn.kind === 'question' && turn.question.kind !== 'input' ? { picked: c.picked ?? [], other: c.other ?? '' } : String(c.answer ?? c.other ?? '');
      record.answers += 1;
      history.push({ who: '客户', text: typeof answer === 'string' ? answer : JSON.stringify(answer) });
      turn = await build.reply(answer);
      // 改动和确认在同一句话里：the agent gives the changed card; the customer clicks 确认 on it
      if (turn.kind === 'card' && c.confirm === true && turn.canConfirm) {
        record.steps.push({ at: new Date().toISOString(), agent: turn, customer: { clicked: '确认' } });
        const done = await build.confirm();
        record.built = done.status === 'done';
        record.card = turn.card;
        record.end = { kind: 'confirmed-after-change', status: done.status };
        break;
      }
    }
  } catch (e) {
    record.end = { kind: 'error', message: String(e?.message ?? e) };
  }
  record.seconds = Math.round((Date.now() - t0) / 1000);
  if (!record.card) record.card = build.state().card;
  save();
  if (record.card && record.built) {
    try { record.verdicts = await judge(zeroTool(JUDGE_MODEL), p, record.card); } catch (e) { record.verdicts = []; record.judgeError = String(e?.message ?? e); }
  }
  record.score = scoreRun(record);
  save();
  try { rmSync(work, { recursive: true, force: true }); } catch { /* left in the temp folder */ }
  return record;
}

async function judgeControl(out) {
  const p = PERSONAS.personas.find((x) => x.n === 2);
  // a card that misses on purpose: no place, no size, no deadline worry, loans allowed, English brief
  const card = {
    name: '加拿大补助', definition: { summary: '一座看加拿大各类政府资助的库。', purpose: '了解政府资助', scope: '对象：企业；行业：不限；地域：加拿大；规模：不限', exclude: '无', trust: '官方', rhythm: '每天', language: '英文简报', hard: '无' },
    decide: [], collect: ['各类补助和贷款'], skip: ['过期项目'], sources: [{ name: 'Canada', url: 'https://www.canada.ca/', status: 'ok' }], unreadable: [],
    pick: ['新出现的'], write: ['写名字'], samples: [{ title: 'x', url: 'https://www.canada.ca/', date: '2026-11-20' }],
  };
  const v = await judge(zeroTool(JUDGE_MODEL), p, card);
  const caught = v.filter((x) => x.caught).length;
  const result = { card, verdicts: v, caught, of: v.length, ok: caught <= 1 };
  writeFileSync(join(out, 'judge-control.json'), JSON.stringify(result, null, 1));
  console.log(`judge control: ${caught} of ${v.length} caught on a card made to miss them -> ${result.ok ? 'the judge says no, as it should' : 'THE JUDGE PASSED A BAD CARD'}`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(arg('out', join(here, 'out')));
  mkdirSync(out, { recursive: true });
  const c = controls();
  if (!c.ok) { console.error('the scoring controls did not fail where they should: not running'); process.exit(2); }
  if (has('judge-control')) { const r = await judgeControl(out); process.exit(r.ok ? 0 : 1); }
  const kind = arg('connection');
  if (!['claude-code', 'codex', 'deepseek'].includes(kind)) { console.error('--connection claude-code | codex | deepseek'); process.exit(2); }
  if (kind === 'deepseek' && !process.env.DEEPSEEK_API_KEY) { console.error('the environment variable DEEPSEEK_API_KEY is not set'); process.exit(2); }
  const model = arg('model', MAIN_MODEL[kind]);
  const wanted = String(arg('persona', '1,2,3,5')).split(',').map(Number);
  const personas = PERSONAS.personas.filter((x) => wanted.includes(x.n));
  const runs = await Promise.all(personas.map((p) => runOne(kind, model, p, out).catch((e) => ({ persona: p.n, end: { kind: 'error', message: String(e?.message ?? e) }, verdicts: [] }))));
  const all = scoreAll(runs);
  const summary = {
    connection: kind, model: model ?? 'default', at: new Date().toISOString(), ok: all.ok, requirements: all.requirements,
    runs: runs.map((r, i) => ({ persona: r.persona, built: r.built, answers: r.answers, questions: r.questions?.length, dropped: r.dropped, seconds: r.seconds, searches: r.searches?.length, reads: r.reads?.length, caught: (r.verdicts ?? []).filter((v) => v.caught).length, of: (r.verdicts ?? []).length, end: r.end, lines: all.runs[i]?.lines })),
  };
  writeFileSync(join(out, `${kind}-summary.json`), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ connection: kind, ok: all.ok, requirements: all.requirements, runs: summary.runs.map((r) => ({ persona: r.persona, built: r.built, answers: r.answers, caught: `${r.caught}/${r.of}`, end: r.end?.kind, lines: Object.fromEntries(Object.entries(r.lines ?? {}).map(([k, v]) => [k, v.ok])) })) }, null, 1));
  process.exit(all.ok ? 0 : 1);
}
