// A library's page — redesign R1 (design 07-模板版 「待看」, F13, N06): the template's work area —
//   the head (`header.work-header`: the library's name, one line of what it is — 追踪范围 · n 个来源 · n 个主题 — the screen's own
//   actions, the status chip 「下次运行 … · 预计 a–b 次模型调用」 and the run button), the four tabs (kit/library-sections.js), the
//   banner of a run that could not start (the problem card, V6: on top of every tab), then the screen itself (Main inner:
//   data-screen / data-state, as every screen). The window's right panel (screens/right-panel.js) is the frame's third column.
//   html`<${LibraryFrame} tab="inbox" state=${state} labelledby="inbox-title" actions=${…} detail=${…}>
//     <${TopBar} title=… titleTag="h2" … />  <div class="st-main__body …">…</div>
//   <//>`
// `screen` (default `tab`) is the Main's data-screen: 资料库's graph view is tab 'library', screen 'graph'.
// The run button is the state itself (维护者 11-11 第 6 题): 立即运行 (startRound at once — no dialog; with another library running
// or waiting the queue puts this one at the end) · 运行中 · 停止 (cancelRound) · 排队中 · 第 n 位 (not pressable). Its place comes
// from the one queue of the app context (getQueue), so the sidebar, 库架 and the panel say the same.
// What the frame remembers per library (app.js `memory`): how far the screen's body (.st-main__body) was scrolled — put back
// once the screen has its data. `section` (a route's params.section, e.g. 流水线 → 来源与要求's 关卡): the part
// [data-part=<section>] is scrolled into view once the screen has its data, instead.
// Redesign R2 (P07 · P08): while this library runs, the chip says where it is — 「运行中：抓取 · 模型调用 0 / 上限 120」 (the queue's
// running: phase, calls, cap); the banner on top of every tab is only for a run whose self-check did not pass (the codes of the
// core's selfCheck: connection · not-writable · index · config), one at most (screens/problem-card.js). The source banners and
// 「连续 n 次」 are cards of 待确认 now, never a banner here.
// Test hooks: .lib-page[data-library=<id>], header[data-part="library-head"] with h1#lib-head-name, [data-part="tracking"] and
// the screen's [data-action]s; [data-part="next-run"][data-next-run]; [data-part="run-button"][data-run-state=idle|running|queued|
// stopping][data-position] with its button; [data-part="run-error"]; the problem card [data-part="problem"] (V6).
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, nextText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { tracking } from '../lib/libraries.js'
import { queueStateOf } from '../lib/queue.js'
import { phaseWords } from '../lib/phase.js'
import { RUN } from '../texts/run.js'
import { TIcon } from '../lib/template-icons.js'
import { AppFrame, AppSidebar, LibrarySections, Main } from '../kit/index.js'
import { SHELL } from '../texts/shell.js'
import { NEXT_WHEN, SEP } from '../texts/common.js'
import { RightPanel } from './right-panel.js'
import { ProblemCard } from './problem-card.js'

const R = SHELL.head.run
// redesign R2: the self-check's problems — the only ones that make the banner
export const BANNER_CODES = Object.freeze(['connection', 'not-writable', 'index', 'config'])

/** The chip while this library runs: 运行中：<当前环节> · 模型调用 n / 上限 m (getQueue's running). */
function runningChip(running) {
  const phase = phaseWords(running?.phase) || phaseWords('self-check')
  return running?.cap ? fmt(RUN.chip, { phase, calls: running.calls ?? 0, cap: running.cap }) : fmt(RUN.chipNoCap, { phase, calls: running?.calls ?? 0 })
}

/** The chip beside the run button: 下次运行 … · 预计 a–b 次模型调用 (getHome().nextRun, estimateRound().expectedCalls). */
function runChip(home, est) {
  const next = home?.nextRun ? fmt(R.next, { when: nextText(home.nextRun, NEXT_WHEN) ?? home.nextRun }) : R.nextNone
  const c = Array.isArray(est?.expectedCalls) ? est.expectedCalls : null
  const calls = c ? (c[0] === c[1] ? fmt(R.callsOne, { n: c[0] }) : fmt(R.calls, { lo: c[0], hi: c[1] })) : null
  return calls ? `${next}${SEP}${calls}` : next
}

/** The run button: 立即运行 · 运行中 · 停止 · 排队中 · 第 n 位 (N06). */
export function RunButton({ libraryId, onAnswer }) {
  const { queue } = useApp()
  const place = queueStateOf(queue?.data ?? null, libraryId)
  // 'start' while startRound is asked (the button waits for the answer); 'stop' from 停止 until this library's run has ended
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const start = async () => {
    setBusy('start')
    setError(null)
    try {
      // the answer: started, queued at the end, already running / waiting — the queue (queue-changed) says which from now
      // on; not started at all (a sign-in that expired, no library): the problem card says why
      onAnswer?.(await call('startRound'))
      queue?.reload?.()
    } catch { setError(R.failed) } finally { setBusy(null) }
  }
  const stop = async () => {
    setBusy('stop')
    setError(null)
    try { await call('cancelRound') } catch { setError(R.stopFailed); setBusy(null) }
  }
  let state = 'idle'
  if (busy === 'stop' && place?.state === 'running') state = 'stopping'
  else if (place?.state === 'running') state = 'running'
  else if (place?.state === 'queued') state = 'queued'
  const words = state === 'running' ? R.running : state === 'stopping' ? R.stopping : state === 'queued' ? fmt(R.queued, { n: place.position }) : R.now
  const icon = state === 'running' || state === 'stopping' ? 'stop' : state === 'queued' ? 'clock' : 'arrow'
  const onClick = state === 'running' ? stop : state === 'idle' ? start : undefined
  const disabled = state === 'queued' || state === 'stopping' || busy === 'start' || !libraryId
  return html`<span class="st-run" data-part="run-button" data-run-state=${state} data-position=${place?.position ?? ''}>
    <button type="button" class=${`btn${state === 'idle' ? ' primary' : ''}`} disabled=${disabled} onClick=${onClick}><${TIcon} name=${icon} /> ${words}</button>
    ${error ? html`<span class="st-run__error" data-part="run-error" role="alert">${error}</span>` : null}
  </span>`
}

export function LibraryHead({ row, name, libraryId, actions, home, est, onAnswer }) {
  const { queue } = useApp()
  const runningHere = queue?.data?.running && queue.data.running.libraryId === libraryId ? queue.data.running : null
  const what = row ? tracking(row, SEP) : null
  const meta = [
    html`<span class="st-head__tracking" data-part="tracking">${what ? fmt(SHELL.head.tracking, { what }) : SHELL.head.trackingNone}</span>`,
    row ? html`<span>${fmt(SHELL.shelf.sources, { n: row.sources ?? 0 })}</span>` : null,
  ].filter(Boolean)
  return html`<header class="work-header lib-head" data-part="library-head">
    <div class="project-heading">
      <h1 class="lib-head__name" id="lib-head-name">${row?.name ?? name ?? ''}</h1>
      <div class="header-meta">${meta.map((m, i) => html`${i ? html`<i class="sep"></i>` : null}${m}`)}</div>
    </div>
    <div class="header-actions">
      ${actions ?? null}
      ${runningHere
        ? html`<span class="status-chip" data-part="running-chip" data-phase=${runningHere.phase ?? ''} data-calls=${runningHere.calls ?? 0} data-cap=${runningHere.cap ?? ''}><span class="dot"></span> ${runningChip(runningHere)}</span>`
        : html`<span class="status-chip" data-part="next-run" data-next-run=${home?.nextRun ?? ''}>${home ? runChip(home, est) : ''}</span>`}
      <${RunButton} libraryId=${libraryId} onAnswer=${onAnswer} />
    </div>
  </header>`
}

export function LibraryFrame({ tab, screen = tab, state, label, labelledby, actions, detail = null, section, children }) {
  const { appState, libraries, navigate, memory } = useApp()
  const current = appState?.data?.library ?? null
  const id = current?.libraryId ?? null
  const row = (libraries?.data ?? []).find(r => r.id === id) ?? null
  // the head's chip and the problem card: getHome (the next run, the problem of the last startRound) and estimateRound
  const home = useLoad(() => (id ? call('getHome') : null), [id])
  const est = useLoad(() => (id ? call('estimateRound') : null), [id])
  const reload = () => { home.reload(); est.reload() }
  useEvent('library-changed', reload, [id])
  useEvent('connections-changed', () => home.reload(), [id])
  useEvent('settings-changed', () => home.reload(), [id])
  useEvent('round-progress', p => { if (p?.done) reload() }, [id])
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    setBusy(true)
    try { await call('startRound') } catch { /* the card stays */ } finally { setBusy(false); home.reload() }
  }
  const redetect = async () => {
    setBusy(true)
    try { await call('detectConnections') } catch { /* the card stays */ } finally { setBusy(false) }
  }
  const content = useRef(null)
  const placed = useRef(false)
  const placing = useRef(false)
  const scrollKey = `${id ?? ''}:${screen}`
  // once the screen has its data: back to where it was scrolled (or to the part a route names). The parts of a screen that
  // load on their own (来源与要求's 要求 and 关卡) can still grow after that: tried again every 100 ms until the place is
  // reached and nothing in the body says data-state="loading" (3 s at most); the scrolling this causes is not remembered
  useEffect(() => {
    if (placed.current || state !== 'ready' || !content.current) return undefined
    placed.current = true
    const body = content.current.querySelector('.st-main__body')
    const top = memory?.scroll?.get(scrollKey)
    if (!body || (!section && typeof top !== 'number')) return undefined
    const target = () => {
      if (!section) return top
      const part = body.querySelector(`[data-part="${section}"]`)
      return part ? part.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop : null
    }
    let tries = 0
    let timer = null
    placing.current = true
    const put = () => {
      timer = null
      if (!body.isConnected) { placing.current = false; return }
      const want = target()
      if (want !== null) body.scrollTop = want
      const there = want !== null && Math.abs(body.scrollTop - want) <= 1 && !body.querySelector('[data-state="loading"]')
      if (there || ++tries >= 30) { placing.current = false; memory?.scroll?.set(scrollKey, body.scrollTop); return }
      timer = setTimeout(put, 100)
    }
    put()
    return () => { if (timer) clearTimeout(timer); placing.current = false }
  }, [state])
  const remember = e => {
    const t = e.target
    if (memory && !placing.current && t?.classList?.contains('st-main__body')) memory.scroll.set(scrollKey, t.scrollTop)
  }
  // redesign R2: a banner only for a self-check that did not pass (one at most)
  const problem = BANNER_CODES.includes(home.data?.problem?.code) ? home.data.problem : null
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current=${screen} />`} panel=${html`<${RightPanel} detail=${detail} />`}>
    <div class="workspace lib-page" data-library=${id ?? ''}>
      <${LibraryHead} row=${row} name=${current?.name ?? null} libraryId=${id} actions=${actions} home=${home.data} est=${est.data} onAnswer=${() => home.reload()} />
      <${LibrarySections} current=${tab} badges=${{ inbox: row?.inbox ?? null }} onSelect=${t => navigate(t)} />
      ${problem ? html`<div class="st-banner"><${ProblemCard} problem=${problem} busy=${busy} onRetry=${retry} onChange=${() => navigate('settings')} onRedetect=${redetect} /></div>` : null}
      <div class="lib-page__content" ref=${content} onScrollCapture=${remember}>
        <${Main} inner screen=${screen} state=${state} label=${label} labelledby=${labelledby}>${children}<//>
      </div>
    </div>
  <//>`
}

/** 资料库's two views (list · graph): the template's filters, the current one active (redesign R3, P09 · P10). */
export function ViewSwitch({ current, onSelect }) {
  return html`<div class="filters st-view-switch" role="group" aria-label=${SHELL.view.label} data-part="view-switch">
    ${['list', 'graph'].map(v => html`<button type="button" key=${v} class=${`filter${current === v ? ' active' : ''}`} data-mode=${v} aria-pressed=${String(current === v)} onClick=${() => { if (v !== current) onSelect(v) }}>${SHELL.view[v]}</button>`)}
  </div>`
}
