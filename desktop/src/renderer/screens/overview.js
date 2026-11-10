// 概览 (v2 package F; design P3): a library's first tab, v1.0's 今日 (mockup S2, with the card for what went wrong, S13) and
// 运行状态 (S11) on one page; 流水线's numbers of the last round are 今日's round lines. Everything of 今日 comes from getHome
// (docs/desktop.md §4.1 「今日」): the next run and the connection (in the library's head now, beside 「现在跑一轮」), the source
// banner (numbers.sources.lines, only failed / gap / blocked), the problem of the last startRound (a sign-in that expired
// included), the four numbers, the last round (lastRound: a roundLog line) or the round running now (round-progress events),
// the three most recently kept. The page computes no number. 「现在跑一轮」 opens the dialog of screens/run-dialog.js.
// The amber banner 「连续 N 轮没有产出」 (plan C8): numbers.noOutputStreak at getHome().noOutputRounds (the core's
// NO_OUTPUT_ROUNDS) or more, with where to look and a link to 「运行状态」 — the part of this page (screens/status.js RunStatus:
// getStatus' numbers and the sources of the last round). 「主 Agent 给这个库的建议」 (v2 package G; design P3, UC2 step 4): this
// library's suggestion cards (screens/suggestion-card.js LibrarySuggestions: 交给主 Agent / 不要, no switch that does it by
// itself later), or a line that there is none. Words: texts/today.js, texts/status.js, texts/shell.js, texts/agent.js.
// Test hooks: main[data-screen="overview"][data-state], [data-part=sources|no-output|problem|numbers|round|progress|recent|
// suggestions|run|next-run], [data-part="no-output"][data-streak], [data-num=inbox|caught|passed|kept],
// [data-part="problem"][data-code][data-connection-code], [data-action=run|cancel-round|retry|change|copy|login|login-again].
// v2 package L (feedback #1): this library's place in the one queue (the app context's getQueue) — waiting: an amber banner
// 「排队中 · 第 n 位」 with who runs before it and why ([data-part="queue"][data-position], [data-action="see-progress"] → the
// right panel's 进度), and the head's button 「已排上」, not pressable; running: the button 「正在跑」, not pressable
// ([data-action="run"][data-queue-state=running|queued|idle]).
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { isOfLibrary, useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { Button, LinkButton, Notice } from '../kit/index.js'
import { CONNECTIONS, DAY, ERRORS, FETCH_STATES, NEXT_WHEN, NODE_NAMES, ROUND_PHASES, SEP, WHEN } from '../texts/common.js'
import { TODAY as T } from '../texts/today.js'
import { SHELL } from '../texts/shell.js'
import { LibraryFrame } from './library-frame.js'
import { RunDialog } from './run-dialog.js'
import { LoginLoop } from './settings.js'
import { RunStatus } from './status.js'
import { LibrarySuggestions } from './suggestion-card.js'
import { Icon } from '../kit/index.js'
import { doingOf, queueStateOf } from '../lib/queue.js'
import { QUEUE } from '../texts/panel.js'

const LINE = /^(ok|empty|gap|failed|blocked|paused|no-fetch-yet)(?: (\d+)(?:\/(\d+))?(?: (\S*))?(?: hint=(\S+))?)?$/
const LOUD = ['failed', 'gap', 'blocked']

/** A source line of the core ('<state> <n>/<total> <names> hint=<hint>') read into its parts; null for any other shape. */
export function readSourceLine(line) {
  const m = LINE.exec(String(line ?? ''))
  if (!m) return null
  return { state: m[1], n: Number(m[2] ?? 0), total: Number(m[3] ?? m[2] ?? 0), names: (m[4] ?? '').split(',').filter(Boolean), hint: m[5] ?? 'none' }
}

const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)
// a note's date (YYYY-MM-DD) is a local day: without a time, Date would read it as UTC midnight (the day before, west of UTC)
const localDay = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d)

function phaseWords(phase) {
  if (typeof phase !== 'string') return ''
  if (phase.startsWith('gate:')) return `${ROUND_PHASES.gate}${SEP}${nodeName(phase.slice(5))}`
  return Object.hasOwn(ROUND_PHASES, phase) ? ROUND_PHASES[phase] : phase
}

function SourceBanner({ sources, onGo }) {
  if (!sources || !['warning', 'blocked'].includes(sources.level)) return null
  const lines = (sources.lines ?? []).map(readSourceLine).filter(l => l && LOUD.includes(l.state))
  if (!lines.length) return null
  return html`<div class="today-banner" data-part="sources" data-level=${sources.level}>
    ${lines.map(l => html`<${Notice} key=${l.state} tone="wait" role="status" class="today-banner__line">
      <span data-source-state=${l.state}>${fmt(T.sources[l.state], { n: l.n, total: l.total, names: l.names.join(SEP) })}</span>
      <${LinkButton} onClick=${onGo}>${T.sources.go}<//>
    <//>`)}
  </div>`
}

/** Plan C8: 「连续 N 轮没有产出」 from the core's threshold on (getHome().noOutputRounds); under it, nothing. */
/** v2 package L: 「排队中 · 第 n 位」 — who runs before this library and why; it starts by itself after. */
function QueueBanner({ place, queue, nameOf, onSee }) {
  if (place?.state !== 'queued') return null
  const r = queue?.running ?? null
  const name = r ? nameOf(r.libraryId) : null
  const B = QUEUE.banner
  return html`<section class="ov-queue" data-part="queue" data-position=${place.position} role="status">
    <${Icon} name="clock" size=${16} />
    <div class="ov-queue__text">
      <div class="ov-queue__title">${fmt(B.title, { n: place.position })}</div>
      <p>${name ? fmt(B.text, { name, doing: doingOf(r.why, QUEUE.doing) }) : B.textNoName}</p>
    </div>
    <${Act} name="see-progress" onClick=${onSee}>${B.see}<//>
  </section>`
}

function NoOutputBanner({ streak, threshold, onGo }) {
  if (!Number.isInteger(streak) || !Number.isInteger(threshold) || threshold < 1 || streak < threshold) return null
  return html`<div class="today-banner" data-part="no-output" data-streak=${streak}>
    <${Notice} tone="wait" role="status" class="today-banner__line">
      <span class="today-no-output__text">
        <span class="st-t-strong st-t-wait" data-no-output-text>${fmt(T.noOutput.text, { n: streak })}</span>
        <span class="st-t-small st-t-sub">${T.noOutput.hint}</span>
      </span>
      <span data-action="go-status"><${LinkButton} onClick=${onGo}>${T.noOutput.go}<//></span>
    <//>
  </div>`
}

/** S13: the card for a startRound that did not start (getHome().problem). */
function ProblemCard({ problem, busy, onRetry, onChange, onCopy, copied, onRedetect }) {
  if (!problem) return null
  const kind = problem.kind ?? null
  const name = kind && Object.hasOwn(CONNECTIONS.names, kind) ? CONNECTIONS.names[kind] : ''
  const code = problem.connectionCode ?? null
  let text
  let fix = null
  if (problem.code === 'connection' && !kind) {
    // no connection chosen: the self-check had nothing to try
    text = fmt(T.problem.connection.none, { n: problem.caughtKept ?? 0 })
    fix = T.problem.fix.none
  } else if (problem.code === 'connection') {
    const known = code && Object.hasOwn(T.problem.connection, code)
    text = fmt(known ? T.problem.connection[code] : T.problem.connection.other, { name, n: problem.caughtKept ?? 0, code })
    const fixKey = ['login-expired', 'not-logged-in'].includes(code) ? 'login' : Object.hasOwn(T.problem.fix, code) ? code : 'other'
    fix = T.problem.fix[fixKey]
  } else {
    text = Object.hasOwn(T.problem, problem.code) && typeof T.problem[problem.code] === 'string' ? T.problem[problem.code] : fmt(T.problem.connection.other, { name, n: problem.caughtKept ?? 0, code: problem.code })
  }
  const loginable = problem.code === 'connection' && ['claude-code', 'codex'].includes(kind) && ['login-expired', 'not-logged-in'].includes(code)
  return html`<section class="today-problem" data-part="problem" data-code=${problem.code} data-connection-code=${code ?? ''} data-kind=${kind ?? ''} role="alert" aria-label=${text}>
    <div class="today-problem__text st-t-strong">${text}</div>
    ${fix ? html`<div class="st-t-small st-t-sub">${fix}</div>` : null}
    <div class="today-problem__actions">
      <${Act} name="retry" variant="primary" disabled=${busy} onClick=${onRetry}>${T.problem.retry}<//>
      <${Act} name="change" disabled=${busy} onClick=${onChange}>${T.problem.change}<//>
      <${Act} name="copy" icon="copy" disabled=${busy} onClick=${onCopy}>${T.problem.copy}<//>
      ${copied ? html`<span class="st-t-small st-t-done">${T.problem.copied}</span>` : null}
    </div>
    ${loginable ? html`<${LoginLoop} kind=${kind} busy=${busy} onRedetect=${onRedetect} />` : null}
  </section>`
}

function Numbers({ numbers, lastRound }) {
  const tiles = [
    ['inbox', numbers?.inbox ?? 0],
    ['caught', numbers?.caught ?? 0],
    ['passed', lastRound?.counts?.inbox ?? 0],
    ['kept', numbers?.kept ?? 0],
  ]
  return html`<div class="today-numbers" data-part="numbers">
    ${tiles.map(([id, n]) => html`<div key=${id} class="today-num" data-num=${id} data-value=${n}>
      <div class="today-num__value st-t-num">${n}</div>
      <div class="today-num__label st-t-small st-t-sub">${T.numbers[id]}</div>
      ${id === 'inbox' && (numbers?.inboxOldestDays ?? 0) >= 14 ? html`<div class="st-t-tiny st-t-wait" data-inbox-oldest=${numbers.inboxOldestDays}>${fmt(T.numbers.inboxOld, { n: numbers.inboxOldestDays })}</div>` : null}
    </div>`)}
  </div>`
}

function LastRound({ round }) {
  if (!round) return html`<div class="st-t-small st-t-sub" data-part="round" data-round="none">${T.round.none}</div>`
  const fetch = Array.isArray(round.fetch) ? round.fetch : []
  const byState = {}
  for (const f of fetch) byState[f.status] = (byState[f.status] ?? 0) + 1
  const fetchLines = Object.entries(byState).map(([state, n]) => fmt(T.round.fetchLine, { n, state: FETCH_STATES[state] ?? state })).join(SEP)
  const counts = round.counts ?? {}
  return html`<section class="today-round" data-part="round" data-round=${round.id ?? ''} aria-label=${T.round.title}>
    <h2 class="st-t-small st-t-sub st-t-strong today-round__title">${fmt(T.round.title, { when: whenText(round.startedAt, WHEN) ?? '' })}</h2>
    <ul class="today-round__lines">
      ${fetch.length ? html`<li data-line="fetch">${fmt(T.round.fetch, { n: fetch.length, lines: fetchLines })}</li>` : null}
      <li data-line="dedup">${fmt(T.round.dedup, { fetched: counts.fetched ?? 0, new: counts.new ?? 0 })}</li>
      ${Object.entries(round.gates ?? {}).map(([id, g]) => html`<li key=${id} data-line=${id}>${fmt(T.round.node, { name: nodeName(id), passed: g.passed ?? 0, failed: g.failed ?? 0 })}${(g.unscored ?? 0) > 0 ? fmt(T.round.nodeUnscored, { n: g.unscored }) : ''}</li>`)}
      <li data-line="summary">${fmt(T.round.summary, { n: counts.summarized ?? 0 })}</li>
      <li data-line="inbox">${fmt(T.round.inbox, { n: counts.inbox ?? 0 })}</li>
      <li data-line="calls">${fmt(T.round.calls, { n: round.calls ?? 0 })}${round.stoppedAt && Object.hasOwn(T.round.stopped, round.stoppedAt) ? `${SEP}${T.round.stopped[round.stoppedAt]}` : ''}</li>
    </ul>
  </section>`
}

function Progress({ progress, stopping, onStop }) {
  const calls = progress?.calls ?? 0
  const cap = progress?.cap ?? 0
  const pct = cap > 0 ? Math.min(100, Math.floor((calls / cap) * 100)) : 0
  return html`<section class="today-progress" data-part="progress" data-phase=${progress?.phase ?? ''} role="status" aria-label=${T.progress.title}>
    <div class="st-t-strong">${T.progress.title}${SEP}${fmt(T.progress.phase, { phase: phaseWords(progress?.phase) })}</div>
    <div class="today-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}><span class="today-progress__fill" style=${{ width: `${pct}%` }}></span></div>
    <div class="today-progress__row">
      <span class="st-t-small st-t-sub">${fmt(T.progress.calls, { calls, cap })}</span>
      <${Act} name="cancel-round" disabled=${stopping} onClick=${onStop}>${stopping ? T.progress.stopping : T.progress.stop}<//>
    </div>
  </section>`
}

function RecentKept({ items }) {
  return html`<section class="today-recent" data-part="recent" aria-label=${T.recent.title}>
    <h2 class="st-t-small st-t-sub st-t-strong">${T.recent.title}</h2>
    ${items?.length ? html`<ul class="today-recent__list">
      ${items.map(k => html`<li key=${k.id} class="today-recent__item" data-kept=${k.id}>
        <span class="today-recent__title">${k.title}</span>
        <span class="st-t-small st-t-muted">${dayText(localDay(k.kept), DAY) ?? ''}</span>
        <span class="st-t-small st-t-sub">${fmt(T.recent.line, { source: k.source_name ?? '', date: k.date ?? '' })}</span>
      </li>`)}
    </ul>` : html`<div class="st-t-small st-t-muted">${T.recent.none}</div>`}
  </section>`
}

export function OverviewScreen({ params }) {
  const { navigate, appState, queue, libraries, setPanel } = useApp()
  const home = useLoad(() => call('getHome'), [])
  // v2 package A: a round of another library (a timed one) is not this page's
  const libraryId = appState?.data?.library?.libraryId ?? null
  const [progress, setProgress] = useState(null)
  const [showRun, setShowRun] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  useEvent('inbox-changed', () => home.reload())
  useEvent('library-changed', () => home.reload())
  useEvent('connections-changed', () => home.reload())
  // rounds already finished, so a startRound answer that lands after its own `done` event does not draw a progress box
  const finished = useRef(new Set())
  useEvent('round-progress', p => {
    if (!p || typeof p !== 'object' || !isOfLibrary(p, libraryId)) return
    if (p.done) { finished.current.add(p.roundId); setProgress(null); setStopping(false); home.reload() } else setProgress(p)
  })
  const began = r => { if (r?.started && !finished.current.has(r.roundId)) setProgress({ roundId: r.roundId, phase: 'self-check', calls: 0, cap: null }) }
  const data = home.data
  const live = progress ?? (data?.roundState?.running && isOfLibrary(data.roundState, libraryId) ? { ...(data.roundState.progress ?? {}), roundId: data.roundState.roundId } : null)
  const numbers = data?.numbers ?? null
  const lastRound = data?.lastRound ?? numbers?.lastRound ?? null
  const retry = async () => {
    setBusy(true)
    try {
      began(await call('startRound'))
    } catch { /* the card stays */ } finally { setBusy(false); home.reload() }
  }
  const copy = async () => {
    try { await call('copyDiagnostics'); setCopied(true) } catch { setCopied(false) }
  }
  const redetect = async () => {
    setBusy(true)
    try { await call('detectConnections') } catch { /* the card stays */ } finally { setBusy(false); home.reload() }
  }
  const stop = async () => {
    setStopping(true)
    try { await call('cancelRound') } catch { setStopping(false) }
  }
  const conn = data?.connection ?? null
  const connLine = conn?.kind
    ? (conn.model ? fmt(T.connection, { name: CONNECTIONS.names[conn.kind] ?? conn.kind, model: conn.model }) : fmt(T.connectionDefault, { name: CONNECTIONS.names[conn.kind] ?? conn.kind }))
    : T.noConnection
  // the next timed round (getHome().nextRun = getSchedule().nextRunAt): 「下次运行 明天 08:30」, or 「定时没开」
  const nextRun = data?.nextRun ? fmt(T.nextRun.at, { when: nextText(data.nextRun, NEXT_WHEN) ?? data.nextRun }) : T.nextRun.none
  const state = data ? 'ready' : home.status
  // v1.0 sent 「连续 N 轮没有产出」 to 运行状态: that is the 「运行状态」 part of this page now
  const toRun = () => document.querySelector('main[data-screen="overview"] [data-part="run"]')?.scrollIntoView({ block: 'start' })
  // v2 package L: where this library is in the queue — waiting: 「已排上」; running: 「正在跑」 (neither pressable)
  const place = queueStateOf(queue?.data ?? null, libraryId)
  const nameOf = id => (Array.isArray(libraries?.data) ? libraries.data.find(r => r.id === id)?.name ?? null : null)
  const runWords = place?.state === 'queued' ? QUEUE.queuedButton : place?.state === 'running' || live ? QUEUE.runningButton : T.runNow
  const actions = html`<span class="ov-next st-t-small st-t-sub" data-part="next-run" data-next-run=${data?.nextRun ?? ''}>${data ? `${nextRun}${SEP}${connLine}` : ''}</span>
    <span class="st-act" data-action="run" data-queue-state=${place?.state ?? (live ? 'running' : 'idle')}><${Button} variant=${place || live ? 'secondary' : 'primary'} icon=${place || live ? undefined : 'play'}
      disabled=${!data || Boolean(live) || busy || place !== null} onClick=${() => setShowRun(true)}>${runWords}<//></span>`
  return html`<${LibraryFrame} tab="overview" state=${state} label=${SHELL.overview.title} actions=${actions} section=${params?.section}>
      <div class="st-main__body today-body">
        ${home.status === 'error' && !data ? html`<div class="today-error" role="alert">${home.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => home.reload()}>${ERRORS.retry}<//></div>` : null}
        ${data ? html`
          <${QueueBanner} place=${place} queue=${queue?.data ?? null} nameOf=${nameOf} onSee=${() => setPanel?.({ open: true, tab: 'progress' })} />
          <${SourceBanner} sources=${numbers?.sources} onGo=${() => navigate('sources')} />
          <${NoOutputBanner} streak=${numbers?.noOutputStreak} threshold=${data.noOutputRounds} onGo=${toRun} />
          <${ProblemCard} problem=${data.problem} busy=${busy} copied=${copied} onRetry=${retry} onChange=${() => navigate('settings')} onCopy=${copy} onRedetect=${redetect} />
          <${Numbers} numbers=${numbers} lastRound=${lastRound} />
          ${live ? html`<${Progress} progress=${live} stopping=${stopping} onStop=${stop} />` : html`<${LastRound} round=${lastRound} />`}
          <${LibrarySuggestions} libraryId=${libraryId} />
          <${RecentKept} items=${data.recentKept} />
          <${RunStatus} />
        ` : null}
      </div>
    ${showRun ? html`<${RunDialog} onClose=${() => setShowRun(false)}
      onStarted=${r => { began(r); home.reload() }}
      onNotStarted=${() => home.reload()} />` : null}
  <//>`
}
