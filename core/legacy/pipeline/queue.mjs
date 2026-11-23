// The work queue is rebuilt from the ledger (replayLedger), never from what this round fetched
// (toolkit pipeline-discipline.md rule 2; core-api 4.1). An interrupted round reappears next time.
//
// nextStep(state, cfg, { rescore? }) -> { kind: 'gate', node } | { kind: 'summary', node } | { kind: 'done', why }
//   why: 'terminal' (kept / dismissed) | 'inbox' | 'below:<gateId>' | 'stuck:<gateId>' (unscored under the
//   current cfg: the same url, gate and cfg are never called twice; a config change (new cfg) reopens it).
//   An unscored whose reason is connection:<code> is not a verdict on the item (no answer came back), so it
//   is retried next run.
//   Redesign R5a (N07, 维护者 11-12 第 5 条): a VERDICT (a `scored` event) made under another cfg of that gate — the
//   评分标准 changed since: the 追踪要求, the threshold / 严格程度, the prompt or the material — is no longer redone by the
//   next run: it stands where it was, judged against the threshold it was given then (gateResult `old: true`). Only
//   rescore (rescore.mjs, the user's 重新评分) passes { rescore: true }, which makes such an old verdict to do again.
//   Items not scored yet are scored under the new standard as before; a non-verdict (unscored, connection) is retried.
// gateResult(state, node, { rescore?, later? }) -> { status: 'scored', score, passed, old } | { status: 'unscored', reason } | { status: 'todo' }
//   later: the ids of the steps after this one in the pipeline (nextStep gives them) — what an old verdict's place is read from
// verdictThreshold(scored, stamp, node) -> the threshold an old verdict was judged against, or null when it cannot be worked out:
//   the one its event carries (scored events carry `threshold` since R5a), else the one whose cfg hash is the stamp (the node
//   as it is now with another threshold, with or without its brief: the libraries of before R5a).
// oldVerdictPassed(state, node, later) -> whether an old verdict passed WHEN IT WAS MADE. With a threshold worked out: the
//   score against it. Without one (precheck fix 4: a verdict of before R5a whose step's prompt or material changed as well,
//   so its stamp gives no threshold) the ledger's own record of where the item went: a later step of the pipeline has a score
//   or an unscored of it → it passed this one; none → it stopped here (未通过筛选). It is never judged against the threshold of
//   now (that moved old verdicts over a loosened 严格程度 into the next step, and the next run called the model for them).
//   An item that passed this step under the old standard and whose next step never ran (the run stopped at its cap) has no
//   such record: it is then in 未通过筛选 as an old one, and 重新评分 scores it again — no call is made for it by itself.
// buildQueue(libraryDir, cfg) -> { byNode: { [nodeId]: [state, …] }, summary: [state, …], states }
//   byNode lists the states waiting at each gate, in ledger order (first seen first).
import { replayLedger } from '../../src/library/ledger.mjs';
import { TERMINAL_STAGES } from '../../src/library/ledger.mjs';
import { cfgOf, gateNodes, summaryNode } from './config.mjs';

export function isConnection(reason) {
  return typeof reason === 'string' && reason.startsWith('connection:');
}

// stamp + the node's other cfg fields → the threshold whose hash it is (or null): the verdicts of before R5a carry no threshold
const inferred = new Map();
function thresholdOfStamp(stamp, node) {
  if (typeof stamp !== 'string' || stamp === '') return null;
  const key = JSON.stringify([stamp, node.requirement, node.material, node.output, node.brief ?? null]);
  if (inferred.has(key)) return inferred.get(key);
  let found = null;
  const candidates = [node.threshold, ...Array.from({ length: 101 }, (_, i) => i / 100)];
  outer: for (const t of candidates) {
    for (const n of [{ ...node, threshold: t }, { ...node, threshold: t, brief: undefined }]) {
      if (cfgOf(n) === stamp) { found = t; break outer; }
    }
  }
  if (inferred.size > 5000) inferred.clear();
  inferred.set(key, found);
  return found;
}

export function verdictThreshold(scored, stamp, node) {
  if (typeof scored?.threshold === 'number') return scored.threshold;
  return thresholdOfStamp(stamp, node);
}

export function oldVerdictPassed(state, node, later = []) {
  const scored = state?.scores?.[node.id];
  const threshold = verdictThreshold(scored, state?.cfg?.[node.id], node);
  if (typeof threshold === 'number') return scored.score >= threshold;
  return later.some((id) => state?.scores?.[id] !== undefined || state?.unscored?.[id] !== undefined);
}

// the ids of the steps after gate i: the later gates, then the summary
export function laterSteps(cfg, i) {
  const gates = gateNodes(cfg);
  const summary = summaryNode(cfg);
  return [...gates.slice(i + 1).map((n) => n.id), ...(summary ? [summary.id] : [])];
}

export function gateResult(state, node, { rescore = false, later = [] } = {}) {
  const cfg = cfgOf(node);
  const stamp = state.cfg?.[node.id];
  const scored = state.scores?.[node.id];
  if (scored && typeof scored.score === 'number' && stamp === cfg) return { status: 'scored', score: scored.score, passed: scored.score >= node.threshold, old: false };
  // redesign R5a: a verdict under another standard stands where it was (unless the user asked to score it again)
  if (scored && typeof scored.score === 'number' && !rescore) return { status: 'scored', score: scored.score, passed: oldVerdictPassed(state, node, later), old: true };
  if (state.unscored?.[node.id] !== undefined && stamp === cfg && !isConnection(state.unscored[node.id])) return { status: 'unscored', reason: state.unscored[node.id] };
  return { status: 'todo' };
}

export function nextStep(state, cfg, { rescore = false } = {}) {
  if (!state || TERMINAL_STAGES.includes(state.stage)) return { kind: 'done', why: 'terminal' };
  if (state.stage === 'inbox') return { kind: 'done', why: 'inbox' };
  for (const [i, node] of gateNodes(cfg).entries()) {
    const r = gateResult(state, node, { rescore, later: laterSteps(cfg, i) });
    if (r.status === 'todo') return { kind: 'gate', node };
    if (r.status === 'unscored') return { kind: 'done', why: `stuck:${node.id}` };
    if (!r.passed) return { kind: 'done', why: `below:${node.id}`, ...(r.old ? { old: true } : {}) };
  }
  const summary = summaryNode(cfg);
  if (!summary) return { kind: 'done', why: 'no-summary-node' };
  const stuck = state.unscored?.[summary.id] !== undefined && state.cfg?.[summary.id] === cfgOf(summary) && !isConnection(state.unscored[summary.id]);
  if (stuck) return { kind: 'done', why: `stuck:${summary.id}` };
  return { kind: 'summary', node: summary };
}

export function buildQueue(libraryDir, cfg) {
  const { states } = replayLedger(libraryDir);
  const byNode = Object.fromEntries(gateNodes(cfg).map((n) => [n.id, []]));
  const summary = [];
  for (const s of states.values()) {
    const step = nextStep(s, cfg);
    if (step.kind === 'gate') byNode[step.node.id].push(s);
    else if (step.kind === 'summary') summary.push(s);
  }
  return { byNode, summary, states };
}
