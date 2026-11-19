// One round of the 11-19 prototype: Streams hands the library to Claude Code (WebSearch and WebFetch only), the model
// hands back sources and items, guards.mjs keeps what passes, and the round is written under <dir>/agentrun/. Not wired
// into the app; nothing here writes notes/ (that stays core/src/library/write-note.mjs alone, V2).
//
// CLAUDE_AGENT_ARGS: Streams 1.0.1's fixed arguments (connect/claude-code.mjs CLAUDE_FIXED_ARGS) with --tools changed to
// WebSearch,WebFetch, those two allowed, and a spending cap.
// runClaude({ prompt, budgetUsd, timeoutMs, spawnImpl, tmpRoot }) -> { exit, seconds, stdout, stderr, parsed }
//   cwd: a new empty folder made with mkdirSync (not mkdtemp: on Windows its ACL keeps a sandboxed child out), removed after.
// runAgentRound(dir, { userText, today, extraSources, runner, maxAgeDays, max }) -> the round record (also in
//   agentrun/rounds/<n>.json); agentrun/state.json keeps { rounds, sources, seen } for the next round.
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CLAUDE_FIXED_ARGS } from '../connect/claude-code.mjs';
import { buildPrompt } from './frame.mjs';
import { parseStream, answerJson } from './stream.mjs';
import { checkItems, checkSources, cleanAspects, windowOf, DEFAULT_MAX_ITEMS } from './guards.mjs';

export const AGENT_TOOLS = 'WebSearch,WebFetch';
export const DEFAULT_BUDGET_USD = 2;
export const DEFAULT_TIMEOUT_MS = 20 * 60_000;

export function claudeAgentArgs({ budgetUsd = DEFAULT_BUDGET_USD } = {}) {
  const args = [...CLAUDE_FIXED_ARGS];
  const i = args.indexOf('--tools');
  args.splice(i, 2, '--tools', AGENT_TOOLS, '--allowedTools', 'WebSearch', 'WebFetch');
  args.push('--max-budget-usd', String(budgetUsd));
  return args;
}

export async function runClaude({ prompt, budgetUsd = DEFAULT_BUDGET_USD, timeoutMs = DEFAULT_TIMEOUT_MS, spawnImpl = nodeSpawn, tmpRoot = tmpdir(), command = 'claude' } = {}) {
  const cwd = join(tmpRoot, `streams-agentrun-${process.pid}-${randomBytes(4).toString('hex')}`);
  mkdirSync(cwd);
  const t0 = Date.now();
  try {
    const child = spawnImpl(command, claudeAgentArgs({ budgetUsd }), { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end(prompt);
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const exit = await new Promise((resolve) => child.on('close', resolve));
    clearTimeout(timer);
    return { exit, seconds: Math.round((Date.now() - t0) / 1000), stdout, stderr, parsed: parseStream(stdout) };
  } finally {
    try { rmdirSync(cwd); } catch { /* not empty or gone: left in the temp folder */ }
  }
}

const STATE = (dir) => join(dir, 'agentrun', 'state.json');

export function readState(dir) {
  const p = STATE(dir);
  if (!existsSync(p)) return { rounds: 0, aspects: [], sources: [], seen: [] };
  return JSON.parse(readFileSync(p, 'utf8'));
}

// v2: how many kept items each aspect has so far (from the seen list)
export function aspectCounts(aspects = [], seen = []) {
  const out = Object.fromEntries(aspects.map((a) => [a, 0]));
  for (const s of seen) if (typeof s.aspect === 'string' && Object.hasOwn(out, s.aspect)) out[s.aspect] += 1;
  return out;
}

// v2: round 1 sets the aspects (guards.mjs cleanAspects); every item must name one (guards.mjs `aspect`); the per-aspect
// counts so far go into the next prompt and into each round record; state.json keeps { rounds, aspects, sources, seen }.
export async function runAgentRound(dir, { userText, today = new Date(), extraSources = [], runner = runClaude, maxAgeDays = 7, max = DEFAULT_MAX_ITEMS, budgetUsd } = {}) {
  const state = readState(dir);
  const round = state.rounds + 1;
  const { from, to } = windowOf(today, maxAgeDays);
  const before = state.aspects ?? [];
  const prompt = buildPrompt({ round, userText, sources: state.sources, seen: state.seen, aspects: before, aspectCounts: aspectCounts(before, state.seen), from, to, extraSources });
  const r = await runner({ prompt, ...(budgetUsd ? { budgetUsd } : {}) });
  const p = r.parsed;
  const answer = answerJson(p.text);
  const src = round === 1 ? checkSources({ sources: answer?.sources, fetches: p.fetches }) : { kept: state.sources, dropped: [] };
  const aspects = round === 1 ? cleanAspects(answer?.aspects) : before;
  const items = checkItems({ items: answer?.items, fetches: p.fetches, seen: state.seen, today, maxAgeDays, max, aspects });
  const next = {
    rounds: round,
    aspects,
    sources: round === 1 ? src.kept : state.sources,
    seen: [...state.seen, ...items.kept.map((i) => ({ title: i.title, url: i.url, aspect: i.aspect.trim(), round }))],
  };
  const record = {
    round, at: new Date().toISOString(), today: to, window: items.window, prompt,
    run: { exit: r.exit, seconds: r.seconds, costUsd: p.costUsd, turns: p.turns, isError: p.isError, models: p.models, quota: p.quota, otherTools: p.otherTools, searches: p.searches.length, fetches: p.fetches.map((f) => ({ url: f.url, chars: f.text.length, isError: f.isError })) },
    answered: answer !== null,
    raw: answer,
    aspects,
    aspectCounts: aspectCounts(aspects, next.seen),
    sources: { kept: src.kept, dropped: src.dropped },
    items: { kept: items.kept, dropped: items.dropped },
    extraSources,
  };
  mkdirSync(join(dir, 'agentrun', 'rounds'), { recursive: true });
  writeFileSync(join(dir, 'agentrun', 'rounds', `${round}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  writeFileSync(join(dir, 'agentrun', 'rounds', `${round}.stdout.jsonl`), r.stdout ?? '', 'utf8');
  writeFileSync(STATE(dir), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return record;
}
