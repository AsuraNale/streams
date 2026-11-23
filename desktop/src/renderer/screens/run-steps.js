// A library's run — redesign R2 (P07, F19 · N06; 07-模板版 「运行与排队」), 1.1 (W7a, W7b): an update is one agent run, so one step.
//   RunSteps   the run of this library in progress: 「本次运行 · 今天 20:56 开始 · 手动触发」 with 停止, the template's progress-line
//              (one step: 读来源、存原文，更新 Agent 按建库卡挑选、写摘要), its caption and the step-line. Where it is comes from the
//              app's queue (getQueue's running: why, startedAt, phase; round-progress moves the phase) — the same place the head's
//              button, the sidebar's line and the right panel read.
//              html`<${RunSteps} running=${queue.data.running} />`
//   LastRun    the last run of a library in one line — when it ended and how many it put into 待看 (getHome().lastRound, the run
//              record as the main process gives it: the page computes no number), or that it has not run yet. `here`: the right
//              panel's wording, which names the library.
//              html`<${LastRun} record=${home.data.lastRound} />`
// Why it started: texts/panel.js QUEUE.why (创建库后的首次运行 · 手动触发 · 定时 · 补跑). Words: texts/run.js RUN.
// Test hooks: [data-part="run-steps"][data-why][data-phase], [data-step=<id>][data-done][data-now], [data-action="cancel-run"];
// [data-part="last-run"][data-state=ready|none][data-round][data-added][data-complete].
import { html, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt, whenText } from '../lib/format.js'
import { doingOf } from '../lib/queue.js'
import { TIcon } from '../lib/template-icons.js'
import { WHEN } from '../texts/common.js'
import { QUEUE } from '../texts/panel.js'
import { RUN as T } from '../texts/run.js'

/** 1.1 W7a: an update of a library by its card is one agent run — one step. */
export const UPDATE_STEPS = Object.freeze(['update'])

/** Where a run is: the index of its current step (a phase of round-progress); 'done' is past the last one. */
export function stepOf(phase) {
  return phase === 'done' ? UPDATE_STEPS.length : 0
}

export function RunSteps({ running }) {
  const [stopping, setStopping] = useState(false)
  const now = stepOf(running?.phase)
  const steps = UPDATE_STEPS
  const stop = async () => {
    setStopping(true)
    try { await call('cancelRound') } catch { setStopping(false) }
  }
  const head = fmt(T.current, { when: whenText(running?.startedAt, WHEN) ?? '', why: doingOf(running?.why, QUEUE.why) })
  return html`<section class="st-run-steps" data-part="run-steps" data-why=${running?.why ?? ''} data-phase=${running?.phase ?? ''}>
    <div class="section-label"><span>${head}</span>
      <span class="st-act" data-action="cancel-run"><button type="button" disabled=${stopping} onClick=${stop}><${TIcon} name="stop" /> ${stopping ? T.stopping : T.stop}</button></span>
    </div>
    <div class="progress-line" aria-hidden="true">${steps.map((id, i) => html`<span key=${id} class=${i < now ? 'done' : i === now ? 'now' : ''}></span>`)}</div>
    <div class="progress-caption"><span>${fmt(T.stepsDone, { done: Math.min(now, steps.length), total: steps.length })}</span><span>${fmt(T.stepNow, { step: T.steps[steps[Math.min(now, steps.length - 1)]] })}</span></div>
    ${steps.map((id, i) => html`<div key=${id} class="step-line" data-step=${id} data-done=${String(i < now)} data-now=${String(i === now)}>
      <${TIcon} name=${i < now ? 'check' : 'clock'} /><span>${T.steps[id]}</span>
    </div>`)}
  </section>`
}

/** A run record that did not finish (cancelled, stopped; v1.0's stoppedAt). */
const unfinished = r => r?.status === 'cancelled' || r?.status === 'stopped' || Boolean(r?.stoppedAt)

/** The last run in one line: when it ended and how many it put into 待看 (the run record's counts.inbox). */
export function LastRun({ record, here = false }) {
  if (!record) return html`<p class="limit-note" data-part="last-run" data-state="none">${here ? T.lastHereNone : T.none}</p>`
  const added = Number.isInteger(record.counts?.inbox) ? record.counts.inbox : 0
  const when = whenText(record.finishedAt ?? record.startedAt, WHEN) ?? ''
  const stopped = unfinished(record)
  const words = here ? (stopped ? T.lastHereStopped : T.lastHere) : stopped ? T.lastStopped : T.last
  return html`<p class="limit-note" data-part="last-run" data-state="ready" data-round=${record.id ?? ''} data-added=${added} data-complete=${String(!stopped)}>${fmt(words, { when, n: added })}</p>`
}
