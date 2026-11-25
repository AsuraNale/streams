#!/usr/bin/env node
// Acceptance E6 (1.1.1 P13): E1's use case on a real connection, in the real window, recorded — a library made from one
// sentence, its first update putting items with their original and summary in 待看, one kept and its file in the notes
// folder. Nothing typed in a terminal by the person: the app's own pages are pressed (Playwright), a simulated customer
// (personas.json, Claude Code with no tools — the same as build-live.mjs) answers the main agent's questions as written on the
// page.
//   node tests/live/e6/e6-live.mjs --connection codex|deepseek [--persona 5] --out <folder>
// deepseek: the API key connection, vendor DeepSeek, its recommended model; the key is read from the environment variable
// DEEPSEEK_API_KEY and handed to the app's bridge (setApiKey: kept in safeStorage) — never typed on screen, printed or written.
// A world of its own (a temp folder: app data, the library root) and the app in development (desktop/, not the installer);
// the window is shown (the recording needs drawn frames: one picture every 5 s). Writes <out>/e6-<connection>.json (the steps, the card's name, the
// items, the note, the times, the usage), <out>/video/<connection>-NNNN.jpg and <out>/shots/*.png. Spends quota (real connections).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
const DESKTOP = join(REPO, 'desktop');
const core = await import(pathToFileURL(join(REPO, 'core', 'src', 'index.mjs')).href);
const { _electron } = await import(pathToFileURL(join(DESKTOP, 'node_modules', 'playwright-core', 'index.mjs')).href);
const { appEnv, electronExe } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'paths.mjs')).href);
const { closeApp } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'close-app.mjs')).href);

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const KIND = arg('connection', 'codex');
const OUT = arg('out', null);
const PERSONA = Number(arg('persona', '5'));
if (!['codex', 'deepseek'].includes(KIND) || !OUT) { console.error('usage: e6-live.mjs --connection codex|deepseek --out <folder> [--persona n]'); process.exit(2); }
if (KIND === 'deepseek' && !process.env.DEEPSEEK_API_KEY) { console.error('the environment variable DEEPSEEK_API_KEY is not set'); process.exit(2); }
const CUSTOMER_MODEL = 'claude-sonnet-5-5';
const MAX_STEPS = 9;
const PERSONAS = JSON.parse(readFileSync(join(REPO, 'tests', 'live', 'build', 'personas.json'), 'utf8'));
const P = PERSONAS.personas.find((x) => x.n === PERSONA);
mkdirSync(join(OUT, 'video'), { recursive: true });
mkdirSync(join(OUT, 'shots'), { recursive: true });

const root = join(tmpdir(), `streams-e6-${KIND}-${process.pid}-${randomBytes(3).toString('hex')}`);
const world = { appData: join(root, 'app-data'), localData: join(root, 'local-data'), libraries: join(root, 'libraries') };
for (const d of Object.values(world)) mkdirSync(d, { recursive: true });
writeFileSync(join(world.appData, 'settings.json'), `${JSON.stringify({ schema: 'streams.settings/1', schedule: { enabled: false, time: '08:30' }, panel: { open: true, tab: 'progress' }, theme: 'research', appearance: 'light', connections: { active: KIND === 'codex' ? 'codex' : 'api', 'claude-code': { model: null, verifyModel: null }, codex: { model: null, verifyModel: null }, api: { vendor: 'deepseek', baseUrl: null, model: null, verifyModel: null } } })}\n`);

const record = { connection: KIND, persona: P.n, startedAt: new Date().toISOString(), steps: [], card: null, items: [], kept: null, problems: [] };
const save = () => writeFileSync(join(OUT, `e6-${KIND}.json`), `${JSON.stringify(record, null, 2)}\n`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const customer = core.createConnector({ kind: 'claude-code', model: CUSTOMER_MODEL }, { env, timeoutMs: 300_000 });

function customerPrompt(history, shown, answered) {
  const fixed = Object.entries(P.fixed).map(([k, v]) => `- ${k}：${v}`).join('\n');
  return [
    '你在扮演一位客户，正在和一个资料库应用的助手对话，让它帮你建一座库。照下面的人设和规矩回答，像真人一样。',
    '## 规矩', ...PERSONAS.rules.map((r) => `- ${r}`),
    `## 你是谁\n${P.title}`, `## 你的开场白（已经说过了）\n${P.opener}`,
    `## 藏着的情况（不主动说，被问到才说）\n${P.hidden.map((h) => `- ${h}`).join('\n')}`,
    `## 固定回答（问到哪一样，照那一栏说）\n${fixed}`, `## 看到建库卡后的反应\n${P.reaction}`,
    `## 到现在为止你已经回答了 ${answered} 个问题`,
    `## 之前的对话\n${history.map((h) => `${h.who}：${h.text}`).join('\n') || '（没有）'}`,
    `## 屏幕上助手刚刚给你的\n${shown}`,
    '## 你怎么回', '只回一个 JSON 对象，前后不要别的字：',
    '- 选择题：{"picked": ["点的选项，原字照抄"], "other": "选项都不合适时填的字，没有就空字符串"}',
    '- 纯输入题或别的话：{"answer": "你要说的话"}',
    '- 建库卡：{"answer": "你对卡说的话", "confirm": true 或 false}  confirm 是你要不要点「确认」建库',
  ].join('\n\n');
}
async function askCustomer(history, shown, answered) {
  for (let i = 0; i < 2; i++) {
    const r = await customer.complete({ prompt: customerPrompt(history, shown, answered), format: 'json' });
    if (r.ok && r.json && typeof r.json === 'object') return r.json;
  }
  throw new Error('the customer model gave no readable answer twice');
}

const launched = await _electron.launch({
  executablePath: electronExe(),
  args: ['--force-device-scale-factor=1', DESKTOP],
  env: appEnv({ appData: world.appData, localData: world.localData, extra: { STREAMS_WINDOW: 'shown', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', STREAMS_DEV_LIBRARY: '', STREAMS_DEV_LIBRARY_ROOT: world.libraries, STREAMS_START_SCREEN: 'build' } }),
  timeout: 60_000,
});
const page = await launched.firstWindow({ timeout: 60_000 });
// the recording: a frame every 5 s (Playwright's video of an Electron window stalls the page here), plus a picture at each step
let frameNo = 0
const frames = setInterval(() => { frameNo += 1; page.screenshot({ path: join(OUT, 'video', `${KIND}-${String(frameNo).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 55, mask: [page.locator('.st-path'), page.getByText(/AppData|[A-Z]:\\Users/)] }).catch(() => {}) }, 5000)
const POLL = { polling: 500, timeout: 20 * 60_000 };
const until = (fn, a, timeout = POLL.timeout) => page.waitForFunction(fn, a, { polling: 500, timeout });
const shot = (name) => page.screenshot({ path: join(OUT, 'shots', `${KIND}-${name}.png`), mask: [page.locator('.st-path'), page.getByText(/AppData|[A-Z]:\\Users/)] }).catch(() => {});
const bridge = (name, ...a) => page.evaluate(([n, x]) => window.streams[n](...x), [name, a]);
const t0 = Date.now();
let libPath = null;
const mark = (what, extra = {}) => { record.steps.push({ at: new Date().toISOString(), s: Math.round((Date.now() - t0) / 1000), what, ...extra }); save(); console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${what}`); };

try {
  await page.waitForFunction(() => Boolean(document.querySelector('main[data-screen="build"][data-state="ready"]')), null, { polling: 200, timeout: 90_000 });
  if (KIND === 'deepseek') {
    // the key goes from this process's environment straight to the bridge (safeStorage); nothing typed, printed or written
    const r = await page.evaluate((k) => window.streams.setApiKey('deepseek', k), process.env.DEEPSEEK_API_KEY);
    if (!r?.ok) throw new Error(`setApiKey: ${r?.error?.code}`);
    mark('the DeepSeek key stored (safeStorage)');
  }
  const st = (await bridge('getAppState')).data;
  record.searchLine = await page.evaluate(() => document.querySelector('[data-part="no-search"]')?.textContent ?? null);
  mark('build page', { connection: st.activeConnection, canSearch: st.activeCanSearch ?? null, noSearchLine: record.searchLine !== null });
  await shot('1-start');
  await page.fill('textarea[data-field="opener"]', P.opener);
  await page.click('[data-action="start"] button');
  const history = [{ who: '客户', text: P.opener }];
  let answered = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    // the agent's turn ends: a question open, or the last card
    await until(() => document.querySelector('[data-part="thinking"]') === null && (document.querySelector('[data-part="question"][data-open="true"]') !== null || document.querySelector('article[data-part="build-card"][data-last="true"]') !== null || document.querySelector('[data-part="trouble"]') !== null));
    const now = await page.evaluate(() => {
      const card = document.querySelector('article[data-part="build-card"][data-last="true"]')
      const q = document.querySelector('[data-part="question"][data-open="true"]')
      if (q) return { kind: 'question', qkind: q.dataset.kind, text: q.querySelector('.intro-copy')?.textContent.trim() ?? '', options: [...q.querySelectorAll('[data-option]')].map((b) => b.dataset.option) }
      if (card) return { kind: 'card', canConfirm: card.dataset.canConfirm === 'true', text: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 6000) }
      return { kind: 'trouble', text: document.querySelector('[data-part="trouble"]')?.textContent.trim() ?? '' }
    });
    if (now.kind === 'trouble') { mark('trouble', { text: now.text }); record.problems.push(`trouble: ${now.text}`); break; }
    if (now.kind === 'question') {
      const shown = `问题：${now.text}\n${now.qkind === 'input' ? '（纯输入题，自己打字回答）' : `（选项：${now.options.map((o) => `「${o}」`).join(' ')}）`}`;
      const c = await askCustomer(history, shown, answered);
      history.push({ who: '助手', text: shown });
      answered += 1;
      if (now.qkind !== 'input' && Array.isArray(c.picked) && c.picked.some((o) => now.options.includes(o))) {
        for (const o of c.picked.filter((x) => now.options.includes(x))) await page.click(`[data-part="question"][data-open="true"] [data-option="${o.replace(/"/g, '\\"')}"]`);
        if (typeof c.other === 'string' && c.other.trim()) await page.fill('[data-part="question"][data-open="true"] input[data-field="other"]', c.other.trim()).catch(() => {});
        await page.click('[data-part="question"][data-open="true"] [data-action="answer"] button');
        history.push({ who: '客户', text: [...c.picked, c.other ?? ''].filter(Boolean).join('、') });
      } else {
        const words = String(c.answer ?? c.other ?? '你定。').trim() || '你定。';
        await page.fill('textarea[data-field="message"]', words);
        await page.click('[data-action="send"] button');
        history.push({ who: '客户', text: words });
      }
      mark(`question ${answered} answered`, { question: now.text.slice(0, 200) });
      continue;
    }
    // the card
    record.card = { canConfirm: now.canConfirm, words: now.text.length };
    await shot('2-card');
    const c = await askCustomer(history, `【建库卡】\n${now.text}\n${now.canConfirm ? '（卡下面有「确认」按钮）' : '（这张卡下面没有「确认」按钮）'}`, answered);
    history.push({ who: '助手', text: '（建库卡）' });
    if (now.canConfirm && c.confirm !== false) {
      await page.click('article[data-part="build-card"][data-last="true"] [data-action="confirm"] button');
      mark('card confirmed');
      break;
    }
    const words = String(c.answer ?? '确认').trim() || '确认';
    await page.fill('textarea[data-field="message"]', words);
    await page.click('[data-action="send"] button');
    history.push({ who: '客户', text: words });
    mark('card answered, not confirmed', { canConfirm: now.canConfirm, said: words.slice(0, 200) });
  }
  record.questions = answered;
  const lib = (await bridge('getAppState')).data.library;
  if (!lib?.path) throw new Error('no library made');
  record.library = { name: lib.name };
  libPath = lib.path;
  mark('library made', { name: lib.name });
  // its first update starts by itself (W10); 待看 when it is done
  const rounds = () => { const f = join(lib.path, '_pipeline', 'rounds.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []; };
  await page.click('[data-tab="inbox"]').catch(() => {});
  await shot('3-running');
  for (let i = 0; i < 20 * 60 * 2 && !rounds().some((r) => r.finishedAt); i++) await page.waitForTimeout(500);
  const round = rounds().find((r) => r.finishedAt) ?? null;
  record.round = round ? { status: round.status, counts: round.counts, seconds: Math.round((Date.parse(round.finishedAt) - Date.parse(round.startedAt)) / 1000) } : null;
  mark('first update ended', { round: record.round });
  await page.waitForTimeout(2000);
  const inbox = (await bridge('getInbox')).data;
  const items = inbox?.items ?? [];
  record.items = items.map((x) => ({ title: x.title, original: x.original?.saved === true, summary: Boolean(x.summary?.what), verified: x.verification?.passed === true }));
  await shot('4-inbox');
  const good = items.find((x) => x.original?.saved === true && x.summary?.what);
  if (!good) { record.problems.push('no item with its original and a summary'); mark('no item to keep'); }
  else {
    await page.click(`article[data-card][data-url="${good.url.replace(/"/g, '\\"')}"] [data-action="keep"] button`);
    await page.waitForTimeout(1500);
    const notes = join(lib.path, 'notes');
    const files = existsSync(notes) ? readdirSync(notes).filter((f) => f.endsWith('.md')) : [];
    record.kept = { title: good.title, noteFiles: files };
    mark('kept one', { notes: files });
    await shot('5-kept');
  }
} catch (err) {
  record.problems.push(String(err?.message ?? err));
  mark('stopped', { error: String(err?.message ?? err).slice(0, 400) });
  await shot('x-stopped');
} finally {
  // the usage the app counted (its own usage file: calls and tokens; no key there)
  try {
    const pick = (u) => (u ? { calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd } : null);
    const agentFile = join(world.appData, 'agent', 'usage.jsonl');
    record.usage = { library: libPath ? pick(core.readUsage(libPath)) : null, mainAgent: existsSync(agentFile) ? pick(core.readUsageFile(agentFile)) : null };
  } catch (err) { record.usage = { error: String(err?.message ?? err) }; }
  clearInterval(frames)
  record.frames = frameNo
  record.finishedAt = new Date().toISOString();
  save();
  await closeApp(launched, { userDataDir: join(world.appData, 'electron') }).catch(() => {});
  console.log(JSON.stringify({ ok: record.problems.length === 0, questions: record.questions, items: record.items.length, kept: record.kept?.noteFiles?.length ?? 0, problems: record.problems }));
}
