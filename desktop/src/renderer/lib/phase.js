// A round's phase (round-progress events, getQueue's running.phase) in words: 运行前自检 · 抓取 · 评分 · 相关度 … (texts/common.js
// ROUND_PHASES and NODE_NAMES). Redesign R1: one place for it (the right panel, the sidebar's line, the last-run part).
import { NODE_NAMES, ROUND_PHASES, SEP } from '../texts/common.js'

const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)

/** '' for anything that is not a phase name. */
export function phaseWords(phase) {
  if (typeof phase !== 'string' || phase === '') return ''
  if (phase.startsWith('gate:')) return `${ROUND_PHASES.gate}${SEP}${nodeName(phase.slice(5))}`
  return Object.hasOwn(ROUND_PHASES, phase) ? ROUND_PHASES[phase] : phase
}
