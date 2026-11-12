// What 概览 showed of the current library's runs — redesign R1: 概览 is gone (维护者 11-11 第 1 题); until R2 gives each its
// place (the last run's summary under an empty 待看, the sources' state on 来源与要求's rows) they sit in the right panel's 进度,
// under 「当前库 · 上次运行」 (F58, F21): the source banner (numbers.sources.lines, only failed / gap / blocked), 「连续 N 轮没有
// 产出」 (plan C8), the four numbers, the last round (lastRound: a roundLog line) or the round running now (round-progress) with
// its 停止, the three most recently kept, and 运行状态 (screens/status.js RunStatus). Everything comes from getHome / getStatus;
// the page computes no number. Words: texts/today.js, texts/status.js.
// Test hooks: [data-part="last-run"][data-state], [data-part=sources|no-output|numbers|round|progress|recent|run],
// [data-num=inbox|caught|passed|kept], [data-part="no-output"][data-streak], [data-action=cancel-round|go-status].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { isOfLibrary, useEvent } from '../lib/use-events.js'
import { phaseWords } from '../lib/phase.js'
import { Act } from '../lib/action.js'
import { LinkButton, Notice } from '../kit/index.js'
import { DAY, ERRORS, FETCH_STATES, NODE_NAMES, SEP, WHEN } from '../texts/common.js'
import { TODAY as T } from '../texts/today.js'
import { SHELL } from '../texts/shell.js'
import { RunStatus } from './status.js'

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


/** The part itself (the right panel's 进度, on a library's page): the current library's last run and its state. */
export function LastRunPart() {
  const { navigate, appState } = useApp()
  const home = useLoad(() => call('getHome'), [])
  // v2 package A: a round of another library (a timed one) is not this part's
  const libraryId = appState?.data?.library?.libraryId ?? null
  const [progress, setProgress] = useState(null)
  const [stopping, setStopping] = useState(false)
  useEvent('inbox-changed', () => home.reload())
  useEvent('library-changed', () => home.reload())
  useEvent('connections-changed', () => home.reload())
  // rounds already finished, so a late event of one does not draw a progress box again
  const finished = useRef(new Set())
  useEvent('round-progress', p => {
    if (!p || typeof p !== 'object' || !isOfLibrary(p, libraryId)) return
    if (p.done) { finished.current.add(p.roundId); setProgress(null); setStopping(false); home.reload() } else if (!finished.current.has(p.roundId)) setProgress(p)
  })
  const data = home.data
  const live = progress ?? (data?.roundState?.running && isOfLibrary(data.roundState, libraryId) ? { ...(data.roundState.progress ?? {}), roundId: data.roundState.roundId } : null)
  const numbers = data?.numbers ?? null
  const lastRound = data?.lastRound ?? numbers?.lastRound ?? null
  const stop = async () => {
    setStopping(true)
    try { await call('cancelRound') } catch { setStopping(false) }
  }
  // 「连续 N 轮没有产出」 points at 运行状态: the part just below
  const toRun = () => document.querySelector('[data-part="last-run"] [data-part="run"]')?.scrollIntoView({ block: 'start' })
  return html`<section class="panel-section st-last-run" data-part="last-run" data-state=${data ? 'ready' : home.status} aria-label=${SHELL.lastRun.title}>
    <div class="section-label"><span>${SHELL.lastRun.title}</span></div>
    ${home.status === 'error' && !data ? html`<div class="today-error" role="alert">${home.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => home.reload()}>${ERRORS.retry}<//></div>` : null}
    ${data ? html`
      <${SourceBanner} sources=${numbers?.sources} onGo=${() => navigate('sources')} />
      <${NoOutputBanner} streak=${numbers?.noOutputStreak} threshold=${data.noOutputRounds} onGo=${toRun} />
      <${Numbers} numbers=${numbers} lastRound=${lastRound} />
      ${live ? html`<${Progress} progress=${live} stopping=${stopping} onStop=${stop} />` : html`<${LastRound} round=${lastRound} />`}
      <${RecentKept} items=${data.recentKept} />
      <${RunStatus} />
    ` : null}
  </section>`
}
