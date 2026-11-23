// A run's phase (round-progress events, getQueue's running.phase) in words: 更新 · 已完成 (texts/common.js ROUND_PHASES).
// Redesign R1: one place for it (the right panel, the sidebar's line, the head's chip).
import { ROUND_PHASES } from '../texts/common.js'

/** '' for anything that is not a phase name. */
export function phaseWords(phase) {
  if (typeof phase !== 'string' || phase === '') return ''
  return Object.hasOwn(ROUND_PHASES, phase) ? ROUND_PHASES[phase] : phase
}
