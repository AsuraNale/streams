// The proposal card (v2 package G, contract G1; design P8, UC1 step 3–4, UC3 step 3): what a card of package B would change,
// drawn the same in 和主 Agent 聊 (screens/chat.js) and in 问库 (screens/ask.js). Everything on it comes from the card as the
// bridge gives it (listProposals / confirmProposal / declineProposal / reviseProposal; docs/desktop.md §4.5): the head 「提议卡 ·
// 你确认后才生效」, the title by kind (建库：<name>; 改「<库名>」：加 N 个来源 / 删来源 / 暂停来源 / 改主题 / 改要求 / 改过关线 / 改定时 /
// 改每轮上限 / 跑一轮), why, before and after side by side (the core worked them out on a copy; the page computes nothing of
// them, it only marks in each column what the other one does not have), and for a new library its brief, topics and
// keywords, each source with its test fetch (one of the five states and how many items; one not ticked says 没勾), the pass
// lines, the schedule and the folder; for an added source its test fetch.
// Buttons (only while the card is `pending`): 确认 (建库 on a new library's card) → confirmProposal · 改一下 → a line to write
// one sentence in, then reviseProposal(id, text) and the sentence goes to the main Agent (`onSend(text)`: the page's own way
// of sending, default agentSend) · 不要 → declineProposal. A button pressed stays pressed (all three disabled, and a second
// press does nothing) until the bridge answers. There is no switch that lets a kind of change happen by itself later
// (维护者 11-05): the card only ever takes effect through 确认.
// The states once decided: confirmed 「已生效 · 时间」 (a new library: 「已建库 · 时间」) · declined 「没要」 · revise 「已改」 · stale
// 「库在这之后改过，这张卡不再生效」 · failed 「没生效：<哪一步>」 and whether it was undone. A decided card is folded to its
// title and state; 「看卡上写的」 unfolds it.
// Test hooks: section[data-proposal=<id>][data-kind][data-status][data-busy], [data-part=title|status|why|before|after|trial|
// brief|topics|sources|thresholds|schedule|folder|failure|revise], [data-trial=<name>][data-state][data-include],
// [data-action=confirm|revise|decline|revise-send|revise-cancel|show], textarea[data-field="revise"].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, whenText } from '../lib/format.js'
import { Act } from '../lib/action.js'
import { DAY, FETCH_STATES, SEP, WHEN } from '../texts/common.js'
import { SHELL } from '../texts/shell.js'
import { AGENT } from '../texts/agent.js'

const T = AGENT.card
const REVISE_MAX = 2000

/** A library's name from the app's list of libraries (lib/libraries.js rows), or null. */
export function libraryNameOf(rows, id) {
  if (!id || !Array.isArray(rows)) return null
  return rows.find(r => r.id === id)?.name ?? null
}

const countOf = v => (v && typeof v.count === 'number' ? v.count : Array.isArray(v?.names) ? v.names.length : 0)

/** The card's title by its kind (contract G1). */
export function cardTitle(card, libName) {
  const p = card?.params ?? {}
  const lib = libName ?? T.thisLibrary
  switch (card?.kind) {
    case 'create_library': return fmt(T.titles.create_library, { name: p.name ?? '' })
    case 'add_source': return fmt(T.titles.add_source, { lib, n: Math.max(1, countOf(card.after?.sources) - countOf(card.before?.sources)) })
    case 'remove_source': return fmt(T.titles.remove_source, { lib, name: p.name ?? '' })
    case 'pause_source': return fmt(p.paused === false ? T.titles.resume_source : T.titles.pause_source, { lib, name: p.name ?? '' })
    default: return Object.hasOwn(T.titles, card?.kind ?? '') ? fmt(T.titles[card.kind], { lib }) : fmt(T.titles.other, { lib })
  }
}

/** The step a failed card stopped at, in words. */
export function stepText(step) {
  if (typeof step !== 'string') return T.steps.other
  const op = /^op:(\d+)$/.exec(step)
  if (op) return fmt(T.steps.op, { n: Number(op[1]) })
  return Object.hasOwn(T.steps, step) && step !== 'op' ? T.steps[step] : T.steps.other
}

/** The line of a decided card (contract G1); null while pending. */
export function statusText(card) {
  const when = whenText(card?.decidedAt, WHEN) ?? ''
  switch (card?.status) {
    case 'confirmed': return fmt(card.kind === 'create_library' ? T.states.created : T.states.confirmed, { when })
    case 'declined': return T.states.declined
    case 'revise': return T.states.revise
    case 'stale': return card.reason === 'library-gone' ? T.states.staleGone : card.reason === 'folder_not_empty' ? T.states.staleFolder : T.states.stale
    case 'failed': return fmt(T.states.failed, { step: stepText(card.failure?.step) })
    default: return null
  }
}

const trialState = t => (t && Object.hasOwn(FETCH_STATES, t.status) ? FETCH_STATES[t.status] : String(t?.status ?? ''))

/** A test fetch as one chip: 「正常 · 6 条」, 「被拒绝 · HTTP 403」. */
export function trialText(t) {
  if (!t) return ''
  if ((t.count ?? 0) > 0 || t.status === 'ok' || t.status === 'empty' || !t.http) return fmt(T.trialCount, { state: trialState(t), n: t.count ?? 0 })
  return fmt(T.trialHttp, { state: trialState(t), http: t.http })
}

const Chip = ({ state, children }) => html`<span class=${`pc-chip pc-chip--${state ?? 'plain'}`}>${children}</span>`
const number = v => (typeof v === 'number' ? String(v) : T.thresholdNone)

// ---- one column of before / after, by what the card is about; `other` is the other column's view ---------------------------

function SourcesView({ view, other, side }) {
  const names = Array.isArray(view?.names) ? view.names : []
  const them = new Set(Array.isArray(other?.names) ? other.names : [])
  const paused = new Set(Array.isArray(view?.paused) ? view.paused : [])
  const otherPaused = new Set(Array.isArray(other?.paused) ? other.paused : [])
  if (!names.length) return html`<div>${T.sourcesNone}</div>`
  return html`<div>
    <div>${fmt(T.sourcesLine, { n: countOf(view) })}</div>
    <div class="pc-names">${names.map(n => {
      const changed = !them.has(n) || paused.has(n) !== otherPaused.has(n)
      const cls = changed ? (side === 'after' ? 'pc-name pc-name--new' : 'pc-name pc-name--gone') : 'pc-name'
      return html`<span key=${n} class=${cls} data-name=${n} data-changed=${String(changed)}>${n}${paused.has(n) ? T.pausedMark : ''}</span>`
    })}</div>
  </div>`
}

function TopicsView({ view, other, side }) {
  const topics = Array.isArray(view?.topics) ? view.topics : []
  const them = new Map((Array.isArray(other?.topics) ? other.topics : []).map(t => [t.name, new Set(Array.isArray(t.keywords) ? t.keywords : [])]))
  if (!topics.length) return html`<div>${T.topicsNone}</div>`
  const mark = side === 'after' ? 'pc-name--new' : 'pc-name--gone'
  return html`<ul class="pc-topics">${topics.map(t => {
    const known = them.get(t.name)
    const words = Array.isArray(t.keywords) ? t.keywords : []
    return html`<li key=${t.name} data-topic=${t.name}>
      <span class=${`pc-topic st-t-strong${known ? '' : ` ${mark}`}`}>${t.name}</span>
      ${words.length ? words.map(k => html`<span key=${k} class=${`pc-kw${known && !known.has(k) ? ` ${mark}` : ''}`} data-keyword=${k}>${k}</span>`) : html`<span class="st-t-muted">${T.keywordsNone}</span>`}
    </li>`
  })}</ul>`
}

function scheduleText(s) {
  if (!s || typeof s !== 'object') return T.scheduleOff
  return s.enabled ? fmt(T.scheduleOn, { time: s.time ?? '' }) : T.scheduleOff
}

function thresholdsText(t) {
  return fmt(T.thresholdsLine, { relevance: number(t?.relevance), substance: number(t?.substance) })
}

function SideView({ card, side }) {
  const view = side === 'after' ? card.after : card.before
  const other = side === 'after' ? card.before : card.after
  if (!view || typeof view !== 'object') return html`<div></div>`
  if (card.kind === 'run_round') {
    if (side === 'before') return html`<div>${view.lastRoundAt ? fmt(T.runBefore, { when: whenText(view.lastRoundAt, WHEN) ?? view.lastRoundAt }) : T.runNever}</div>`
    return html`<div>${fmt(T.runAfter, { n: view.cap ?? 0 })}</div>`
  }
  if ('sources' in view) return html`<${SourcesView} view=${view.sources} other=${other?.sources} side=${side} />`
  if ('topics' in view) return html`<${TopicsView} view=${view} other=${other} side=${side} />`
  if ('brief' in view) return html`<div class="pc-brief">${typeof view.brief === 'string' && view.brief ? view.brief : T.briefNone}</div>`
  if ('thresholds' in view) return html`<div>${thresholdsText(view.thresholds)}</div>`
  if ('schedule' in view) return html`<div>${scheduleText(view.schedule)}</div>`
  if ('cap' in view) return html`<div>${fmt(T.capLine, { n: view.cap ?? 0 })}</div>`
  return html`<div></div>`
}

function Diff({ card }) {
  return html`<div class="pc-diff">
    <div class="pc-diff__side" data-part="before"><div class="pc-diff__head">${T.before}</div><${SideView} card=${card} side="before" /></div>
    <div class="pc-diff__side pc-diff__side--after" data-part="after"><div class="pc-diff__head">${T.after}</div><${SideView} card=${card} side="after" /></div>
  </div>`
}

/** The test fetch of one source (an added source; each source of a new library). */
function TrialLine({ name, trial, ticks }) {
  const include = trial?.include !== false
  const latest = Array.isArray(trial?.sample) && trial.sample[0]?.title ? trial.sample[0] : null
  return html`<div class="pc-trial" data-trial=${name ?? ''} data-state=${trial?.status ?? ''} data-include=${String(include)}>
    ${ticks ? html`<span class=${`pc-tick${include ? ' pc-tick--on' : ''}`} role="img" aria-label=${include ? T.ticked : T.unticked}>${include ? '✓' : ''}</span>` : null}
    ${name ? html`<span class=${include ? 'pc-trial__name' : 'pc-trial__name st-t-muted'}>${name}</span>` : null}
    <${Chip} state=${trial?.status}>${trialText(trial)}<//>
    ${!include ? html`<span class="st-t-tiny st-t-muted" data-part="unticked">${T.unticked}</span>` : null}
    ${include && latest && !ticks ? html`<span class="st-t-tiny st-t-sub">${fmt(T.trialLatest, { title: latest.title })}${latest.date ? `${SEP}${latest.date}` : ''}</span>` : null}
  </div>`
}

function NewLibraryBody({ card }) {
  const a = card.after ?? {}
  const trials = Array.isArray(card.trial) ? card.trial : []
  const topics = Array.isArray(a.topics) ? a.topics : []
  return html`
    <div class="pc-k">${T.brief}</div><div data-part="brief" class="pc-brief">${a.brief ?? T.briefNone}</div>
    <div class="pc-k">${T.topics}</div>
    <div data-part="topics">${topics.length ? html`<ul class="pc-topics">${topics.map(t => html`<li key=${t.name} data-topic=${t.name}>
      <span class="pc-topic st-t-strong">${t.name}</span>${(Array.isArray(t.keywords) ? t.keywords : []).map(k => html`<span key=${k} class="pc-kw" data-keyword=${k}>${k}</span>`)}
    </li>`)}</ul>` : T.topicsNone}</div>
    <div class="pc-k">${T.sources}</div>
    <div data-part="sources" class="pc-trials">${trials.length ? trials.map(t => html`<${TrialLine} key=${t.name} name=${t.name} trial=${t} ticks=${true} />`) : T.sourcesNone}</div>
    <div class="pc-k">${T.thresholds}</div><div data-part="thresholds">${thresholdsText(a.thresholds)}</div>
    <div class="pc-k">${T.schedule}</div><div data-part="schedule">${scheduleText(a.schedule)}</div>
    <div class="pc-k">${T.folder}</div><div data-part="folder" class="pc-folder">${fmt(T.folderLine, { path: a.folder ?? card.params?.folder ?? '' })}</div>`
}

function FailureLine({ card }) {
  const f = card.failure ?? {}
  const text = f.rolledBack ? T.rolledBack : card.kind === 'create_library' && card.result?.libraryId ? T.createdKept : T.notRolledBack
  return html`<div class="pc-failure st-t-small" data-part="failure" data-step=${f.step ?? ''} data-rolled-back=${String(f.rolledBack === true)}>${text}</div>`
}

/**
 * @param {object} p
 * @param {object} p.card - a card as the bridge gives it
 * @param {(text: string) => unknown} [p.onSend] - after 改一下: how the page sends the sentence to the main Agent
 * @param {(card: object) => void} [p.onChanged] - the card the bridge gave back after a button
 */
export function ProposalCard({ card: given, onSend, onChanged }) {
  const app = useApp()
  const [own, setOwn] = useState(null)
  const [acting, setActing] = useState(null)
  const [failed, setFailed] = useState(false)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [reviseText, setReviseText] = useState('')
  const [reviseNote, setReviseNote] = useState(null)
  const [open, setOpen] = useState(false)
  // the guard against a second press before the bridge answers (a state change only shows after the next draw)
  const inFlight = useRef(false)
  // what the bridge gave back stands until the list read again says the same (or later)
  const card = own && (!given || given.id !== own.id || given.status === 'pending') ? own : given
  if (!card) return null
  const libName = libraryNameOf(app?.libraries?.data, card.libraryId)
  const pending = card.status === 'pending'
  const create = card.kind === 'create_library'

  const act = async (name, job) => {
    if (inFlight.current) return
    inFlight.current = true
    setActing(name)
    setFailed(false)
    try {
      const next = await job()
      if (next && typeof next === 'object' && next.id === card.id) { setOwn(next); onChanged?.(next) }
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setActing(null)
    }
  }
  const confirm = () => act('confirm', () => call('confirmProposal', card.id))
  const decline = () => act('decline', () => call('declineProposal', card.id))
  const revise = () => {
    const text = reviseText.trim()
    if (!text || [...text].length > REVISE_MAX) { setReviseNote(T.reviseEmpty); return }
    setReviseNote(null)
    return act('revise', async () => {
      const next = await call('reviseProposal', card.id, text)
      setReviseOpen(false)
      setReviseText('')
      // the new card comes from the main Agent's turn; this one already says 已改
      setOwn(next)
      onChanged?.(next)
      Promise.resolve(typeof onSend === 'function' ? onSend(text) : call('agentSend', text)).catch(() => {})
      return next
    })
  }

  const busy = acting !== null
  const status = statusText(card)
  const body = pending || open
  return html`<section class=${`pc${pending ? '' : ' pc--decided'} pc--${card.status}`} data-proposal=${card.id} data-kind=${card.kind} data-status=${card.status} data-busy=${String(busy)}
    aria-label=${cardTitle(card, libName)}>
    <div class="pc-who st-t-small st-t-sub"><span class="agent-av" aria-hidden="true">${AGENT.avatar}</span>${pending ? T.head : T.headDone}</div>
    <div class="pc-title-row">
      <h3 class="pc-title" data-part="title">${cardTitle(card, libName)}</h3>
      ${status ? html`<${Chip} state=${`state-${card.status}`}><span data-part="status">${status}</span><//>` : null}
      ${card.status === 'confirmed' ? html`<span class="pc-chip pc-chip--who">${fmt(SHELL.who.agent, { date: dayText(card.decidedAt, DAY) ?? '' })}</span>` : null}
    </div>
    ${card.status === 'failed' ? html`<${FailureLine} card=${card} />` : null}
    ${card.status === 'confirmed' && create && card.result ? html`<div class="st-t-small st-t-sub" data-part="queued">${card.result.queued === false ? T.notQueued : T.queued}</div>` : null}
    ${body ? html`<div class="pc-kv">
      <div class="pc-k">${T.why}</div><div data-part="why">${card.why}</div>
      ${create ? html`<${NewLibraryBody} card=${card} />` : null}
    </div>
    ${create ? null : html`<${Diff} card=${card} />`}
    ${card.kind === 'add_source' && card.trial ? html`<div class="pc-kv" data-part="trial"><div class="pc-k">${T.trial}</div><${TrialLine} name=${card.params?.source?.name ?? null} trial=${card.trial} ticks=${false} /></div>` : null}` : null}
    ${pending ? html`<div class="pc-actions">
      <${Act} name="confirm" variant="primary" disabled=${busy} onClick=${confirm}>${create ? T.create : T.confirm}<//>
      <${Act} name="revise" disabled=${busy} onClick=${() => { setReviseOpen(o => !o); setReviseNote(null) }}>${T.revise}<//>
      <${Act} name="decline" disabled=${busy} onClick=${decline}>${T.decline}<//>
      ${busy ? html`<span class="st-t-small st-t-sub" role="status">${T.working}</span>` : html`<span class="st-t-tiny st-t-muted">${T.hint}</span>`}
    </div>` : html`<div class="pc-actions"><${Act} name="show" onClick=${() => setOpen(o => !o)}>${open ? T.hide : T.show}<//></div>`}
    ${pending && reviseOpen ? html`<div class="pc-revise" data-part="revise">
      <label class="st-t-small st-t-sub" for=${`revise-${card.id}`}>${T.reviseLabel}</label>
      <textarea id=${`revise-${card.id}`} class="agent-textarea" data-field="revise" rows="2" maxlength=${REVISE_MAX} placeholder=${T.revisePlaceholder}
        value=${reviseText} disabled=${busy} onInput=${e => setReviseText(e.currentTarget.value)}></textarea>
      <div class="pc-actions">
        <${Act} name="revise-send" variant="primary" disabled=${busy} onClick=${revise}>${T.reviseSend}<//>
        <${Act} name="revise-cancel" disabled=${busy} onClick=${() => setReviseOpen(false)}>${T.reviseCancel}<//>
        ${reviseNote ? html`<span class="st-t-small st-t-wait" role="alert">${reviseNote}</span>` : null}
      </div>
    </div>` : null}
    ${failed ? html`<div class="st-t-small st-t-wait" role="alert" data-part="call-failed">${T.callFailed}</div>` : null}
  </section>`
}
