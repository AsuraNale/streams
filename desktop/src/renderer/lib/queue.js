// v2 package L: the one queue of the rounds, as the page reads it (getQueue; docs/desktop.md §4.4).
//   useQueue(enabled)           → { status, data: { running, waiting, next } | null, reload } — read again on `queue-changed`
//                                 and at the end of a round; while a round runs, its phase and calls follow `round-progress`
//                                 (no read per step)
//   queueStateOf(queue, id)     → where a library is: { state: 'running' } · { state: 'queued', position } · null
//   queueWords(state, phase)   → that place in words (texts/panel.js QUEUE): 运行中 · <当前环节> (phase: a round-progress
//                                 phase, lib/phase.js phaseWords) / 运行中 / 排队中 · 第 n 位, or null
//   doingOf(why, table)         → why a round runs / waits in words (texts/panel.js QUEUE.why); 'manual' when not known
import { call } from './bridge.js'
import { useEvent } from './use-events.js'
import { useLoad } from './use-load.js'
import { fmt } from './format.js'
import { QUEUE } from '../texts/panel.js'
import { phaseWords } from './phase.js'

/** A library's place in words (the sidebar, 库架, the panel): 运行中 · <当前环节> · 排队中 · 第 n 位, or null. */
export function queueWords(state, phase = null) {
  if (!state) return null
  if (state.state !== 'running') return fmt(QUEUE.queued, { n: state.position })
  const p = phaseWords(phase)
  return p ? fmt(QUEUE.runningPhase, { phase: p }) : QUEUE.running
}

export function queueStateOf(queue, id) {
  if (!queue || !id) return null
  if (queue.running?.libraryId === id) return { state: 'running' }
  const at = Array.isArray(queue.waiting) ? queue.waiting.findIndex(w => w.libraryId === id) : -1
  if (at < 0) return null
  return { state: 'queued', position: at + 1 + (queue.running ? 1 : 0) }
}

export function doingOf(why, table) {
  return Object.hasOwn(table, why ?? '') ? table[why] : table.manual
}

export function useQueue(enabled) {
  const q = useLoad(() => (enabled ? call('getQueue') : null), [enabled])
  useEvent('queue-changed', () => { if (enabled) q.reload() }, [enabled])
  useEvent('round-progress', p => {
    if (!enabled || !p || typeof p !== 'object') return
    if (p.done === true) { q.reload(); return }
    // the round that runs moved on: its phase and calls, without a read
    q.mutate(d => {
      if (!d?.running) return d
      const same = d.running.roundId === p.roundId || (d.running.roundId === null && d.running.libraryId === p.libraryId)
      return same ? { ...d, running: { ...d.running, roundId: p.roundId ?? d.running.roundId, phase: p.phase ?? d.running.phase, calls: p.calls ?? d.running.calls, cap: p.cap ?? d.running.cap, live: p.live ?? d.running.live ?? null } } : d
    })
  }, [enabled])
  return q
}
