#!/usr/bin/env node
// v2 package M, contract M1 (docs/design/v2/agent-trial-2026-11-10.md): Claude Code's argv changed from `--output-format json`
// to `--output-format stream-json --verbose`; do the three real paths still work, and does the plan's quota come with them?
//   node core/scripts/quota-trial.mjs [--dry] [--out <file.json>]
//     --dry   the same run on core/test/support/fake-cli.mjs (no model call): checks the trial itself
// Real calls (the `claude` on PATH; nothing else): the main agent, one conversation of 2 turns (a new session, then a resume);
// 问库 once (one kept note in a throw-away library); one score (previewNode on the relevance gate: write:false, nothing
// written; the network off, so no fetch leaves the machine). At most CALL_BUDGET model calls in all.
// Everything is in a new temporary folder made with fs.mkdirSync (never mkdtemp): the library, the agent's folder and its
// working folder, the connectors' throw-away folders. It never reads or writes %APPDATA%\Streams (checked before anything
// runs), and never reads ~/.claude. The connectors are the product's own (the argv of claude-code.mjs / session.mjs).
// Per call it records: ok, JSON or not, quota or not (and the windows), how long, tokens; and, from the child's stdout, the
// kinds of lines and the rate_limit_event / result lines themselves (the result text clipped).
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibrary, writeNoteFile, rebuildIndex, ask, previewNode, createConnector, createSessionConnector, agentTurn } from '../src/index.mjs';

export const CALL_BUDGET = 8;
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const outAt = args.indexOf('--out');
const HERE = dirname(fileURLToPath(import.meta.url));

const root = join(tmpdir(), `streams-quota-trial-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`);
const realAppData = process.env.APPDATA ? resolve(process.env.APPDATA, 'Streams') : null;
const inside = (child, parent) => { const r = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase()); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
if (realAppData && inside(root, realAppData)) throw new Error(`refusing: ${root} is inside the real app data ${realAppData}`);
mkdirSync(root, { recursive: true });
const side = join(root, 'side');
const agentDir = join(root, 'agent');
const agentCwd = join(root, 'cwd-agent');
const lib = join(root, 'library');
for (const d of [side, agentDir]) mkdirSync(d, { recursive: true });

// one library, one kept note, for 问库 and the score
createLibrary(lib, { name: '试验库' });
writeNoteFile(lib, {
  id: '2026-11-08-agent-memory-blocks',
  header: { title: 'Memory blocks for long-running agents', source: 'https://example.test/memory-blocks', source_name: 'example', date: '2026-11-08', collected: '2026-11-09', kept: '2026-11-09', status: 'kept', topics: ['agent 记忆'] },
  body: '**这是什么：**一篇介绍长期运行的 agent 用「记忆块」保存用户偏好与任务状态的工程博客。\n\n要点：记忆块按主题分区；每块有大小上限；超限时先压缩再淘汰。\n',
}, { by: 'keep' });
rebuildIndex(lib);

// the child's stdout, kept per call (the connector reads it as always; this only listens too)
const outputs = [];
function teeSpawn(file, argv, opts) {
  const child = nodeSpawn(file, argv, opts);
  const rec = { argv: [...argv], stdout: '' };
  outputs.push(rec);
  child.stdout?.on('data', (d) => { rec.stdout += Buffer.from(d).toString('utf8'); });
  return child;
}
const FAKE = [process.execPath, join(HERE, '..', 'test', 'support', 'fake-cli.mjs')];
const connection = { kind: 'claude-code', ...(DRY ? { command: FAKE } : {}) };
const deps = { tmpRoot: side, spawnImpl: teeSpawn, timeoutMs: 240_000 };

let used = 0;
const calls = [];
function budgeted(conn, label) {
  const run = async (mode, fn) => {
    if (used >= CALL_BUDGET) return { ok: false, code: 'unknown', detail: 'trial budget used up', usage: { calls: 0 } };
    used++;
    const before = outputs.length;
    const t0 = Date.now();
    const r = await fn();
    const ms = Date.now() - t0;
    const out = outputs.slice(before).at(-1)?.stdout ?? '';
    const lines = out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));
    const types = lines.map((l) => { try { return JSON.parse(l).type; } catch { return '?'; } });
    const rate = lines.filter((l) => l.includes('"rate_limit_event"')).at(-1) ?? null;
    let result = lines.filter((l) => l.includes('"type":"result"')).at(-1) ?? null;
    if (result) { try { const j = JSON.parse(result); j.result = String(j.result ?? '').slice(0, 300); result = JSON.stringify(j); } catch { /* as printed */ } }
    calls.push({ label, mode, ms, ok: r.ok, code: r.ok ? null : r.code, json: r.ok || r.code !== 'bad-format', quota: r.quota ?? null, sessionId: r.sessionId ?? null, resumed: r.resumed ?? null, usage: r.usage ?? null, stdoutLineTypes: types, rateLimitLine: rate, resultLine: result });
    console.log(`${label} ${mode}: ${r.ok ? 'ok' : r.code} in ${ms} ms; quota ${r.quota ? JSON.stringify(r.quota.windows) : 'none'}; lines ${types.join(',')}`);
    return r;
  };
  return { ...conn, complete: (req) => run('complete', () => conn.complete(req)), send: (req, o) => run('send', () => conn.send(req, o)) };
}

const results = { root, dry: DRY, startedAt: new Date().toISOString(), budget: CALL_BUDGET };

// 1. the main agent: two turns of one conversation (a new session, then a resume)
const session = budgeted(createSessionConnector(connection, { ...deps, log: (l) => console.log(`  [agent] ${l}`) }, { cwd: agentCwd }), 'agent');
const turns = [];
for (const text of ['你好。用一两句话说说你在流息里能帮我做什么。', '我刚才问了你什么？一句话回答。']) {
  const t0 = Date.now();
  let r;
  try { r = await agentTurn({ text }, { agentDir, connector: session, registry: { libraries: [] }, proposals: () => [], createProposal: async () => { throw new Error('the trial makes no cards'); }, log: (l) => console.log(`  [agent] ${l}`) }); } catch (err) { r = { error: String(err?.stack ?? err) }; }
  turns.push({ text, ms: Date.now() - t0, reply: r.reply ?? null, notice: r.notice ?? [], error: r.error ?? null });
  console.log(`agent turn: ${String(r.reply ?? r.error).slice(0, 200)}`);
}
results.turns = turns;
results.agentCwdEmpty = !existsSync(agentCwd) || readdirSync(agentCwd).length === 0;

// 2. 问库 once
const once = budgeted(createConnector(connection, deps), 'ask');
const asked = await ask(lib, '记忆块超出大小上限时怎么处理？', { connector: once });
results.ask = { ok: asked.ok ?? null, answer: String(asked.answer ?? asked.text ?? asked.detail ?? '').slice(0, 400), citations: asked.citations ?? asked.cited ?? null, code: asked.code ?? null };

// 3. one score: the relevance gate on one item, nothing written, no network
const scorer = budgeted(createConnector(connection, deps), 'score');
const noNetwork = async () => { throw Object.assign(new Error('the trial keeps the network off'), { code: 'ENOTFOUND' }); };
const scored = await previewNode(lib, { connector: scorer, nodeId: 'relevance', item: { url: 'https://example.test/agent-memory-eviction', title: 'How agents evict old memories when the memory block is full', source: 'example', date: '2026-11-09', summary: 'An engineering note on compressing then evicting memory blocks in long-running agents.' }, ctx: { fetchImpl: noNetwork } });
results.score = { ok: scored.ok, status: scored.status ?? null, output: scored.output ?? null, code: scored.code ?? null, calls: scored.calls ?? null };

results.calls = calls;
results.used = used;
results.sideEmpty = readdirSync(side).length === 0;
results.finishedAt = new Date().toISOString();
const out = outAt >= 0 ? args[outAt + 1] : join(root, 'trial-results.json');
writeFileSync(out, JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log(`model calls used: ${used} of ${CALL_BUDGET}; results: ${out}`);
