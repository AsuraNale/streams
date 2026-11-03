// The engine's three invariants (product spec 4.11 end; core-api 4.2), written as checks:
//   ① stage -> allowed actions   seen: only the first open gate; a gate passed -> body / next gate;
//                                all gates passed -> summary; inbox -> keep / dismiss / later;
//                                kept / dismissed -> nothing
//   ② the precondition is read from the real ledger state the caller passes in (replayLedger), never
//      from this round's memory: callers replay before they act
//   ③ the same action with the same parameters is not done twice: a gate already scored (or unscored)
//      under the current cfg is not an allowed action any more
//
// allowedActions(state, config) -> string[]         'gate:<id>' | 'body' | 'summary' | 'keep' | 'dismiss' | 'later'
// assertAllowed(state, action, config) -> true      throws not-allowed
import { StreamsError } from '../errors.mjs';
import { TERMINAL_STAGES } from '../library/ledger.mjs';
import { DEFAULT_PIPELINE, gateNodes, summaryNode } from './config.mjs';
import { gateResult, nextStep } from './queue.mjs';

export const DECISIONS = ['keep', 'dismiss', 'later'];

export function allowedActions(state, config = DEFAULT_PIPELINE()) {
  if (!state || typeof state !== 'object') return [];
  if (TERMINAL_STAGES.includes(state.stage)) return [];
  if (state.stage === 'inbox') return [...DECISIONS];
  const gates = gateNodes(config);
  for (let i = 0; i < gates.length; i++) {
    const r = gateResult(state, gates[i]);
    if (r.status === 'todo') {
      const out = [];
      if (gates[i].material === 'body') out.push('body');
      out.push(`gate:${gates[i].id}`);
      return out;
    }
    if (r.status === 'unscored' || !r.passed) return [];
  }
  const summary = summaryNode(config);
  if (!summary) return [];
  return nextStep(state, config).kind === 'summary' ? ['summary'] : [];
}

export function assertAllowed(state, action, config = DEFAULT_PIPELINE()) {
  if (typeof action !== 'string' || action === '') throw new StreamsError('not-allowed', 'action is required');
  const allowed = allowedActions(state, config);
  if (!allowed.includes(action)) {
    throw new StreamsError('not-allowed', `"${action}" is not allowed at stage "${state?.stage ?? 'unknown'}" (allowed: ${allowed.join(', ') || 'nothing'})`, { allowed, stage: state?.stage ?? null });
  }
  return true;
}
