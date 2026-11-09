// 新建库 (v2 package I, contract I1 「手动新建」; docs/desktop.md §五「新建库」): v1.0's 首次设置 without its connection step, as a
// flow of its own — 库放在哪 → 主题与来源 → 试跑一轮 → 定时 — in a sidebar of its own steps (the kit's Sidebar parts). The route
// 'new-library' (app.js newLibrary(): the sidebar's 「+ 新建库」, the shelf's 「新建库」 and 「手动新建」, 首次打开's 「也可以手动新建」);
// params.back = the screen to go back to on 「取消」 (only before a folder is used: after that the library is there).
// The steps are v1.0's (moved here from screens/first-run.js): the folder — chooseLibraryFolder (the system's dialog, which opens
// in 「新建库默认放在」; STREAMS_DEV_CHOOSE_FOLDER in tests) → useChosenFolder(''): an empty folder becomes a new library, a folder
// of .md files is opened as one (nothing of the user's moved or changed), and both go on to the pack; a folder that already holds
// a library is opened and the flow ends there, on its 待看 (「这里已经有一个库：会直接打开它。」; its streams.json untouched);
// anything else is refused. The main process registers the library and makes it the current one (package A) — and, when
// 首次打开 recorded its connection step in settings.json, copies that record into the new library's setup.connection (package I,
// services/library.mjs). The pack (getStarterPacks → applyStarterPack and the try-fetch), the first round (estimateRound →
// startRound + round-progress), the schedule (getSchedule → setSchedule: the new library's own, it being the current one).
// Who decided each step goes into the library's streams.json setup as the step is walked through (recordSetupStep): library
// (chose + the folder's state) · pack (chose + its id) · sources (default / wrote + { removed, added }) · trial (chose / skipped)
// · schedule (default) — with connection from 首次打开, six records as v1.0 had. A record that cannot be written does not stop it.
// Words: texts/first-run.js (the steps), texts/shell.js SHELL.newLibrary. Styles: styles/screens/first-run.css (fr-…).
// Test hooks: main[data-screen="new-library"][data-state], .fr-body[data-step=<id>] and [data-part="step-<id>"], the sidebar's
// [data-step][data-step-state], [data-action=choose-folder|next|cancel-new|apply|continue|start|skip-trial|go-today|go-inbox|back],
// [data-pack=<id>], [data-source=<name>], [data-part="round-progress"][data-phase][data-done].
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, Icon, Main, Sidebar, Tag, TopBar } from '../kit/index.js'
import { CONNECTIONS, ERRORS, FETCH_STATES, NODE_NAMES, ROUND_PHASES } from '../texts/common.js'
import { FIRST_RUN as T } from '../texts/first-run.js'
import { SHELL } from '../texts/shell.js'

/** 新建库's steps, in order. */
export const MANUAL_STEPS = Object.freeze(['folder', 'pack', 'trial', 'schedule'])

/** One record of who decided a step into the current library (recordSetupStep); a failure is not the flow's to show. */
export async function recordStep(step, by, detail) {
  try { await call('recordSetupStep', step, detail === undefined ? { by } : { by, detail }) } catch { /* the flow goes on */ }
}

function doneLine(id, record) {
  if (id === 'folder') return record.folder?.path ?? null
  if (id === 'connection') return record.connection === 'skipped' ? T.stepDone.connectionSkipped : T.stepDone.connection
  if (id === 'pack') return record.pack ? fmt(T.stepDone.pack, record.pack) : null
  return null
}

/** A flow's own sidebar: its steps, done · current · to do (首次打开 and 新建库 both). */
export function WizardSidebar({ label, steps, step, record = {} }) {
  return html`<${Sidebar} label=${label}>
    <div class="fr-steps">
      ${steps.map((id, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo'
        const sub = state === 'done' ? doneLine(id, record) : null
        return html`<div key=${id} class=${`st-sidebar__step st-sidebar__step--${state}`} data-step=${id} data-step-state=${state} aria-current=${state === 'current' ? 'step' : undefined}>
          <span class="st-sidebar__step-mark">${state === 'done' ? html`<${Icon} name="check" size=${10} />` : i + 1}</span>
          <div class="fr-steps__text">
            <div class="st-sidebar__step-name">${T.steps[id]}</div>
            ${sub ? html`<div class="st-sidebar__step-sub">${sub}</div>` : null}
          </div>
        </div>`
      })}
    </div>
  <//>`
}

/** The folder. chooseLibraryFolder (the main process asks; STREAMS_DEV_CHOOSE_FOLDER in tests) → useChosenFolder(''). */
export function FolderStep({ onNext, onState, onCancel }) {
  useEffect(() => onState('ready'), [])
  const [chosen, setChosen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const choose = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await call('chooseLibraryFolder')
      if (r) setChosen(r)
    } catch { setError(ERRORS.failed) } finally { setBusy(false) }
  }
  const next = async () => {
    setBusy(true)
    setError(null)
    try {
      await call('useChosenFolder', '')
      onNext({ path: chosen.path, name: chosen.name, state: chosen.state })
    } catch (err) { setError(err?.code === 'open_failed' ? T.folder.other : T.folder.failed) } finally { setBusy(false) }
  }
  // importable: a folder of the user's own .md files, opened as a library on 「下一步」 (docs/desktop.md §4.3)
  const ok = Boolean(chosen && (chosen.state === 'empty' || chosen.state === 'library' || chosen.state === 'importable'))
  const note = chosen ? (Object.hasOwn(T.folder, chosen.state) ? fmt(T.folder[chosen.state], { n: chosen.mdCount ?? '' }) : T.folder.other) : null
  return html`<div class="fr-step">
    <h2 class="st-t-heading">${T.folder.heading}</h2>
    <p class="st-t-sub">${T.folder.lead}</p>
    ${chosen ? html`<div class="fr-folder" data-folder-state=${chosen.state}>
      <div class="fr-folder__path st-t-strong" data-folder-path=${chosen.path}>${chosen.path}</div>
      <div class=${ok ? 'st-t-small st-t-sub' : 'st-t-small fr-error'} data-folder-note>${note}</div>
    </div>` : null}
    <p class="st-t-small st-t-sub fr-note">${T.folder.note}</p>
    <div class="fr-actions">
      ${onCancel ? html`<${Act} name="cancel-new" disabled=${busy} onClick=${onCancel}>${SHELL.newLibrary.cancel}<//>` : null}
      <${Act} name="choose-folder" icon="folder" disabled=${busy} onClick=${choose}>${chosen ? T.folder.change : T.folder.choose}<//>
      <${Act} name="next" variant="primary" disabled=${busy || !ok} onClick=${next}>${T.next}<//>
    </div>
    ${error ? html`<div class="fr-error" role="alert">${error}</div>` : null}
  </div>`
}

/** A starter pack (getStarterPacks) or blank, sources removed or an RSS added, then applyStarterPack and the try-fetch. */
export function PackStep({ onNext, onBack, onState }) {
  const packs = useLoad(() => call('getStarterPacks'), [])
  useEffect(() => onState(packs.status), [packs.status])
  const [packId, setPackId] = useState(null)
  const [removed, setRemoved] = useState([])
  const [added, setAdded] = useState([])
  const [rss, setRss] = useState({ name: '', url: '' })
  const [applied, setApplied] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const list = packs.data ?? []
  const pack = list.find(p => p.id === packId) ?? null
  const topics = pack?.topics ?? []
  const sources = [...(pack?.sources ?? []).filter(s => !removed.includes(s.name)), ...added.map(a => ({ ...a, kind: 'rss' }))]
  const choosePack = id => { setPackId(id); setRemoved([]); setAdded([]) }
  const addOne = () => {
    const name = rss.name.trim()
    const url = rss.url.trim()
    if (!name || !url) return
    setAdded(a => [...a, { name, url }])
    setRss({ name: '', url: '' })
  }
  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await call('applyStarterPack', packId ?? 'blank', { removeSources: removed, addRss: added })
      setApplied(r)
    } catch { setError(T.pack.failed) } finally { setBusy(false) }
  }
  if (applied) {
    return html`<div class="fr-step" data-applied>
      <h2 class="st-t-heading">${T.pack.heading}</h2>
      <p class="st-t-sub">${T.pack.tried}</p>
      <ul class="fr-sources" data-part="tried">
        ${applied.sources.map(s => html`<li key=${s.name} class="fr-source" data-source=${s.name} data-fetch-state=${s.status}>
          <span class="st-t-strong">${s.name}</span>
          <span class="st-t-small st-t-muted fr-source__url">${s.url ?? s.query ?? ''}</span>
          <span class=${`st-fetch st-fetch--${s.status}`}>${FETCH_STATES[s.status] ?? s.status}</span>
          ${typeof s.count === 'number' ? html`<span class="st-t-small st-t-sub">${fmt(T.pack.count, { n: s.count })}</span>` : null}
          ${s.message ? html`<span class="st-t-small st-t-muted">${s.message}</span>` : null}
        </li>`)}
      </ul>
      <div class="fr-actions">
        <span class="fr-actions__spacer"></span>
        <${Act} name="continue" variant="primary" onClick=${() => onNext({ topics: applied.topics.length, sources: applied.sources.length }, { packId: packId ?? 'blank', removed: removed.length, added: added.length })}>${T.pack.continue}<//>
      </div>
    </div>`
  }
  return html`<div class="fr-step">
    <h2 class="st-t-heading">${T.pack.heading}</h2>
    <p class="st-t-sub">${T.pack.lead}</p>
    <div class="fr-packs" role="radiogroup" aria-label=${T.pack.heading}>
      ${list.map(p => html`<button key=${p.id} type="button" role="radio" aria-checked=${String(packId === p.id)} class=${`fr-pack${packId === p.id ? ' fr-pack--selected' : ''}`} data-pack=${p.id} onClick=${() => choosePack(p.id)}>
        <span class="st-t-strong">${p.name}</span>
        <span class="st-t-small st-t-sub">${fmt(T.pack.packHint, { topics: p.topics.length, sources: p.sources.length })}</span>
      </button>`)}
      <button type="button" role="radio" aria-checked=${String(packId === 'blank')} class=${`fr-pack${packId === 'blank' ? ' fr-pack--selected' : ''}`} data-pack="blank" onClick=${() => choosePack('blank')}>
        <span class="st-t-strong">${T.pack.blank}</span>
        <span class="st-t-small st-t-sub">${T.pack.blankHint}</span>
      </button>
    </div>
    ${packId !== null ? html`<div class="fr-pack-detail" data-part="pack-detail">
      <div class="fr-pack-detail__block">
        <div class="st-t-small st-t-sub st-t-strong">${T.pack.topics}</div>
        <div class="fr-topics">${topics.map(t => html`<${Tag} key=${t} tone="done">${t}<//>`)}</div>
      </div>
      <div class="fr-pack-detail__block">
        <div class="st-t-small st-t-sub st-t-strong">${T.pack.sources}</div>
        ${sources.length ? html`<ul class="fr-sources">
          ${sources.map(s => html`<li key=${s.name} class="fr-source" data-source=${s.name}>
            <span class="st-t-strong">${s.name}</span>
            <span class="st-t-small st-t-muted fr-source__kind">${s.kind}</span>
            <span class="st-t-small st-t-muted fr-source__url">${s.url ?? s.query ?? ''}</span>
            <button type="button" class="st-link-button" data-action="remove-source" onClick=${() => (added.some(a => a.name === s.name) ? setAdded(a => a.filter(x => x.name !== s.name)) : setRemoved(r => [...r, s.name]))}>${T.pack.remove}</button>
          </li>`)}
        </ul>` : html`<div class="st-t-small st-t-muted">${T.pack.noSources}</div>`}
        <div class="fr-add" data-part="add-rss">
          <span class="st-t-small st-t-sub">${T.pack.addRss}</span>
          <input class="fr-field" type="text" data-field="rss-name" placeholder=${T.pack.rssName} aria-label=${T.pack.rssName} value=${rss.name} onInput=${e => setRss(r => ({ ...r, name: e.currentTarget.value }))} />
          <input class="fr-field fr-field--wide" type="text" data-field="rss-url" placeholder=${T.pack.rssUrl} aria-label=${T.pack.rssUrl} value=${rss.url} onInput=${e => setRss(r => ({ ...r, url: e.currentTarget.value }))} />
          <${Act} name="add-rss" disabled=${!rss.name.trim() || !rss.url.trim()} onClick=${addOne}>${T.pack.add}<//>
        </div>
      </div>
    </div>` : null}
    ${busy ? html`<div class="st-t-small st-t-sub" role="status">${T.pack.applying}</div>` : null}
    ${error ? html`<div class="fr-error" role="alert">${error}</div>` : null}
    <div class="fr-actions">
      ${onBack ? html`<${Act} name="back" disabled=${busy} onClick=${onBack}>${T.back}<//>` : null}
      <span class="fr-actions__spacer"></span>
      <${Act} name="apply" variant="primary" disabled=${busy || packId === null} onClick=${apply}>${T.next}<//>
    </div>
  </div>`
}

function phaseWords(phase) {
  if (typeof phase !== 'string') return ''
  const key = phase.startsWith('gate:') ? 'gate' : phase
  const base = Object.hasOwn(ROUND_PHASES, key) ? ROUND_PHASES[key] : phase
  if (!phase.startsWith('gate:')) return base
  const id = phase.slice(5)
  return `${base} · ${Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id}`
}

function problemWords(problems) {
  const p = Array.isArray(problems) ? problems[0] : null
  if (!p) return ERRORS.failed
  if (p.code === 'connection') return Object.hasOwn(CONNECTIONS.codes, p.connectionCode) ? CONNECTIONS.codes[p.connectionCode] : String(p.connectionCode ?? p.code)
  return String(p.code)
}

/** The first round: the estimate (estimateRound), 「开始」 (startRound), the round's progress, the counts when it is done. */
export function TrialStep({ onBack, onNext, onSkip, onState, connected }) {
  const est = useLoad(() => call('estimateRound'), [])
  useEffect(() => onState(est.status), [est.status])
  const [run, setRun] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEvent('round-progress', p => {
    if (!p || typeof p !== 'object') return
    setRun(prev => (prev?.roundId && p.roundId !== prev.roundId ? prev : p))
  })
  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await call('startRound')
      if (r.started) setRun(prev => (prev?.roundId === r.roundId ? prev : { roundId: r.roundId, phase: 'self-check', counts: null, calls: 0, cap: est.data?.cap ?? null, done: false }))
      else setError(fmt(T.trial.notStarted, { reason: problemWords(r.problems) }))
    } catch { setError(T.trial.failed) } finally { setBusy(false) }
  }
  const d = est.data
  const result = run?.done ? run.result : null
  const pct = run && run.cap > 0 ? Math.min(100, Math.floor(((run.calls ?? 0) / run.cap) * 100)) : 0
  return html`<div class="fr-step">
    <h2 class="st-t-heading">${T.trial.heading}</h2>
    <p class="st-t-sub">${T.trial.lead}</p>
    ${d ? html`<ul class="fr-estimate" data-part="estimate">
      <li data-row="fetch">${fmt(T.trial.sources, { n: d.sources, paused: d.paused })}</li>
      <li data-row="items">${fmt(T.trial.items, { lo: d.expectedItems?.[0], hi: d.expectedItems?.[1] })}</li>
      <li data-row="calls">${fmt(T.trial.calls, { lo: d.expectedCalls?.[0], hi: d.expectedCalls?.[1] })}</li>
      <li data-row="cap">${fmt(T.trial.cap, { cap: d.cap })}</li>
    </ul>` : est.status === 'error' ? html`<div class="fr-error">${ERRORS.failed}</div>` : null}
    ${!connected ? html`<p class="st-t-small st-t-sub" data-no-connection>${T.trial.noConnection}</p>` : null}
    ${run ? html`<div class="fr-progress" data-part="round-progress" data-phase=${run.phase ?? ''} data-done=${String(run.done === true)} role="status">
      ${result ? html`<div class="st-t-strong">${T.trial.done}</div>` : html`<div class="st-t-strong">${fmt(T.trial.running, { phase: phaseWords(run.phase) })}</div>`}
      <div class="fr-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${result ? 100 : pct}><span class="fr-progress__fill" style=${{ width: `${result ? 100 : pct}%` }}></span></div>
      <div class="st-t-small st-t-sub">${fmt(T.trial.calling, { calls: run.calls ?? 0, cap: run.cap ?? '' })}</div>
      ${result ? html`<ul class="fr-result" data-part="result">
        <li data-count="fetched">${fmt(T.trial.fetched, { n: result.counts?.fetched ?? 0 })}</li>
        <li data-count="new">${fmt(T.trial.fresh, { n: result.counts?.new ?? 0 })}</li>
        ${Object.entries(result.gates ?? {}).map(([id, g]) => html`<li key=${id} data-count=${id}>${fmt(T.trial.passed, { name: Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id, n: g.passed ?? 0 })}</li>`)}
        <li data-count="summarized">${fmt(T.trial.summarized, { n: result.counts?.summarized ?? 0 })}</li>
        <li data-count="inbox">${fmt(T.trial.inbox, { n: result.counts?.inbox ?? 0 })}</li>
      </ul>` : null}
    </div>` : null}
    ${error ? html`<div class="fr-error" role="alert">${error}</div>` : null}
    <div class="fr-actions">
      ${!run ? html`<${Act} name="back" disabled=${busy} onClick=${onBack}>${T.back}<//>` : null}
      <span class="fr-actions__spacer"></span>
      ${!run ? html`<${Act} name="skip-trial" disabled=${busy} onClick=${onSkip}>${T.trial.skip}<//>` : null}
      ${result
        ? html`<${Act} name="next" variant="primary" onClick=${onNext}>${T.next}<//>`
        : html`<${Act} name="start" variant="primary" disabled=${busy || Boolean(run) || !d} onClick=${start}>${T.trial.start}<//>`}
    </div>
  </div>`
}

/** The schedule (plan A1 「设好明天，关窗口」): the schedule as it is (getSchedule: every day at 08:30, on); 完成 = setSchedule with it. */
export function ScheduleStep({ onFinish, onState }) {
  const sched = useLoad(() => call('getSchedule'), [])
  useEffect(() => onState(sched.status), [sched.status])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const d = sched.data
  const finish = async screen => {
    setBusy(true)
    setError(null)
    try {
      await call('setSchedule', { enabled: true, time: d.time })
      await recordStep('schedule', 'default', { enabled: true, time: d.time })
      onFinish(screen)
    } catch { setError(T.schedule.failed) } finally { setBusy(false) }
  }
  return html`<div class="fr-step">
    <h2 class="st-t-heading">${T.schedule.heading}</h2>
    <p class="st-t-sub">${T.schedule.lead}</p>
    ${d ? html`<section class="fr-card fr-card--selected fr-schedule" data-part="schedule" data-time=${d.time} aria-label=${T.schedule.card}>
      <div class="fr-card__head"><span class="st-t-title">${T.schedule.card}</span></div>
      <div class="st-t-strong" data-every>${fmt(T.schedule.every, { time: d.time })}</div>
      <div class="st-t-small st-t-sub">${T.schedule.where}</div>
    </section>
    <ul class="fr-estimate" data-part="schedule-rules">
      <li>${T.schedule.missed}</li>
      <li>${T.schedule.close}</li>
    </ul>
    <p class="st-t-small st-t-muted fr-note">${T.schedule.later}</p>` : sched.status === 'error' ? html`<div class="fr-error">${ERRORS.failed}</div>` : null}
    ${error ? html`<div class="fr-error" role="alert">${error}</div>` : null}
    <div class="fr-actions">
      <span class="fr-actions__spacer"></span>
      <${Act} name="go-today" disabled=${busy || !d} onClick=${() => finish('today')}>${T.schedule.finishToday}<//>
      <${Act} name="go-inbox" variant="primary" disabled=${busy || !d} onClick=${() => finish('inbox')}>${T.schedule.finishInbox}<//>
    </div>
  </div>`
}

/**
 * 新建库 (the route 'new-library'). `onDone(screen)` (app.js, optional) ends it: the new library is the current one by then.
 * @param {{params?: {back?: string}, onDone?: (screen: string) => void}} p
 */
export function NewLibraryScreen({ params = {}, onDone }) {
  const { navigate, appState, libraries } = useApp()
  const [step, setStep] = useState(0)
  const [record, setRecord] = useState({})
  const [state, setState] = useState('loading')
  const id = MANUAL_STEPS[step]
  const go = (patch, next) => { setRecord(r => ({ ...r, ...patch })); setState('loading'); setStep(next) }
  const done = async (records, patch, next) => {
    for (const [s, by, detail] of records) await recordStep(s, by, detail)
    go(patch, next)
  }
  const finish = screen => {
    appState?.reload?.()
    libraries?.reload?.()
    if (typeof onDone === 'function') onDone(screen ?? 'inbox')
    else navigate(screen ?? 'inbox')
  }
  const cancel = () => navigate(typeof params.back === 'string' && params.back !== 'new-library' ? params.back : 'shelf')
  // a folder that already held a library: it is open now (useChosenFolder) and the flow ends on its 待看 — nothing recorded
  const folderDone = folder => (folder.state === 'library' ? finish('inbox') : done([['library', 'chose', folder.state]], { folder }, 1))
  const packDone = (pack, { packId, removed, added }) => done([
    ['pack', 'chose', packId],
    removed === 0 && added === 0 ? ['sources', 'default'] : ['sources', 'wrote', { removed, added }],
  ], { pack }, 2)
  return html`<${AppFrame} sidebar=${html`<${WizardSidebar} label=${SHELL.newLibrary.title} steps=${MANUAL_STEPS} step=${step} record=${record} />`}>
    <${Main} screen="new-library" state=${state} labelledby="nl-title">
      <${TopBar} title=${SHELL.newLibrary.title} subtitle=${T.steps[id]} titleTag="h1" titleId="nl-title" />
      <div class="st-main__body fr-body" data-part=${`step-${id}`} data-step=${id}>
        ${id === 'folder' ? html`<${FolderStep} onState=${setState} onNext=${folderDone} onCancel=${cancel} />` : null}
        ${id === 'pack' ? html`<${PackStep} onState=${setState} onNext=${packDone} />` : null}
        ${id === 'trial' ? html`<${TrialStep} onState=${setState} connected=${Boolean(appState?.data?.activeConnection)} onBack=${() => go({}, 1)} onNext=${() => done([['trial', 'chose']], { trial: 'done' }, 3)} onSkip=${() => done([['trial', 'skipped']], { trial: 'skipped' }, 3)} />` : null}
        ${id === 'schedule' ? html`<${ScheduleStep} onState=${setState} onFinish=${finish} />` : null}
      </div>
    <//>
  <//>`
}
