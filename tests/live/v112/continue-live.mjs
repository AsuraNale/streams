#!/usr/bin/env node
// 1.1.2 P1, the scorecard's「live」: on a real connection (Claude Code) and a real library, in the real window — from the
// library into its conversation with the main agent; say it is not enough; the agent, told the library's last update, proposes
// a larger 「每次更新的量」; 确认 writes it; one update at that step, whose record carries that step's limits.
//   node tests/live/v112/continue-live.mjs --library <a library folder> [--ended <its ended conversation file>] --out <folder>
// The library is COPIED into a world of its own (a temp folder); the original is only read. The ended conversation file, when
// given, is copied into the world's app data (so the library's earlier conversation is there, as on the user's machine).
// The app in development (desktop/), the window shown, a frame every 5 s. A scripted user (no model): a choice question gets
// its first option, any other turn gets 「按你的建议改，请交卡」. Spends quota (a real connection).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
const DESKTOP = join(REPO, 'desktop');
const core = await import(pathToFileURL(join(REPO, 'core', 'src', 'index.mjs')).href);
const { _electron } = await import(pathToFileURL(join(DESKTOP, 'node_modules', 'playwright-core', 'index.mjs')).href);
const { appEnv, electronExe } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'paths.mjs')).href);
const { closeApp } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'close-app.mjs')).href);
const arg = (name, dflt = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const SRC = arg('library');
const ENDED = arg('ended');
const OUT = arg('out');
const SAY = arg('say', '我觉得东西不够全，可以多帮我找一点吗？');
if (!SRC || !OUT || !existsSync(join(SRC, '_card', 'card.json'))) { console.error('usage: continue-live.mjs --library <a library with a card> [--ended <file>] --out <folder>'); process.exit(2); }

mkdirSync(join(OUT, 'video'), { recursive: true });
mkdirSync(join(OUT, 'shots'), { recursive: true });
const root = join(tmpdir(), `streams-v112-live-${process.pid}-${randomBytes(3).toString('hex')}`);
const world = { appData: join(root, 'app-data'), localData: join(root, 'local-data'), libraries: join(root, 'libraries') };
for (const d of Object.values(world)) mkdirSync(d, { recursive: true });
// node's cpSync ends the process without a word on this machine for a folder with Chinese in its path (exit 127): copied file by file
function copyTree(from, to) { mkdirSync(to, { recursive: true }); for (const e of readdirSync(from, { withFileTypes: true })) { const a = join(from, e.name); const b = join(to, e.name); if (e.isDirectory()) copyTree(a, b); else if (e.isFile()) copyFileSync(a, b); } }
const lib = join(world.libraries, basename(SRC));
copyTree(SRC, lib);
if (ENDED) { mkdirSync(join(world.appData, 'build'), { recursive: true }); copyFileSync(ENDED, join(world.appData, 'build', basename(ENDED))); }
writeFileSync(join(world.appData, 'settings.json'), `${JSON.stringify({ schema: 'streams.settings/1', schedule: { enabled: false, time: '08:30' }, panel: { open: true, tab: 'progress' }, theme: 'research', appearance: 'light', connections: { active: 'claude-code', 'claude-code': { model: null, verifyModel: null }, codex: { model: null, verifyModel: null }, api: { vendor: null, baseUrl: null, model: null, verifyModel: null } } })}\n`);

const record = { startedAt: new Date().toISOString(), steps: [], turns: [], before: null, after: null, update: null, problems: [] };
const save = () => writeFileSync(join(OUT, 'continue-live.json'), `${JSON.stringify(record, null, 2)}\n`);
const rounds = () => { const f = join(lib, '_pipeline', 'rounds.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []; };
record.before = { volume: core.readLibraryVolume(lib).volume, rounds: rounds().length };

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const launched = await _electron.launch({
  executablePath: electronExe(),
  args: ['--force-device-scale-factor=1', DESKTOP],
  env: appEnv({ appData: world.appData, localData: world.localData, extra: { STREAMS_WINDOW: 'shown', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', STREAMS_DEV_LIBRARY: lib, STREAMS_DEV_LIBRARY_ROOT: world.libraries, STREAMS_START_SCREEN: 'inbox' } }),
  timeout: 60_000,
});
const page = await launched.firstWindow({ timeout: 60_000 });
const mask = () => [page.locator('.st-path'), page.getByText(/AppData|[A-Z]:\\Users/)];
let frameNo = 0;
const frames = setInterval(() => { frameNo += 1; page.screenshot({ path: join(OUT, 'video', `v112-${String(frameNo).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 55, mask: mask() }).catch(() => {}); }, 5000);
const until = (fn, a, timeout = 20 * 60_000) => page.waitForFunction(fn, a, { polling: 500, timeout });
const shot = (name) => page.screenshot({ path: join(OUT, 'shots', `${name}.png`), mask: mask() }).catch(() => {});
const t0 = Date.now();
const mark = (what, extra = {}) => { record.steps.push({ s: Math.round((Date.now() - t0) / 1000), what, ...extra }); save(); console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${what}`); };
const idle = () => until(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null && document.querySelector('[data-part="thinking"]') === null);
const lastAgent = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-row="agent"]')];
  const a = rows.at(-1);
  if (!a) return null;
  const card = a.querySelector('article[data-part="build-card"]');
  const q = a.querySelector('[data-part="question"]');
  return { kind: a.dataset.kind, say: a.querySelector('[data-part="reply"]')?.textContent ?? '', canConfirm: card?.dataset.canConfirm === 'true', changes: card ? [...card.querySelectorAll('[data-change]')].map((c) => c.dataset.change) : [], volumeLine: card?.querySelector('[data-change="volume"]')?.textContent ?? null, question: q ? { kind: q.dataset.kind, open: q.dataset.state === 'open', options: [...q.querySelectorAll('[data-option]')].map((o) => o.dataset.option) } : null };
});

try {
  await until(() => document.querySelector('main[data-screen="inbox"]') !== null, null, 90_000);
  await page.click('nav.st-lib-tabs button[data-tab="sources"]');
  await until(() => document.querySelector('section[data-part="volume"] [data-volume]:not([disabled])') !== null);
  await page.locator('section[data-part="volume"]').scrollIntoViewIfNeeded();
  await shot('1-sources-volume');
  mark('来源与要求: the step shown', { checked: await page.evaluate(() => document.querySelector('section[data-part="volume"] [aria-checked="true"]')?.dataset.volume), near: await page.evaluate(() => document.querySelector('[data-part="volume-near"]')?.textContent ?? null), countLimit: await page.evaluate(() => document.querySelector('[data-part="card-count-limit"]')?.textContent ?? null) });
  await page.click('[data-action="change-card"] button');
  await until(() => document.querySelector('main[data-screen="build"][data-mode="edit"][data-view="start"]') !== null);
  await page.waitForTimeout(1500);
  await shot('2-continue-start');
  mark('the library\'s conversation opened', { earlier: await page.evaluate(() => document.querySelectorAll('[data-part="earlier"] [data-earlier]').length) });
  await page.fill('textarea[data-field="opener"]', SAY);
  await page.click('[data-action="start"] button');
  record.turns.push({ who: 'user', text: SAY });
  await idle();
  await shot('3-first-reply');
  for (let i = 0; i < 5; i++) {
    const a = await lastAgent();
    record.turns.push({ who: 'agent', ...a, say: (a?.say ?? '').slice(0, 1500) });
    save();
    if (a?.kind === 'card' && a.canConfirm) {
      await shot('4-card');
      mark('a card that can be confirmed', { changes: a.changes, volumeLine: a.volumeLine });
      await page.click('article[data-part="build-card"][data-last="true"] [data-action="confirm"] button');
      await until(() => document.querySelector('main[data-screen="sources"]') !== null);
      mark('confirmed');
      break;
    }
    if (a?.kind === 'question' && a.question?.open && a.question.options.length) {
      await page.click(`[data-row="agent"]:last-of-type [data-part="question"] [data-option="${a.question.options[0].replace(/"/g, '\\"')}"]`).catch(async () => { await page.locator('[data-part="question"][data-state="open"] [data-option]').first().click(); });
      await page.click('[data-part="question"][data-state="open"] [data-action="answer"] button');
      record.turns.push({ who: 'user', picked: a.question.options[0] });
    } else {
      const words = '按你的建议改，请交卡。';
      await page.fill('textarea[data-field="message"]', words);
      await page.click('[data-action="send"] button');
      record.turns.push({ who: 'user', text: words });
    }
    await idle();
  }
  record.after = { volume: core.readLibraryVolume(lib).volume, cardHasVolume: Object.hasOwn(JSON.parse(readFileSync(join(lib, '_card', 'card.json'), 'utf8')), 'volume') };
  mark('after 确认', record.after);
  await page.waitForTimeout(1500);
  await page.locator('section[data-part="volume"]').scrollIntoViewIfNeeded().catch(() => {});
  await shot('5-sources-after');
  // one update at the step now
  const n0 = rounds().length;
  await page.click('[data-part="run-button"] button');
  mark('update started');
  for (let i = 0; i < 30 * 60 * 2 && !(rounds().length > n0 && rounds().at(-1).finishedAt); i++) await page.waitForTimeout(500);
  const r = rounds().length > n0 ? rounds().at(-1) : null;
  record.update = r ? { status: r.status, volume: r.volume, budget: r.budget, counts: r.counts, agent: { searches: r.agent?.searches, reads: r.agent?.reads }, seconds: Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000) } : null;
  mark('update ended', { update: record.update });
  await page.click('nav.st-lib-tabs button[data-tab="inbox"]').catch(() => {});
  await page.waitForTimeout(2000);
  await shot('6-inbox');
} catch (err) {
  record.problems.push(String(err?.message ?? err));
  mark('stopped', { error: String(err?.message ?? err).slice(0, 400) });
  await shot('x-stopped');
} finally {
  clearInterval(frames);
  record.frames = frameNo;
  try { const pick = (u) => (u ? { calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd } : null); record.usage = { library: pick(core.readUsage(lib)) }; } catch (err) { record.usage = { error: String(err?.message ?? err) }; }
  record.finishedAt = new Date().toISOString();
  save();
  await closeApp(launched, { userDataDir: join(world.appData, 'electron') }).catch(() => {});
}
