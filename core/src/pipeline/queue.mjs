// The work queue is rebuilt from the ledger (replayLedger), never from what this round fetched
// (toolkit pipeline-discipline.md rule 2; core-api 4.1). An interrupted round reappears next time.
//
// nextStep(state, cfg) -> { kind: 'gate', node } | { kind: 'summary', node } | { kind: 'done', why }
//   why: 'terminal' (kept / dismissed) | 'inbox' | 'below:<gateId>' | 'stuck:<gateId>' (unscored under the
//   current cfg: the same url, gate and cfg are never called twice; a config change (new cfg) reopens it).
//   An unscored whose reason is connection:<code> is not a verdict on the item (no answer came back), so it
//   is retried next round.
// buildQueue(libraryDir, cfg) -> { byNode: { [nodeId]: [state, …] }, summary: [state, …], states }
//   byNode lists the states waiting at each gate, in ledger order (first seen first).
import { replayLedger } from '../library/ledger.mjs';
import { TERMINAL_STAGES } from '../library/ledger.mjs';
import { cfgOf, gateNodes, summaryNode } from './config.mjs';

export function isConnection(reason) {
  return typeof reason === 'string' && reason.startsWith('connection:');
}

export function gateResult(state, node) {
  const cfg = cfgOf(node);
  const stamp = state.cfg?.[node.id];
  const scored = state.scores?.[node.id];
  if (scored && typeof scored.score === 'number' && stamp === cfg) return { status: 'scored', score: scored.score, passed: scored.score >= node.threshold };
  if (state.unscored?.[node.id] !== undefined && stamp === cfg && !isConnection(state.unscored[node.id])) return { status: 'unscored', reason: state.unscored[node.id] };
  return { status: 'todo' };
}

export function nextStep(state, cfg) {
  if (!state || TERMINAL_STAGES.includes(state.stage)) return { kind: 'done', why: 'terminal' };
  if (state.stage === 'inbox') return { kind: 'done', why: 'inbox' };
  for (const node of gateNodes(cfg)) {
    const r = gateResult(state, node);
    if (r.status === 'todo') return { kind: 'gate', node };
    if (r.status === 'unscored') return { kind: 'done', why: `stuck:${node.id}` };
    if (!r.passed) return { kind: 'done', why: `below:${node.id}` };
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
