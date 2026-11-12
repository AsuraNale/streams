// A run of this library in progress — redesign R2 (P07, F19 · N06; 07-模板版 「运行与排队」): 「本次运行 · 今天 20:56 开始 · 手动触发」
// with 停止, the template's progress-line (six steps: 运行前自检 · 抓取 n 个来源 · 去重 · 相关度评分 · 实质评分 · 摘要与核验), its
// caption (「1 / 6 个环节已完成」 · 「当前步骤：抓取」) and one step-line per step, the ones done ticked. Where it is comes from the
// app's queue (getQueue's running: why, startedAt, phase; round-progress moves the phase) — the same place the head's button,
// the sidebar's line and the right panel read.
//   html`<${RunSteps} running=${queue.data.running} sources=${row.sources} />`
// Why it started: texts/panel.js QUEUE.why (建库后的第一轮 · 手动触发 · 定时 · 补跑). Words: texts/run.js RUN.
// Test hooks: [data-part="run-steps"][data-why][data-phase], [data-step=<id>][data-done][data-now], [data-action="cancel-run"].
import { html, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt, whenText } from '../lib/format.js'
import { doingOf } from '../lib/queue.js'
import { TIcon } from '../lib/template-icons.js'
import { NODE_NAMES, WHEN } from '../texts/common.js'
import { QUEUE } from '../texts/panel.js'
import { RUN as T } from '../texts/run.js'

const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)
/** The six steps of a run, in order (the default pipeline's two gates). */
export const RUN_STEPS = Object.freeze(['self-check', 'fetch', 'dedup', 'gate:relevance', 'gate:substance', 'summary'])

/** Where a run is: the index of its current step (a phase of round-progress); dedup is done once a gate has begun. */
export function stepOf(phase) {
  if (typeof phase !== 'string' || phase === '') return 0
  const at = RUN_STEPS.indexOf(phase)
  if (at >= 0) return at
  if (phase.startsWith('gate:')) return 3
  if (phase === 'done') return RUN_STEPS.length
  return 0
}

function stepWords(id, sources) {
  if (id === 'fetch') return fmt(T.steps.fetch, { n: sources ?? 0 })
  if (id.startsWith('gate:')) return fmt(T.steps.gate, { name: nodeName(id.slice(5)) })
  return T.steps[id]
}

export function RunSteps({ running, sources }) {
  const [stopping, setStopping] = useState(false)
  const now = stepOf(running?.phase)
  const stop = async () => {
    setStopping(true)
    try { await call('cancelRound') } catch { setStopping(false) }
  }
  const head = fmt(T.current, { when: whenText(running?.startedAt, WHEN) ?? '', why: doingOf(running?.why, QUEUE.why) })
  return html`<section class="st-run-steps" data-part="run-steps" data-why=${running?.why ?? ''} data-phase=${running?.phase ?? ''}>
    <div class="section-label"><span>${head}</span>
      <span class="st-act" data-action="cancel-run"><button type="button" disabled=${stopping} onClick=${stop}><${TIcon} name="stop" /> ${stopping ? T.stopping : T.stop}</button></span>
    </div>
    <div class="progress-line" aria-hidden="true">${RUN_STEPS.map((id, i) => html`<span key=${id} class=${i < now ? 'done' : i === now ? 'now' : ''}></span>`)}</div>
    <div class="progress-caption"><span>${fmt(T.stepsDone, { done: Math.min(now, RUN_STEPS.length), total: RUN_STEPS.length })}</span><span>${fmt(T.stepNow, { step: stepWords(RUN_STEPS[Math.min(now, RUN_STEPS.length - 1)], sources) })}</span></div>
    ${RUN_STEPS.map((id, i) => html`<div key=${id} class="step-line" data-step=${id} data-done=${String(i < now)} data-now=${String(i === now)}>
      <${TIcon} name=${i < now ? 'check' : 'clock'} /><span>${stepWords(id, sources)}</span>
    </div>`)}
  </section>`
}
