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
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { useApp } from '../lib/app-context.js'
import { fmt, whenText } from '../lib/format.js'
import { doingOf } from '../lib/queue.js'
import { TIcon } from '../lib/template-icons.js'
import { WHEN } from '../texts/common.js'
import { QUEUE } from '../texts/panel.js'
import { RUN as T } from '../texts/run.js'
import { UPDATE_NOTE as N } from '../texts/inbox.js'

/**
 * 1.1.1 P10 (A8): an update's four steps — read the sources, fetch the new pages' originals, the update agent picks and writes,
 * the check — each with its numbers from the core's snapshot (round-progress's live; getQueue's running.live). No number moves
 * without an event: before the first one the steps show no numbers.
 */
export const UPDATE_STEPS = Object.freeze(['sources', 'originals', 'agent', 'check'])

/** Where a run is: the index of its current step; 'done' is past the last one. */
export function stepOf(phase, live = null) {
  if (phase === 'done') return UPDATE_STEPS.length
  const i = UPDATE_STEPS.indexOf(live?.step)
  return i < 0 ? 0 : i
}

/** A step's numbers in words ('' when the snapshot has none for it yet). */
export function stepNumbers(id, live) {
  if (!live || typeof live !== 'object') return ''
  const reached = UPDATE_STEPS.indexOf(live.step) >= UPDATE_STEPS.indexOf(id)
  if (id === 'sources' && live.sources?.total) return fmt(T.live.sources, live.sources)
  if (id === 'originals' && live.originals?.total) return fmt(T.live.originals, live.originals)
  if (id === 'agent' && reached) return fmt(T.live.agent, live.agent ?? { searches: 0, reads: 0 })
  if (id === 'check' && live.check?.total) return fmt(T.live.check, live.check)
  return ''
}

/** How long an update of this library usually takes: its last one's time, or (the first) the measured range. */
export function usuallyWords(last) {
  const a = Date.parse(last?.startedAt ?? '')
  const b = Date.parse(last?.finishedAt ?? '')
  if (last?.kind === 'update' && Number.isFinite(a) && Number.isFinite(b) && b > a) return fmt(T.usuallyLast, { min: Math.max(1, Math.round((b - a) / 60_000)) })
  return T.usuallyFirst
}

export function RunSteps({ running, last = null }) {
  const [stopping, setStopping] = useState(false)
  // 1.1.1 B26: an API key connection with no search — this update reads pages only, and says so
  const appState = useApp()?.appState
  const noSearch = appState?.data?.activeConnection === 'api' && appState?.data?.activeCanSearch === false
  const live = running?.live ?? null
  const now = stepOf(running?.phase, live)
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
    ${steps.map((id, i) => {
      const nums = stepNumbers(id, live)
      return html`<div key=${id} class="step-line" data-step=${id} data-done=${String(i < now)} data-now=${String(i === now)} data-count=${nums}>
        ${i === now ? html`<span class="st-mo-breathe" data-mo="steps" aria-hidden="true"></span>` : html`<${TIcon} name=${i < now ? 'check' : 'clock'} />`}<span>${T.steps[id]}${nums ? html`<small key=${nums} class="muted" data-part="step-count"> · ${nums}</small>` : null}</span>
      </div>`
    })}
    ${noSearch ? html`<p class="limit-note" data-part="run-no-search">${T.noSearch}</p>` : null}
    <p class="limit-note" data-part="run-usually">${usuallyWords(last)}</p>
  </section>`
}

/**
 * 1.1.1 P11b (A13): the last update in one block at the top of 待看 — how many sources it read, how many could not be read, how
 * many it put into 待看; and, folded, what the update agent left (its 「卡上哪里不够用」, the record's agent.gaps), each with
 * 「拿这条去改卡」 (onToCard(text): the card's conversation with that sentence in its box, nothing sent). Shown when 待看 is
 * empty too: an empty 待看 after a run that could not read is not 「nothing new」. Only an update's record (kind 'update').
 * Test hooks: [data-part="update-note"][data-status][data-read][data-unreadable][data-added], [data-action="update-notes"],
 * [data-update-gap=<i>], [data-action="gap-to-card"].
 */
const COUNT_UP_MS = 360
/** n, counted up from 0 over COUNT_UP_MS when `id` changes after the first render (a new record); n at once otherwise. */
function useCountUp(n, id) {
  const first = useRef(id)
  const [v, setV] = useState(n)
  useEffect(() => {
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (id === first.current || still || n <= 0 || typeof requestAnimationFrame !== 'function') { setV(n); return undefined }
    first.current = id
    const t0 = Date.now()
    let raf = 0
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / COUNT_UP_MS)
      setV(Math.round(n * k))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    setV(0)
    raf = requestAnimationFrame(step)
    // a hidden window draws no frames: the number is right when the time is up whatever happened to the frames
    const done = setTimeout(() => setV(n), COUNT_UP_MS + 50)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [n, id])
  return v
}

export function UpdateNote({ record, onToCard }) {
  const [open, setOpen] = useState(false)
  const c = record?.counts ?? {}
  // 1.1.1 P14 (M12): a run that ended while the page is open — its 「新增 n 条」 counts up from 0 (once; the first record seen does not)
  const shown = useCountUp(Number.isInteger(c.inbox) ? c.inbox : 0, record?.id ?? null)
  if (!record || record.kind !== 'update') return null
  const when = whenText(record.finishedAt ?? record.startedAt, WHEN) ?? ''
  const gaps = (Array.isArray(record.agent?.gaps) ? record.agent.gaps : []).map(g => (typeof g === 'string' ? g : typeof g?.text === 'string' ? g.text : '')).filter(g => g.trim() !== '')
  const read = Number.isInteger(c.read) ? c.read : 0
  const bad = Number.isInteger(c.unreadable) ? c.unreadable : 0
  const added = Number.isInteger(c.inbox) ? c.inbox : 0
  const line = record.status === 'nothing-new' ? fmt(N.nothingNew, { when })
    : record.status === 'done' ? fmt(N.line, { when, read, n: shown, bad: bad > 0 ? fmt(N.bad, { n: bad }) : '' })
      : fmt(N.failed, { when })
  return html`<section class="panel-section st-update-note" data-part="update-note" data-status=${record.status ?? ''} data-read=${read} data-unreadable=${bad} data-added=${added}>
    <div class="section-label"><span>${line}</span>
      ${gaps.length ? html`<span class="st-act" data-action="update-notes"><button type="button" class="btn quiet" aria-expanded=${String(open)} onClick=${() => setOpen(o => !o)}>${open ? N.hide : fmt(N.notes, { n: gaps.length })}</button></span>` : null}
    </div>
    ${open ? html`<ul class="st-update-gaps">${gaps.map((g, i) => html`<li key=${i} data-update-gap=${i}><span>${g}</span>
      <span class="st-act" data-action="gap-to-card"><button type="button" class="btn quiet" onClick=${() => onToCard?.(g)}>${N.toCard}</button></span></li>`)}</ul>` : null}
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
