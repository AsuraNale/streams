// The one kind of 提议 — redesign R5b (docs/checks/2026-11-12-r5b/contract.md R5b-1; F16, F17, N05; design 07-模板版 streams/app.js
// proposal() and smallCard(), 03-页面稿 P03 · P13 · P16 · P08; the 动作表 维护者 saw on 11-11 and his three answers of 11-12).
// One component, two sizes, both the template's `confirmation`:
//   full     in a conversation (主 Agent, 问库): a 主 Agent 提议 — the title (动作 + 对象: 创建库：<库名> · 修改追踪要求 · 修改单次
//            运行上限 …), 「主 Agent 提议 · 确认后生效」, the library's name as `confirm-number`, the points (`decision-points`): a new
//            library's 追踪要求 / 严格程度 (the level's name and one sentence) / 主题与来源 (each source's test fetch) / 定时与上限,
//            any other kind's 修改前 / 修改后 (an added source's test fetch as a third point); at the foot 存储位置 and 「确认后记入
//            变更记录」, then 拒绝 · 提出修改 · 确认 (创建 on a new library) — the quiet one on the left, the main one on the right. Once
//            decided it is ONE LINE (the template's after-card): its title and what became of it — 已生效 · <时间> · 已拒绝 · 已提出
//            修改 · 设置已变更，该提议已失效 · 未能执行 (with the kind of failure and what to do, never the raw error).
//   compact  in the right panel's 待确认 (screens/right-panel.js): every library's 主 Agent 提议 and 系统检测 — its line on top
//            (「主 Agent 提议 · <库名>」 · 「系统检测 · <库名>」), its title, one line (what it changes to · the evidence in the
//            interface's words), its buttons, done right there (no page to go to: only 修改地址 and 提出修改 lead elsewhere).
//            A 系统检测's buttons are its actions of the 动作表 as listToConfirm gives them (the main one first), drawn the other
//            way round: 忽略 on the left, the main one on the right. 交由主 Agent 分析 and 生成修改提议 call the main agent: a line
//            under them says so, with the calls one message of the main agent takes (AGENT_CALLS, 05 规则 8). Handled, it leaves
//            the list (useToConfirm drop + the bridge's events).
//   修改地址  actOnSuggestion answers where to go: that library's 来源与要求 with the row's 修改地址 dialog open (screens/sources.js
//            params.editAddress; R4b's template dialog); once the address is changed the core expires the card (R5a).
//   提出修改  opens one line to write in on the card; sent, the proposal is 已提出修改 (reviseProposal) and the sentence goes to the
//            main agent's conversation (the page's own way of sending, else agentSend — and from the right panel, the 主 Agent page).
//   创建      a new library confirmed: the app goes to that library's 待看 (02 第 39 行); its first run is queued by the core.
// Nothing on a card shows a threshold's number, a kind's name, JSON, a raw error or an HTTP code (O9), or a word 05 no longer uses.
// Test hooks: full — [data-proposal=<id>][data-kind][data-status][data-busy][data-size="full"], [data-part=title|from|library|
// points|brief|thresholds|topics|sources|schedule|before|after|trial|note|folder|status|failure|revise|call-failed],
// [data-trial=<name>][data-state][data-include], [data-keyword], [data-name][data-changed]; compact — [data-decide=<item id>]
// [data-from=agent|system][data-kind][data-library][data-busy] with [data-proposal-id] or [data-suggestion=<key>], [data-part=from|
// sentence|evidence|calls-model|call-failed|revise]; both — [data-action=decline|revise|confirm|revise-send|revise-cancel|
// pause-source|edit-address|set-strictness|forward|draft-proposal|dismiss], textarea[data-field="revise"].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, whenText } from '../lib/format.js'
import { TIcon } from '../lib/template-icons.js'
import { levelOf, placeOf } from '../lib/strictness.js'
import { CONNECTIONS, FETCH_STATES, PUNCT, WHEN } from '../texts/common.js'
import { INBOX } from '../texts/inbox.js'
import { PROPOSALS as T } from '../texts/proposals.js'

const C = T.card
const REVISE_MAX = 2000
// redesign R6b-3: the marks between names, by language (texts/common.js PUNCT) — they were full-width marks written here
const LIST = PUNCT.list

/**
 * The model calls one message of the main agent takes (the line under the 主 Agent page's box, and beside 交由主 Agent 分析 /
 * 生成修改提议 — 05 规则 8): usually lo–hi — one call for its answer, one more for each round of lookups (the core allows
 * MAX_LOOKUP_ROUNDS = 3 rounds); at most max — precheck fix 3: an answer not usable is asked once more, a session that will not
 * resume is opened again, the conversation's summary may take two (core agent/turn.mjs TURN_CALLS: (1 + 3) × 2 × 2 + 2 = 18;
 * core/test/r5b.test.mjs drives agentTurn to 1, 4 and 18; test/ui-r5b.test.mjs holds this equal to the core's).
 */
export const AGENT_CALLS = Object.freeze({ lo: 1, hi: 4, max: 18 })

/** A library's name from the app's list of libraries (lib/libraries.js rows), or null. */
export function libraryNameOf(rows, id) {
  if (!id || !Array.isArray(rows)) return null
  return rows.find(r => r.id === id)?.name ?? null
}

/** A 主 Agent 提议 (a card of listProposals) as an item of the one kind (the shape of listToConfirm's). */
export function agentItem(card, libraryName = null) {
  return {
    id: `agent:${card.id}`, from: 'agent', proposalId: card.id, card, kind: card.kind, status: card.status, libraryId: card.libraryId ?? null,
    libraryName: card.libraryId ? libraryName : (card.params?.name ?? null),
  }
}

const countOf = v => (v && typeof v.count === 'number' ? v.count : Array.isArray(v?.names) ? v.names.length : 0)
const list = a => (Array.isArray(a) ? a : [])

// ---- words ------------------------------------------------------------------------------------------------------------

/**
 * 自定义 on a proposal (redesign R5b, precheck fix 1): no one edited a main agent's proposal by hand, so the card says where the
 * pair stands against the three levels — by both pass thresholds at once (lib/strictness.js placeOf) — never the numbers.
 */
function customText(t) {
  const p = placeOf(t)
  const name = l => C.levelNames[l]
  const where = p.lo && p.hi ? fmt(C.customWhere.between, { lo: name(p.lo), hi: name(p.hi) })
    : p.lo ? fmt(C.customWhere.above, { level: name(p.lo) })
      : p.hi ? fmt(C.customWhere.below, { level: name(p.hi) })
        : C.customWhere.apart
  return fmt(C.customLevel, { where })
}
const levelText = t => (levelOf(t) === 'custom' ? customText(t) : C.levels[levelOf(t)])
/** 修改前 and 修改后 that read the same (自定义 to 自定义 in the same place): which requirement got stricter or looser, no number. */
function thresholdsDelta(before, after) {
  const parts = ['relevance', 'substance'].flatMap(k => {
    const a = after?.[k]
    const b = before?.[k]
    if (typeof a !== 'number' || typeof b !== 'number' || a === b) return []
    return [fmt(a > b ? C.delta.stricter : C.delta.looser, { name: C.delta.names[k] })]
  })
  return parts.length ? fmt(C.delta.line, { parts: parts.join(C.delta.join) }) : ''
}
const scheduleText = s => (s && typeof s === 'object' && s.enabled ? fmt(C.scheduleOn, { time: s.time ?? '' }) : C.scheduleOff)
const capText = n => (typeof n === 'number' ? fmt(C.capLine, { n }) : C.capDefault)
const trialState = t => (t && Object.hasOwn(FETCH_STATES, t.status) ? FETCH_STATES[t.status] : '')
const quickWords = q => (Object.hasOwn(INBOX.bar.quick, q ?? '') ? INBOX.bar.quick[q] : String(q ?? ''))

/** A 系统检测's key of words: 地址无效 has its own (R5a services/agent.mjs systemItem). */
const systemKey = item => (item.kind === 'source-failing' && item.evidence?.state === 'gap' ? 'source-failing-gap' : item.kind)

/** The title: 动作 + 对象 for a 主 Agent 提议, the finding for a 系统检测. */
export function proposalTitle(item) {
  if (item?.from === 'system') {
    const e = item.evidence ?? {}
    const key = systemKey(item)
    const template = Object.hasOwn(T.kinds, key) ? T.kinds[key] : T.kinds.other
    return fmt(template, {
      subject: item.subject ?? '', n: key === 'dismiss-reason' ? e.count ?? 0 : e.rounds ?? 0, other: item.otherLibraryName ?? C.unknownLibrary,
      pct: e.percent ?? Math.round((e.jaccard ?? 0) * 100), reason: quickWords(e.quick ?? item.subject),
    })
  }
  const card = item?.card ?? item ?? {}
  const p = card.params ?? {}
  switch (card.kind) {
    case 'create_library': return fmt(C.titles.create_library, { name: p.name ?? '' })
    case 'add_source': return fmt(C.titles.add_source, { name: p.source?.name ?? '' })
    case 'remove_source': return fmt(C.titles.remove_source, { name: p.name ?? '' })
    case 'pause_source': return fmt(p.paused === false ? C.titles.resume_source : C.titles.pause_source, { name: p.name ?? '' })
    default: return Object.hasOwn(C.titles, card.kind ?? '') ? C.titles[card.kind] : C.titles.other
  }
}

/** One side of a 主 Agent 提议 (before / after) as one line of words. */
export function sideText(card, side) {
  const view = side === 'after' ? card?.after : card?.before
  if (!view || typeof view !== 'object') return ''
  if (card.kind === 'run_round') {
    if (side === 'before') return view.lastRoundAt ? fmt(C.runBefore, { when: whenText(view.lastRoundAt, WHEN) ?? '' }) : C.runNever
    return fmt(C.runAfter, { n: view.cap ?? 0 })
  }
  if ('sources' in view) {
    const names = list(view.sources?.names)
    const paused = new Set(list(view.sources?.paused))
    return names.length ? fmt(C.sourcesLine, { n: countOf(view.sources), names: names.map(n => `${n}${paused.has(n) ? C.pausedMark : ''}`).join(LIST) }) : C.sourcesNone
  }
  if ('topics' in view) {
    const topics = list(view.topics)
    return topics.length ? fmt(C.topicsLine, { topics: topics.map(t => (list(t.keywords).length ? `${t.name}${PUNCT.open}${t.keywords.join(LIST)}${PUNCT.close}` : t.name)).join(PUNCT.semi) }) : C.topicsNone
  }
  if ('brief' in view) return typeof view.brief === 'string' && view.brief ? view.brief : C.briefNone
  if ('thresholds' in view) {
    const text = levelText(view.thresholds)
    const other = side === 'after' ? card?.before?.thresholds : null
    // the same words on both sides: say what changed (redesign R5b, precheck fix 1)
    const delta = other && levelText(other) === text ? thresholdsDelta(other, view.thresholds) : ''
    return delta ? `${text}${C.delta.sep}${delta}` : text
  }
  if ('schedule' in view) return scheduleText(view.schedule)
  if ('cap' in view) return capText(view.cap)
  return ''
}

/** The small card's one line: what a 主 Agent 提议 changes to, or a 系统检测's evidence — in the interface's words. */
export function proposalLine(item) {
  if (item?.from === 'system') {
    const e = item.evidence ?? {}
    const when = v => whenText(v, WHEN) ?? T.evidence.none
    switch (systemKey(item)) {
      case 'source-failing-gap': return fmt(T.evidence['source-failing-gap'], { n: e.gap ?? e.rounds ?? 0, when: e.last?.ts ? when(e.last.ts) : T.evidence.none })
      case 'source-failing': return fmt(T.evidence['source-failing'], { failed: e.failed ?? 0, blocked: e.blocked ?? 0, when: e.last?.ts ? when(e.last.ts) : T.evidence.none })
      case 'no-output': return e.since ? fmt(T.evidence['no-output'], { when: when(e.since) }) : T.evidence.none
      case 'ai-instruction': {
        const phrase = list(e.phrases).find(x => typeof x === 'string' && x.trim())
        return phrase ? fmt(T.evidence['ai-instruction'], { n: e.count ?? 0, phrase }) : fmt(T.evidence['ai-instruction-plain'], { n: e.count ?? 0 })
      }
      case 'topic-overlap': return list(e.shared).length ? fmt(T.evidence['topic-overlap'], { shared: e.shared.join(LIST) }) : T.evidence.none
      case 'dismiss-reason': return T.evidence['dismiss-reason-plain']
      default: return T.evidence.none
    }
  }
  const card = item?.card ?? {}
  if (card.kind === 'create_library') {
    const a = card.after ?? {}
    const trials = list(card.trial)
    const sources = trials.length ? trials.filter(t => t.include !== false).length : countOf(a.sources)
    return fmt(C.createSummary, { sources, topics: list(a.topics).length, schedule: scheduleText(a.schedule) })
  }
  if (card.kind === 'run_round') return C.runSummary
  return fmt(C.changedSummary, { after: sideText(card, 'after') })
}

/** What became of a decided one, as its line says it (null while it waits). */
export function stateText(item) {
  const card = item?.card ?? item ?? {}
  const when = whenText(card.decidedAt ?? item?.at, WHEN) ?? ''
  switch (card.status ?? item?.status) {
    case 'confirmed': return fmt(T.states.confirmed, { when })
    case 'declined': return T.states.declined
    case 'revise': return T.states.revise
    case 'stale': return card.reason === 'library-gone' ? T.states.staleGone : card.reason === 'folder_not_empty' ? T.states.staleFolder : T.states.stale
    case 'failed': return T.states.failed
    case 'dismissed': return T.states.dismissed
    case 'accepted': return T.states.accepted
    case 'acted': return fmt(T.states.acted, { when })
    case 'expired': return T.states.expired
    default: return null
  }
}

/** A failed 主 Agent 提议: its kind of failure and what to do (public-data.mjs: category and advice, never the raw text). */
export function failureText(card) {
  const f = card?.failure ?? {}
  if (f.category === 'error' && f.rolledBack !== true) return T.advice.failureNotRolledBack
  return Object.hasOwn(T.advice, f.advice ?? '') ? T.advice[f.advice] : f.category === 'refused' ? T.advice.failureRefused : T.advice.failureError
}

/** An action's words: the 动作表's label key (actions.<word>) with its values (将严格程度调整为「标准」). */
function actionLabel(a) {
  const key = String(a.label ?? '').replace(/^actions\./, '')
  const template = Object.hasOwn(T.actions, key) ? T.actions[key] : key
  return fmt(template, { level: Object.hasOwn(C.levelNames, a.level ?? a.values?.level ?? '') ? C.levelNames[a.level ?? a.values.level] : '' })
}

// ---- parts ------------------------------------------------------------------------------------------------------------

function Points({ rows }) {
  return html`<dl class="decision-points" data-part="points">${rows.map(([label, body], i) => html`<div key=${i}>
    <dt><span class="point-index">${String(i + 1).padStart(2, '0')}</span>${label}</dt><dd>${body}</dd>
  </div>`)}</dl>`
}

/** A source's test fetch: its name, its state and count; one that is not added says so. */
function TrialLine({ name, trial }) {
  const include = trial?.include !== false
  return html`<span class="st-trial" data-trial=${name ?? ''} data-state=${trial?.status ?? ''} data-include=${String(include)}>
    ${name ? html`<b>${name}</b>` : null}
    <span class="status-chip" data-part="trial-chip">${fmt(C.trialChip, { state: trialState(trial), n: trial?.count ?? 0 })}</span>
    ${include ? null : html`<small class="muted" data-part="unticked">${C.unticked}</small>`}
  </span>`
}

function SourcesView({ view, other, side }) {
  const names = list(view?.names)
  if (!names.length) return html`<span>${C.sourcesNone}</span>`
  const them = new Set(list(other?.names))
  const paused = new Set(list(view?.paused))
  const otherPaused = new Set(list(other?.paused))
  return html`<span>${fmt(C.sourcesLine, { n: countOf(view), names: '' })}${names.map((n, i) => {
    const changed = !them.has(n) || paused.has(n) !== otherPaused.has(n)
    return html`<span key=${n}>${i ? LIST : ''}<span class=${changed ? 'st-changed' : undefined} data-name=${n} data-changed=${String(changed)} data-side=${side}>${n}${paused.has(n) ? C.pausedMark : ''}</span></span>`
  })}</span>`
}

function TopicsView({ view, other }) {
  const topics = list(view?.topics)
  if (!topics.length) return html`<span>${C.topicsNone}</span>`
  const them = new Map(list(other?.topics).map(t => [t.name, new Set(list(t.keywords))]))
  return html`<span>${topics.map((t, i) => {
    const known = them.get(t.name)
    return html`<span key=${t.name} data-topic=${t.name}>${i ? PUNCT.semi : ''}<span class=${known ? undefined : 'st-changed'} data-name=${t.name} data-changed=${String(!known)}>${t.name}</span>${list(t.keywords).length ? html`${PUNCT.open}${t.keywords.map((k, j) => html`<span key=${k}>${j ? LIST : ''}<span class=${known && !known.has(k) ? 'st-changed' : undefined} data-keyword=${k} data-changed=${String(Boolean(known) && !known.has(k))}>${k}</span></span>`)}${PUNCT.close}` : null}</span>`
  })}</span>`
}

function SideView({ card, side }) {
  const view = side === 'after' ? card.after : card.before
  const other = side === 'after' ? card.before : card.after
  if (view && typeof view === 'object' && 'sources' in view) return html`<${SourcesView} view=${view.sources} other=${other?.sources} side=${side} />`
  if (view && typeof view === 'object' && 'topics' in view) return html`<${TopicsView} view=${view} other=${other} />`
  return html`<span>${sideText(card, side)}</span>`
}

/** The points of a 主 Agent 提议. */
function CardPoints({ card }) {
  const P = C.points
  if (card.kind === 'create_library') {
    const a = card.after ?? {}
    const topics = list(a.topics)
    const trials = list(card.trial)
    return html`<${Points} rows=${[
      [P.brief, html`<span data-part="brief">${a.brief || C.briefNone}</span>`],
      [P.strictness, html`<span data-part="thresholds">${levelText(a.thresholds ?? { relevance: 0.5, substance: 0.6 })}</span>`],
      [P.topicsSources, html`<span data-part="topics">${topics.length ? topics.map((t, i) => html`<span key=${t.name} data-topic=${t.name}>${i ? ' · ' : ''}${t.name}${list(t.keywords).length ? html`${PUNCT.open}${t.keywords.map((k, j) => html`<span key=${k}>${j ? LIST : ''}<span data-keyword=${k}>${k}</span></span>`)}${PUNCT.close}` : null}</span>`) : C.topicsNone}</span>
        <span class="st-trials" data-part="sources">${trials.length ? trials.map(t => html`<${TrialLine} key=${t.name} name=${t.name} trial=${t} />`) : C.sourcesNone}</span>`],
      [P.scheduleCap, html`<span data-part="schedule">${scheduleText(a.schedule)}</span><span data-part="cap"> · ${capText(a.cap)}</span>`],
    ]} />`
  }
  const rows = [
    [P.before, html`<div data-part="before"><${SideView} card=${card} side="before" /></div>`],
    [P.after, html`<div data-part="after"><${SideView} card=${card} side="after" /></div>`],
  ]
  if (card.kind === 'add_source' && card.trial && !Array.isArray(card.trial)) rows.push([P.trial, html`<div data-part="trial"><${TrialLine} name=${card.params?.source?.name ?? null} trial=${card.trial} /></div>`])
  return html`<${Points} rows=${rows} />`
}

function Btn({ name, kind = '', disabled, onClick, title, children }) {
  return html`<span class="st-act" data-action=${name}><button type="button" class=${`btn${kind ? ` ${kind}` : ''}`} disabled=${disabled} title=${title} onClick=${onClick}>${children}</button></span>`
}

/** The guard of a card's buttons: one press at a time, every button disabled until the bridge answers. */
function useActing() {
  const [acting, setActing] = useState(null)
  const [error, setError] = useState(null)
  const inFlight = useRef(false)
  const run = async (name, job) => {
    if (inFlight.current) return undefined
    inFlight.current = true
    setActing(name)
    setError(null)
    try { return await job() } catch (err) { setError(err); return undefined } finally {
      inFlight.current = false
      setActing(null)
    }
  }
  return { acting, busy: acting !== null, error, setError, run }
}

/** 提出修改's one line. */
function ReviseLine({ id, busy, onSend, onCancel }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState(null)
  const send = () => {
    const t = text.trim()
    if (!t || [...t].length > REVISE_MAX) { setNote(C.reviseEmpty); return }
    setNote(null)
    onSend(t)
  }
  return html`<div class="st-revise" data-part="revise">
    <label class="field"><span>${C.reviseLabel}</span>
      <textarea id=${`revise-${id}`} data-field="revise" rows="2" maxlength=${REVISE_MAX} placeholder=${C.revisePlaceholder} value=${text} disabled=${busy}
        onInput=${e => setText(e.currentTarget.value)}></textarea></label>
    <div class="row">
      ${note ? html`<span class="limit-note" role="alert">${note}</span>` : null}
      <${Btn} name="revise-cancel" kind="quiet" disabled=${busy} onClick=${onCancel}>${C.reviseCancel}<//>
      <${Btn} name="revise-send" kind="primary" disabled=${busy} onClick=${send}>${C.reviseSend}<//>
    </div>
  </div>`
}

/** What a failed press says (no raw error: the kind of failure in words). */
function errorWords(err) {
  if (err?.code === 'no_connection') return C.noConnection
  if (err?.code === 'bad_arguments') return C.gone
  return C.callFailed
}

/**
 * A 主 Agent 提议's three answers, the same on both sizes: 确认 / 创建 → confirmProposal (a new library: its 待看 next), 拒绝 →
 * declineProposal, 提出修改 → reviseProposal + the sentence to the main agent. → { act, busy, error, … }
 */
function useAgentActions(item, { onChanged, onSend, compact }) {
  const app = useApp()
  const a = useActing()
  const id = item.proposalId
  const done = next => {
    if (next && typeof next === 'object' && next.id === id) onChanged?.(next)
    if (next?.status !== 'pending') app?.toConfirm?.drop?.(item.id)
    // from the right panel, a proposal that no longer fits or could not be carried out leaves the list: the list says what became
    // of it (the conversation's card says it on its own line)
    if (compact && (next?.status === 'stale' || next?.status === 'failed')) {
      const it = { ...item, card: next, status: next.status }
      app?.toConfirm?.say?.(fmt(C.saidLine, { title: proposalTitle(it), state: [stateText(it), next.status === 'failed' ? failureText(next) : null].filter(Boolean).join(' ') }))
    }
    return next
  }
  const confirm = () => a.run('confirm', async () => {
    const next = done(await call('confirmProposal', id))
    // 02 第 39 行: a new library confirmed — its 待看 (its first run queued by the core)
    if (next?.status === 'confirmed' && next.kind === 'create_library' && next.result?.libraryId) await app?.openLibrary?.(next.result.libraryId, { screen: 'inbox', params: {} })
    return next
  })
  const decline = () => a.run('decline', async () => done(await call('declineProposal', id)))
  const revise = text => a.run('revise', async () => {
    const next = done(await call('reviseProposal', id, text))
    const sent = typeof onSend === 'function' ? onSend(text) : call('agentSend', text, item.libraryId ? { libraryId: item.libraryId } : null)
    Promise.resolve(sent).catch(() => {})
    // from the right panel, away from the conversation: the 主 Agent page, where the main agent answers
    if (compact && app?.route?.screen !== 'chat') app?.navigate?.('chat', {})
    return next
  })
  return { ...a, confirm, decline, revise }
}

// ---- the full card ----------------------------------------------------------------------------------------------------

/** A 主 Agent 提议 in a conversation (pending: the whole card; decided: one line). */
function FullCard({ item, onSend, onChanged }) {
  const [reviseOpen, setReviseOpen] = useState(false)
  const act = useAgentActions(item, { onChanged, onSend, compact: false })
  const card = item.card
  const title = proposalTitle(item)
  if (card.status !== 'pending') {
    return html`<div class="after-card st-proposal-done" data-proposal=${card.id} data-kind=${card.kind} data-status=${card.status} data-size="full" aria-label=${title}>
      <${TIcon} name=${card.status === 'confirmed' ? 'check' : card.status === 'declined' ? 'close' : 'clock'} fallback=${card.status === 'confirmed' ? 'check' : 'clock'} />
      <b data-part="title">${title}</b><span>·</span><span data-part="status">${stateText(item)}</span>
      ${card.status === 'failed' ? html`<span>·</span><span data-part="failure" data-rolled-back=${String(card.failure?.rolledBack === true)}>${failureText(card)}</span>` : null}
      ${card.status === 'confirmed' && card.kind === 'create_library' && card.result?.queued === false ? html`<span>·</span><span data-part="queued">${C.notQueued}</span>` : null}
    </div>`
  }
  const create = card.kind === 'create_library'
  const folder = card.after?.folder ?? card.params?.folder ?? null
  const library = create ? card.params?.name ?? '' : item.libraryName ?? C.unknownLibrary
  return html`<article class="confirmation st-proposal" data-proposal=${card.id} data-kind=${card.kind} data-status=${card.status} data-busy=${String(act.busy)} data-size="full" aria-label=${title}>
    <div class="confirm-top">
      <div class="confirm-title"><${TIcon} name="file" /><div><h2 data-part="title">${title}</h2><small data-part="from">${C.sub}</small></div></div>
      <span class="confirm-number" data-part="library">${library}</span>
    </div>
    <div class="card-body"><${CardPoints} card=${card} /></div>
    <div class="confirm-footer">
      <span class="muted" data-part="note">${create && folder ? html`<span data-part="folder">${fmt(C.folder, { path: folder })}</span> · ` : null}${C.recorded}</span>
      <div class="row">
        ${act.busy ? html`<span class="limit-note" role="status">${C.working}</span>` : null}
        <${Btn} name="decline" kind="quiet" disabled=${act.busy} onClick=${act.decline}>${T.actions.decline}<//>
        <${Btn} name="revise" disabled=${act.busy} onClick=${() => setReviseOpen(o => !o)}>${T.actions.revise}<//>
        <${Btn} name="confirm" kind="primary" disabled=${act.busy} onClick=${act.confirm}><${TIcon} name="approve" fallback="check" />${create ? T.actions.create : T.actions.confirm}<//>
      </div>
    </div>
    ${reviseOpen ? html`<${ReviseLine} id=${card.id} busy=${act.busy} onCancel=${() => setReviseOpen(false)} onSend=${t => { setReviseOpen(false); act.revise(t) }} />` : null}
    ${act.error ? html`<p class="limit-note" role="alert" data-part="call-failed">${errorWords(act.error)}</p>` : null}
  </article>`
}

// ---- the compact card -------------------------------------------------------------------------------------------------

function CompactAgent({ item, onChanged }) {
  const [reviseOpen, setReviseOpen] = useState(false)
  const act = useAgentActions(item, { onChanged, compact: true })
  const create = item.kind === 'create_library'
  return html`
    <div class="confirm-footer" data-busy=${String(act.busy)}><div class="row">
      <${Btn} name="decline" kind="quiet" disabled=${act.busy} onClick=${act.decline}>${T.actions.decline}<//>
      <${Btn} name="revise" disabled=${act.busy} onClick=${() => setReviseOpen(o => !o)}>${T.actions.revise}<//>
      <${Btn} name="confirm" kind="primary" disabled=${act.busy} onClick=${act.confirm}><${TIcon} name="approve" fallback="check" />${create ? T.actions.create : T.actions.confirm}<//>
    </div></div>
    ${reviseOpen ? html`<${ReviseLine} id=${item.proposalId} busy=${act.busy} onCancel=${() => setReviseOpen(false)} onSend=${t => { setReviseOpen(false); act.revise(t) }} />` : null}
    ${act.error ? html`<p class="limit-note" role="alert" data-part="call-failed">${errorWords(act.error)}</p>` : null}
    <${Busy} busy=${act.busy} />`
}

const Busy = ({ busy }) => (busy ? html`<p class="limit-note" role="status" data-part="working">${C.working}</p>` : null)

function CompactSystem({ item }) {
  const app = useApp()
  const act = useActing()
  const [said, setSaid] = useState(null)
  const actions = list(item.actions).slice().reverse()
  const press = a => act.run(a.id, async () => {
    setSaid(null)
    let r
    try { r = await call('actOnSuggestion', item.libraryId, item.key, a.id) } catch (err) {
      // a card that no longer fits (the core expired it): the list is read again, the card leaves it
      if (err?.code === 'bad_arguments') { app?.toConfirm?.say?.(fmt(C.saidLine, { title: proposalTitle(item), state: C.gone })); app?.toConfirm?.reload?.() }
      throw err
    }
    if (r?.navigate) {
      // 修改地址: that library's 来源与要求, the row's 修改地址 dialog open (the change itself is updateSource's)
      await app?.openLibrary?.(r.navigate.libraryId ?? item.libraryId, { screen: 'sources', params: { editAddress: r.navigate.source ?? item.subject } })
      return r
    }
    if (r?.done) { app?.toConfirm?.drop?.(item.id); return r }
    if (r?.failure) {
      const code = r.failure.code
      setSaid(fmt(C.forwardFailed, { reason: Object.hasOwn(CONNECTIONS.codes, code ?? '') ? CONNECTIONS.codes[code] : CONNECTIONS.codes.unknown }))
    } else if (r?.status === 'expired') { app?.toConfirm?.say?.(fmt(C.saidLine, { title: proposalTitle(item), state: C.gone })); app?.toConfirm?.reload?.() }
    return r
  })
  const models = actions.filter(a => a.callsModel)
  const error = act.error ? errorWords(act.error) : null
  return html`
    ${models.length ? html`<p class="limit-note" data-part="calls-model">${models.map(a => fmt(T.callsModelOf, { action: actionLabel(a), ...AGENT_CALLS })).join(' ')}</p>` : null}
    <div class="confirm-footer" data-busy=${String(act.busy)}><div class="row">
      ${actions.map(a => html`<${Btn} key=${a.id} name=${a.id} kind=${a.primary ? 'primary' : a.id === 'dismiss' ? 'quiet' : ''} disabled=${act.busy}
        title=${a.callsModel ? fmt(T.callsModel, AGENT_CALLS) : T.noModel} onClick=${() => press(a)}>${actionLabel(a)}<//>`)}
    </div></div>
    ${said || error ? html`<p class="limit-note" role="alert" data-part="call-failed">${said ?? error}</p>` : null}
    <${Busy} busy=${act.busy} />`
}

/** The small card of the right panel's 待确认 (both kinds). */
function CompactCard({ item, onChanged }) {
  const from = item.from === 'system' ? T.from.system : T.from.agent
  const library = item.libraryName ?? (item.kind === 'create_library' ? C.newLibrary : C.unknownLibrary)
  const attrs = item.from === 'system' ? { 'data-suggestion': item.key } : { 'data-proposal-id': item.proposalId }
  return html`<article class="confirmation st-rp-decide" data-decide=${item.id} data-from=${item.from} data-kind=${item.kind} data-library=${item.libraryId ?? ''} data-size="compact" ...${attrs}>
    <div class="card-body">
      <span class="eyebrow" data-part="from">${fmt(C.eyebrow, { from, library })}</span>
      <h3 data-part="sentence">${proposalTitle(item)}</h3>
      <p class="muted" data-part="evidence">${proposalLine(item)}</p>
    </div>
    ${item.from === 'system' ? html`<${CompactSystem} item=${item} />` : html`<${CompactAgent} item=${item} onChanged=${onChanged} />`}
  </article>`
}

/**
 * @param {object} p
 * @param {object} p.item - an item of the one kind: listToConfirm's, or agentItem(card) for a card of listProposals
 * @param {'full'|'compact'} [p.size]
 * @param {(text: string) => unknown} [p.onSend] - after 提出修改: how the page sends the sentence to the main agent
 * @param {(card: object) => void} [p.onChanged] - the card the bridge gave back after a button
 */
export function Proposal({ item, size = 'full', onSend, onChanged }) {
  if (!item) return null
  if (size === 'compact') return html`<${CompactCard} item=${item} onChanged=${onChanged} />`
  if (item.from !== 'agent' || !item.card) return null
  return html`<${FullCard} item=${item} onSend=${onSend} onChanged=${onChanged} />`
}
