#!/usr/bin/env node
// Acceptance C5 on a real connection (1.1 W5): the four library cards the simulated customers confirmed in W4's live
// runs (docs/checks/2026-11-20-1.1/w4/evidence/live/round-2/claude-code-<n>.json), each in a new library with two items
// already in it (the card's first two examples), updated once by core's own update (core/src/update/run.mjs, the shipped
// update SOP, Claude Code with the two web tools, Opus 5.5). Then:
//   finished    the update ended with status 'done' (it did not stop, did not ask anything: it can only hand in JSON)
//   read        every item in 待看 came from a page handed to it or one it opened (the code drops the others: counted)
//   no-repeat   neither of the two items already in the library is in 待看 again
//   in-scope    a model that only judges reads the card and each item: in the card's scope or not
//   empty-ok    an update with nothing worth taking hands in none (reported, not a line)
//   node tests/live/update/update-live.mjs --out <folder> [--persona 1,2,3,5] [--connection claude-code|codex]
//   1.1.1 P3 (acceptance C8): --connection codex runs the update agent on Codex (its default model); the judge stays Claude
//   Code with no tools (Opus 5.5), the same as for Claude Code's runs
// Spends quota. Pages are read the direct way only (no Electron here: the render tier is the app's).
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
const core = await import(pathToFileURL(join(REPO, 'core', 'src', 'index.mjs')).href);
const { createLibrary, writeCard, appendEvent, runUpdate, createSessionConnector, createConnector, createPageReader, createLinkReader, listInbox, sameUrl, renderCard } = core;

const MAIN_MODEL = 'claude-opus-5-5';
const KIND = (() => { const i = process.argv.indexOf('--connection'); return i < 0 ? 'claude-code' : process.argv[i + 1]; })();
if (!['claude-code', 'codex'].includes(KIND)) { console.error('--connection claude-code | codex'); process.exit(2); }
const JUDGE_MODEL = 'claude-opus-5-5';
const CARDS = join(REPO, 'docs', 'checks', '2026-11-20-1.1', 'w4', 'evidence', 'live', 'round-2');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? dflt : process.argv[i + 1]; };
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const newDir = (label) => { const d = join(tmpdir(), `streams-live-update-${label}-${process.pid}-${randomBytes(3).toString('hex')}`); mkdirSync(d, { recursive: true }); return d; };

function judgePrompt(card, items) {
  return [
    '你是只打分的核对员，不做任务。下面是一座资料库的建库卡，和这一次更新放进「待看」的条目。逐条判：这一条在不在建库卡的范围里（收什么、不收什么、边界、硬条件都算）。只看卡和条目本身。',
    `## 建库卡\n${renderCard(card, 'zh-CN')}`,
    `## 条目\n${items.map((it, i) => `[${i + 1}] ${it.title}\n网址：${it.url}\n这是什么：${it.summary?.what ?? ''}`).join('\n\n')}`,
    '只回 JSON：{"items":[{"n":1,"inScope":true,"why":"一句话"}]}',
  ].join('\n\n');
}

async function judgeScope(card, items) {
  if (!items.length) return [];
  const conn = createConnector({ kind: 'claude-code', model: JUDGE_MODEL }, { env, timeoutMs: 300_000 });
  for (let i = 0; i < 2; i++) {
    const r = await conn.complete({ prompt: judgePrompt(card, items), format: 'json' });
    if (r.ok && Array.isArray(r.json?.items)) return items.map((it, k) => { const v = r.json.items.find((x) => x?.n === k + 1); return { url: it.url, inScope: v?.inScope === true, why: typeof v?.why === 'string' ? v.why : 'no verdict' }; });
  }
  throw new Error('the judge gave no readable verdicts twice');
}

async function runOne(n, out) {
  const rec = JSON.parse(readFileSync(join(CARDS, `claude-code-${n}.json`), 'utf8'));
  const card = rec.card;
  const work = newDir(String(n));
  const dir = join(work, 'library');
  createLibrary(dir, { name: card.name, language: 'zh-CN' });
  writeCard(dir, card);
  const existing = (card.samples ?? []).slice(0, 2).map((s) => ({ url: s.url, title: s.title }));
  for (const e of existing) {
    appendEvent(dir, { ev: 'seen', url: e.url, source: 'card', title: e.title });
    appendEvent(dir, { ev: 'kept', url: e.url, id: `kept-${randomBytes(2).toString('hex')}` });
  }
  const connector = createSessionConnector(KIND === 'claude-code' ? { kind: KIND, model: MAIN_MODEL } : { kind: KIND }, { env }, { cwd: join(work, 'cwd'), web: true });
  const judge = createConnector({ kind: 'claude-code', model: JUDGE_MODEL }, { env, timeoutMs: 300_000 });
  const t0 = Date.now();
  let result;
  try {
    result = await runUpdate(dir, { connector, judge, kind: KIND, readPage: createPageReader().read, readLinks: createLinkReader().read, pendingDir: join(work, 'pending') });
  } catch (e) {
    result = { started: false, status: 'error', problems: [{ code: 'error', detail: String(e?.message ?? e) }] };
  }
  const inbox = listInbox(dir).map((c) => ({ url: c.url, title: c.title, summary: c.summary, verification: c.verification, original: c.original ?? { saved: true }, aiInstruction: c.aiInstruction === true }));
  let scope = [];
  let judgeError = null;
  try { scope = await judgeScope(card, inbox); } catch (e) { judgeError = String(e?.message ?? e); }
  const repeated = inbox.filter((c) => existing.some((e) => sameUrl(e.url, c.url))).map((c) => c.url);
  const lines = {
    finished: { ok: result.status === 'done', status: result.status },
    read: { ok: true, droppedNotRead: (result.record?.dropped ?? []).filter((d) => d.why === 'not-read').length },
    'no-repeat': { ok: repeated.length === 0, repeated, droppedAlready: (result.record?.dropped ?? []).filter((d) => d.why === 'already').length },
    'in-scope': { ok: judgeError === null && scope.every((s) => s.inScope), out: scope.filter((s) => !s.inScope) },
  };
  const record = { connection: KIND, persona: n, card: card.name, seconds: Math.round((Date.now() - t0) / 1000), status: result.status, problems: result.problems ?? null, run: result.record ?? null, existing, inbox, scope, judgeError, lines, ok: Object.values(lines).every((l) => l.ok) };
  writeFileSync(join(out, `update-${n}.json`), JSON.stringify(record, null, 1));
  try { rmSync(work, { recursive: true, force: true }); } catch { /* left in the temp folder */ }
  return record;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(arg('out', join(here, 'out')));
  mkdirSync(out, { recursive: true });
  const wanted = String(arg('persona', '1,2,3,5')).split(',').map(Number);
  const runs = await Promise.all(wanted.map((n) => runOne(n, out).catch((e) => ({ persona: n, ok: false, status: 'error', problems: [{ detail: String(e?.message ?? e) }] }))));
  const summary = { connection: KIND, at: new Date().toISOString(), ok: runs.every((r) => r.ok), runs: runs.map((r) => ({ persona: r.persona, ok: r.ok, status: r.status, seconds: r.seconds, inbox: r.inbox?.length ?? 0, verified: (r.inbox ?? []).filter((c) => c.verification?.passed).length, missing: (r.inbox ?? []).filter((c) => c.original?.saved === false).length, lines: Object.fromEntries(Object.entries(r.lines ?? {}).map(([k, v]) => [k, v.ok])), searches: r.run?.agent?.searches, reads: r.run?.agent?.reads, calls: r.run?.calls })) };
  writeFileSync(join(out, 'update-summary.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  process.exit(summary.ok ? 0 : 1);
}
