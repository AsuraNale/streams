// 重新评分 (redesign R5a; N07, 维护者 11-12 第 5 条; core-api 4.6): once the 评分标准 changed (the 追踪要求, the thresholds /
// 严格程度, a scoring step's prompt or material), the items already judged keep their verdict and stay where they are — the
// next run does not score them again (queue.mjs). The 未通过筛选 ones judged under the old standard are listed here, and only
// the user's 重新评分 scores them under the new one.
//
// rescoreInfo(libraryDir, { limit = 50 }) -> { total, items, changedAt, changedField, expectedCalls: [lo, hi], cap }
//   total / items   the 未通过筛选 items whose verdict was made under another standard (decide.mjs listRejected onlyOld:
//                   newest first, at most `limit`)
//   changedAt       when the 评分标准 last changed (the newest changes.jsonl line of brief · thresholds · prompts), or null
//                   (not recorded: a library of before v2 package B, or the upgrade to R5a, when the 追踪要求 joined the cfg)
//   changedField    redesign R5b: which of them that newest line changed — 'brief' (追踪要求) · 'thresholds' (严格程度) ·
//                   'prompts' (评分环节) — or null with changedAt (the page says which one changed, P05)
//   expectedCalls   the estimate of estimate.mjs (estimateFirstRound: the self-check's call + each item 1–4 calls, each side
//                   at most the 单次运行上限); [0, 0] when there is nothing to score again
// rescoreRejected(libraryDir, { connector, cap?, ctx?, signal?, onProgress?, now? })
//   -> { ok, started, rescore: true, calls, callsBy, targets, counts: { rescored, inbox, below, unscored, partial }, remaining,
//        stoppedAt?, problems }
//   -> { ok: false, started: false, problems }  when the self-check fails (nothing written)
//   The self-check (its probe: one call, as a run's), then each of the targets of the start (rescoreInfo's items, all of
//   them), one after the other: every step of the item that was judged under the old standard is judged again under the new
//   one (queue.mjs nextStep { rescore: true }), the gates in order, then the summary for an item that passes them all — into
//   待看 (runSummary: the inbox file and the `inbox` event, verified or not, as any run's). An item still below stays in
//   未通过筛选 (no longer old). The calls count against the 单次运行上限 (`cap`, default the pipeline's): at the cap it stops
//   before the next step (stoppedAt 'cap'); the items not reached keep their old verdict and are listed again, for the next
//   重新评分 — never for the next run. The item it stopped in the middle of (a step judged again under the new standard, the
//   next one not yet: precheck fix 9) is counted in `partial` — it is no longer old, and its next step is the next run's, as
//   any item that waits at a step (the calls it took are in `calls`, so counts and calls never disagree). A connection failure stops at once ('connection'), as a run. Every call is a line of
//   the library's usage file (purposes rescore:gate:<id> · rescore:summary). Never the note folder (V2), never rounds.jsonl
//   (重新评分 is not a run: rule ②'s count of runs and 上次运行 stay as they are).
import { randomBytes } from 'node:crypto';
import { readConfig } from '../../src/library/config.mjs';
import { readIndex } from '../../src/library/index.mjs';
import { appendEvent, replayLedger } from '../../src/library/ledger.mjs';
import { makeContext } from '../fetch/context.mjs';
import { createUsageCounter } from '../../src/connect/usage.mjs';
import { readChanges } from '../proposals/changes.mjs';
import { cfgOf, pipelineFrom } from './config.mjs';
import { nextStep } from './queue.mjs';
import { listRejected } from './decide.mjs';
import { estimateFirstRound } from './estimate.mjs';
import { relatedEntries } from './related.mjs';
import { runGate, gapConnector } from './score.mjs';
import { runSummary } from './summarize.mjs';
import { selfCheck, materialFor, libraryTopics, topicOf } from './round.mjs';

// the changes.jsonl fields that are the 评分标准 (the cfg of a scoring step: config.mjs cfgOf)
export const STANDARD_FIELDS = Object.freeze(['brief', 'thresholds', 'prompts']);

/** Redesign R5b: the newest change of the 评分标准 — { at, field } (field one of STANDARD_FIELDS), or { at: null, field: null }. */
export function standardChange(libraryDir) {
  let at = null;
  let field = null;
  for (const e of readChanges(libraryDir).entries) {
    if (STANDARD_FIELDS.includes(e.field) && typeof e.at === 'string' && (at === null || e.at >= at)) { at = e.at; field = e.field; }
  }
  return { at, field };
}

export function standardChangedAt(libraryDir) {
  return standardChange(libraryDir).at;
}

export function rescoreInfo(libraryDir, { limit = 50 } = {}) {
  const old = listRejected(libraryDir, { limit, onlyOld: true });
  const cfg = pipelineFrom(readConfig(libraryDir).config ?? {});
  const expectedCalls = old.total === 0 ? [0, 0] : estimateFirstRound({ items: old.total, cap: cfg.cap }).expectedCalls;
  const change = standardChange(libraryDir);
  return { total: old.total, items: old.items, changedAt: change.at, changedField: change.field, expectedCalls, cap: cfg.cap };
}

export async function rescoreRejected(libraryDir, { connector, cap, ctx, signal, onProgress, now } = {}) {
  const c = makeContext(ctx ?? (typeof now === 'function' ? { now } : {}));
  const targets = listRejected(libraryDir, { limit: Number.MAX_SAFE_INTEGER, onlyOld: true }).items.map((i) => i.url);
  const check = await selfCheck(libraryDir, { connector });
  if (!check.ok) return { ok: false, started: false, rescore: true, problems: check.problems, warnings: check.warnings };

  const config = readConfig(libraryDir).config;
  const cfg = pipelineFrom(config);
  const limit = Number.isInteger(cap) && cap >= 0 ? cap : cfg.cap;
  const id = `rescore-${c.now().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
  const index = readIndex(libraryDir);
  const usage = createUsageCounter(libraryDir, { now: c.now });
  const spaced = gapConnector(connector, { sleep: c.sleep, callGapMs: cfg.callGapMs });
  const counts = { rescored: 0, inbox: 0, below: 0, unscored: 0, partial: 0 };
  const callsBy = { selfCheck: check.probe?.calls ?? 1, gates: {}, summary: 0, verify: 0 };
  const problems = [];
  let calls = 0;
  let stoppedAt;
  const count = (r, part) => {
    const all = Number.isFinite(r.calls) ? r.calls : 0;
    const judged = Number.isFinite(r.judgeCalls) ? r.judgeCalls : 0;
    calls += all;
    callsBy.verify += judged;
    if (part === 'summary') callsBy.summary += all - judged;
    else callsBy.gates[part] = (callsBy.gates[part] ?? 0) + all - judged;
  };
  const stopNow = () => {
    if (signal?.aborted) { stoppedAt = 'aborted'; return true; }
    if (calls >= limit) { stoppedAt = 'cap'; return true; }
    return false;
  };
  const progress = (node, url) => {
    if (typeof onProgress === 'function') onProgress({ round: id, stage: node === 'summary' ? 'summary' : 'gate', node, url, calls, counts });
  };
  const summaries = new Map();

  outer: for (const url of targets) {
    let touched = false;
    for (;;) {
      const state = replayLedger(libraryDir).states.get(url);
      // a step judged again under the new standard is not old any more: only the old verdicts are done again
      const step = nextStep(state, cfg, { rescore: true });
      if (step.kind === 'done') {
        if (touched) {
          counts.rescored += 1;
          if (step.why === 'inbox') counts.inbox += 1;
          else if (step.why.startsWith('below:')) counts.below += 1;
          else if (step.why.startsWith('stuck:')) counts.unscored += 1;
        }
        break;
      }
      // precheck fix 9: stopped in the middle of this item (a step done again, the next one not): counted, not lost
      if (stopNow()) { if (touched) counts.partial += 1; break outer; }
      const node = step.node;
      const mat = await materialFor({ libraryDir, cfg, node, state, ctx: c, summaries });
      const sourceTopic = topicOf(config, state.source);
      const related = relatedEntries(index, mat.item, { topic: sourceTopic });
      const common = { libraryDir, cfg, node, item: mat.item, body: mat.body, materials: mat.materials, related, topics: libraryTopics(config), sourceTopic, round: id, now: c.now };
      const part = step.kind === 'summary' ? 'summary' : node.id;
      const r = step.kind === 'summary'
        ? await runSummary({ ...common, state, connector: usage.wrap(spaced, 'rescore:summary') })
        : await runGate({ ...common, connector: usage.wrap(spaced, `rescore:gate:${node.id}`) });
      count(r, part);
      touched = true;
      if (r.status === 'connection') {
        stoppedAt = 'connection';
        counts.partial += 1;
        problems.push({ code: 'connection', connectionCode: r.code, detail: r.detail ?? r.code, node: node.id, url });
        appendEvent(libraryDir, { ts: c.now().toISOString(), ev: 'unscored', url, node: node.id, reason: `connection:${r.code}`, cfg: cfgOf(node), round: id });
        break outer;
      }
      // a step that came back unscored (a format the checks refused twice) is the end of this item for now
      if (r.status === 'unscored') { counts.rescored += 1; counts.unscored += 1; progress(node.id, url); break; }
      progress(part, url);
    }
  }
  const remaining = listRejected(libraryDir, { limit: 0, onlyOld: true }).total;
  return { ok: true, started: true, rescore: true, id, calls, callsBy, targets: targets.length, counts, remaining, ...(stoppedAt ? { stoppedAt } : {}), problems, warnings: check.warnings };
}
