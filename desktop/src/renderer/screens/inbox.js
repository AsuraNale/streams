// 待看 — redesign R2 (docs/checks/2026-11-11-r2/contract.md R2-1 … R2-7, R2-9; design 03-页面稿 P05–P08 and 07-模板版
// streams/app.js 「待看」 · 「待看空着时」 · 「运行与排队」 · 「连接出问题」; F24–F28, F31, F33, F38, F50, N02, N03, N09, N10), built on the
// template's parts: the list head (section-label: 「待看 · n 条」, 按评分排序, the keys, ＋ 添加链接), the cards (confirmation),
// 待评分 rows (file-row), the bar after 放弃 (progress-alert + filters), 稍后处理 and 未通过筛选 folded (phase-row), the empty page
// (empty-state + the last run's funnel, screens/run-funnel.js, + 最近收藏), the run in progress (screens/run-steps.js).
//   A card: the title (a click opens Streams' reading window: openReader(url, 'reader')), ONE line 「来源 · 日期 · 相关度 0.90 · 实质
//   0.85 · 新 / 后续」, the marks (检测到面向 AI 的指令，已忽略 · 未通过核验 · 可能重复 · 未评分 · 等了 n 天 · 未通过筛选 · 手动移入),
//   内容概述 and its points, 收藏 · 放弃 · 稍后处理. The reasons are NOT on the card: they are the right panel's 详情 of the current card
//   (推荐理由, 核验, the folded 核验记录 — what the record dialog had, which no longer opens from here — and the source line).
//   放弃 (D) takes the card off at once (dismissItem: held in the main process, nothing written); the bar 「已放弃「…」。可选择原
//   因：营销内容 · 不相关 · 内容过浅 · 重复 · 其他原因… · 撤销」: a reason → written with it (settleDismiss), 撤销 → back where it was
//   (undoDismiss, nothing written), 关闭 → written without a reason; the next 收藏 / 放弃 / 稍后处理 / 移入待看, another library, the app
//   quitting write it too (the main process), and leaving this page closes the bar (written without a reason).
//   稍后处理 (L) puts it in the folded row 「稍后处理 · n 条（下次运行后重新列入待看）」 until this library's next run has ended.
//   未通过筛选 (folded; at most the newest 50): title, the step it did not pass and its score, the reason, 移入待看 (moveToInbox).
//   ＋ 添加链接: a dialog; the link is at once a 「待评分 · 网址 · 手动添加 · 将在下次运行时评分」 row (getInbox().manual).
// Keys: J / K move, C keeps, D lets go, L 稍后处理 (not while typing, not with a modifier, not while a dialog is open).
// Words: texts/inbox.js INBOX, texts/panel.js PANEL.detail.inbox, texts/run.js RUN.
// Test hooks: [data-part="inbox-head"] with [data-part="inbox-count"][data-count], [data-part="keys"], [data-action="add-link"];
// article[data-card][data-url][data-current] with [data-action="open"] (the title), [data-part="card-line"], the marks
// [data-waiting] [data-unverified] [data-ai-instruction][title] [data-maybe-duplicate] [data-scoreless] [data-moved], [data-part=what|points],
// [data-action=keep|dismiss|later]; [data-part="dismiss-bar"][data-url] with [data-reason=<quick id>|other], [data-action=undo|
// close-bar|save-reason], [data-field="other-reason"]; [data-part="manual"] [data-manual=<url>]; [data-part="later"][data-open]
// [data-count] with [data-later=<url>]; [data-part="rejected"][data-open][data-count] with [data-rejected=<url>][data-gate]
// [data-score] and [data-action="move"]; [data-part="empty"]; [data-part="caught-waiting"]; [data-part="recent"] [data-kept=<id>];
// the dialog [data-dialog="add-link"] with [data-field=link-url|link-title], [data-action=confirm-link|cancel-link],
// [data-part="link-note"][data-kind]. 详情: [data-part="detail-inbox"] … [data-part="detail-scores"] [data-detail-score=<id>],
// [data-part="detail-check"][data-verified][data-ai-instruction], [data-part="detail-record"][data-open] (its .vd body when open),
// [data-part="detail-source"], [data-part="reasons"] [data-reason].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { isOfLibrary, useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { Dialog } from '../kit/index.js'
import { DAY, ERRORS, NEXT_WHEN, NODE_NAMES, SEP, WHEN } from '../texts/common.js'
import { INBOX as T } from '../texts/inbox.js'
import { PANEL } from '../texts/panel.js'
import { aiPhrases, VerdictFold } from './verdict-dialog.js'
import { LibraryFrame } from './library-frame.js'
import { DetailBlock } from './right-panel.js'
import { RunFunnel } from './run-funnel.js'
import { RunSteps } from './run-steps.js'

const LONG_WAIT = 14
const QUICK = ['marketing', 'irrelevant', 'shallow', 'duplicate']
const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : String(v ?? ''))
const pad = n => String(n).padStart(2, '0')
// a note's date (YYYY-MM-DD) is a local day: without a time, Date would read it as UTC midnight
const localDay = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d)

/** 相关度 0.90 · 实质 0.85 · 新: the card's scores in its one line (relevance, substance, then freshness's word). */
export function scoreWords(item) {
  const scores = item.scores ?? {}
  const ids = ['relevance', 'substance', ...Object.keys(scores).filter(k => !['relevance', 'substance', 'freshness'].includes(k))]
  const out = ids.filter(id => typeof scores[id]?.score === 'number').map(id => fmt(T.card.score, { name: nodeName(id), score: num(scores[id].score) }))
  const f = scores.freshness?.value
  if (f) out.push(Object.hasOwn(T.card.freshness, f) ? T.card.freshness[f] : String(f))
  return out
}

/** The hover line of the 「写给 AI 的话」 mark: the sentences the card's check found. */
function aiHint(item) {
  const phrases = aiPhrases(item.verification?.aiInstruction)
  return phrases.length ? fmt(T.card.aiInstructionHint, { phrases: phrases.map(p => fmt(T.card.aiInstructionPhrase, { phrase: p })).join(SEP) }) : T.card.aiInstructionNoPhrase
}

function Mark({ attrs, title, children }) {
  // the hook and the words on one inner element (its text is the mark's words, nothing else)
  return html`<span class="status-chip st-mark" title=${title}><span class="dot"></span><span ...${attrs} title=${title}>${children}</span></span>`
}

function Card({ item, isCurrent, busy, onKeep, onDismiss, onLater, onOpen, onPick }) {
  const waiting = typeof item.waitingDays === 'number' ? item.waitingDays : 0
  const scoreless = item.scoreless === true
  const moved = item.moved === 'rejected'
  const unverified = !scoreless && !moved && item.verification && item.verification.passed === false
  const line = [item.source ?? '', item.date ?? '', ...scoreWords(item)].filter(Boolean).join(SEP)
  const points = Array.isArray(item.summary?.points) ? item.summary.points : []
  return html`<article class=${`confirmation st-card${isCurrent ? ' st-current' : ''}`} data-card data-url=${item.url} data-current=${String(isCurrent)}
    aria-current=${isCurrent ? 'true' : undefined} aria-label=${T.card.label} tabindex="-1" onClick=${onPick}>
    <div class="confirm-top">
      <div class="confirm-title"><${TIcon} name="file" />
        <div><h2><a href="#" class="st-card__title" data-action="open" onClick=${e => { e.preventDefault(); e.stopPropagation(); onOpen() }}>${item.title}</a></h2>
          <small data-part="card-line">${line}</small></div>
      </div>
      <div class="st-card__marks">
        ${item.aiInstruction === true ? html`<${Mark} attrs=${{ 'data-ai-instruction': '' }} title=${aiHint(item)}>${T.card.aiInstruction}<//>` : null}
        ${unverified ? html`<${Mark} attrs=${{ 'data-unverified': '' }}>${T.card.unverified}<//>` : null}
        ${item.maybeDuplicateOf ? html`<${Mark} attrs=${{ 'data-maybe-duplicate': item.maybeDuplicateOf }}>${T.card.maybeDuplicate}<//>` : null}
        ${scoreless ? html`<${Mark} attrs=${{ 'data-scoreless': '' }}>${T.card.scoreless}<//>` : null}
        ${moved ? html`<${Mark} attrs=${{ 'data-moved': item.moved }}>${T.card.moved}<//>` : null}
        ${waiting >= LONG_WAIT ? html`<${Mark} attrs=${{ 'data-waiting': waiting }}>${fmt(T.card.waiting, { n: waiting })}<//>` : null}
      </div>
    </div>
    <div class="card-body">
      ${item.summary?.what ? html`<p class="intro-copy" data-part="what"><b>${T.card.what}</b>${item.summary.what}</p>` : null}
      ${(scoreless || moved) && item.excerpt ? html`<p class="intro-copy" data-part="excerpt"><b>${T.card.excerpt}</b>${item.excerpt}</p>` : null}
      ${points.length ? html`<dl class="decision-points" data-part="points">${points.map((p, i) => html`<div key=${i}><dt><span class="point-index">${pad(i + 1)}</span></dt><dd>${p}</dd></div>`)}</dl>` : null}
    </div>
    <div class="confirm-footer">
      <span class="muted">${scoreless ? T.card.scorelessNote : moved ? T.card.movedNote : waiting > 0 && waiting < LONG_WAIT ? html`<span data-waiting=${waiting}>${fmt(T.card.waiting, { n: waiting })}</span>` : ''}</span>
      <div class="row">
        <span class="st-act" data-action="later"><button type="button" class="btn quiet" disabled=${busy} onClick=${e => { e.stopPropagation(); onLater() }}>${T.card.later}</button></span>
        <span class="st-act" data-action="dismiss"><button type="button" class="btn" disabled=${busy} onClick=${e => { e.stopPropagation(); onDismiss() }}>${T.card.dismiss}</button></span>
        <span class="st-act" data-action="keep"><button type="button" class="btn primary" disabled=${busy} onClick=${e => { e.stopPropagation(); onKeep() }}><${TIcon} name="approve" fallback="check" />${T.card.keep}</button></span>
      </div>
    </div>
  </article>`
}

/** N03: the bar after 放弃 — a quick reason, 其他原因… (a sentence), 撤销, 关闭. */
function DismissBar({ held, busy, onReason, onUndo, onClose }) {
  const [other, setOther] = useState(null)
  return html`<div class="progress-alert st-bar" data-part="dismiss-bar" data-url=${held.url} role="status">
    <span>${fmt(T.bar.text, { title: held.title })}</span>
    <div class="filters" role="group" aria-label=${T.bar.label}>
      ${QUICK.map(id => html`<button key=${id} type="button" class="filter" data-reason=${id} disabled=${busy} onClick=${() => onReason(T.bar.quick[id], id)}>${T.bar.quick[id]}</button>`)}
      <button type="button" class=${`filter${other !== null ? ' active' : ''}`} data-reason="other" disabled=${busy} onClick=${() => setOther(o => (o === null ? '' : null))}>${T.bar.other}</button>
    </div>
    ${other !== null ? html`<div class="st-bar__other">
      <input class="st-bar__input" data-field="other-reason" placeholder=${T.bar.otherPlaceholder} value=${other} maxlength="300" autofocus
        onInput=${e => setOther(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter' && other.trim()) { e.preventDefault(); onReason(other.trim(), null) } }} />
      <span class="st-act" data-action="save-reason"><button type="button" class="btn" disabled=${busy || !other.trim()} onClick=${() => onReason(other.trim(), null)}>${T.bar.otherSave}</button></span>
    </div>` : null}
    <div class="row st-bar__end">
      <span class="st-act" data-action="undo"><button type="button" class="btn quiet" disabled=${busy} onClick=${onUndo}>${T.bar.undo}</button></span>
      <span class="st-act" data-action="close-bar"><button type="button" class="icon-btn" aria-label=${T.bar.close} title=${T.bar.close} disabled=${busy} onClick=${onClose}><${TIcon} name="close" fallback="down" /></button></span>
    </div>
  </div>`
}

/** A folded row (the template's phase-row): its number, its title and count, what is inside. */
function Fold({ part, index, title, small, count, open, onToggle, children }) {
  return html`<details class="phase-row" data-part=${part} data-open=${String(open)} data-count=${count} open=${open}
    onToggle=${e => { if (e.currentTarget.open !== open) onToggle(e.currentTarget.open) }}>
    <summary class="phase-heading"><span class="phase-index">${pad(index)}</span><span class="phase-label">${title}<small>${small}</small></span><${TIcon} name="down" /></summary>
    <div class="phase-details">${open ? children : null}</div>
  </details>`
}

/**
 * Redesign R5b (N07, P05; 维护者 11-12 第 5 条): the items of 未通过筛选 judged under the old 评分标准 (getInbox().rescore, core
 * rescoreInfo) — which part changed and when, how many, and 重新评分 with the core's estimate of model calls. A press puts it in
 * the app's one queue (startRescore: now when idle, else at the end); the button is its state. Nothing old: nothing drawn.
 */
export function RescoreAlert({ rescore, libraryId, onStarted }) {
  const R = T.rejected
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  useEvent('round-progress', p => { if (p?.rescore && p.done && isOfLibrary(p, libraryId)) setState(null) }, [libraryId])
  if (!rescore || !(rescore.total > 0)) return null
  const what = Object.hasOwn(R.changed, rescore.changedField ?? '') ? R.changed[rescore.changedField] : R.changed.other
  const when = rescore.changedAt ? whenText(rescore.changedAt, WHEN) : null
  const [lo, hi] = Array.isArray(rescore.expectedCalls) ? rescore.expectedCalls : [0, 0]
  const calls = lo === hi ? String(lo) : fmt(R.calls, { lo, hi })
  const start = async () => {
    if (state) return
    setError(null)
    setState({ kind: 'starting' })
    try {
      const r = await call('startRescore', libraryId)
      if (r?.queued) setState({ kind: 'queued', position: r.position ?? null })
      else if (r?.started) { setState({ kind: 'running' }); onStarted?.() } else setState(null)
    } catch (err) { setState(null); setError(err?.code === 'no_connection' ? R.rescoreNoConnection : R.rescoreFailed) }
  }
  const label = state?.kind === 'queued' ? fmt(R.queued, { n: state.position ?? '' }) : state ? R.rescoring : fmt(R.rescore, { calls })
  return html`<div class="progress-alert st-rescore" data-part="rescore" data-total=${rescore.total} data-changed=${rescore.changedField ?? ''} data-calls=${calls} role="status">
    <span data-part="rescore-text">${fmt(when ? R.alert : R.alertNoTime, { what, when, n: rescore.total })}</span>
    <span class="st-act" data-action="rescore"><button type="button" class="btn" disabled=${Boolean(state)} onClick=${start}>${label}</button></span>
    ${error ? html`<span class="limit-note" role="alert">${error}</span>` : null}
  </div>`
}

function AddLinkDialog({ onClose, onAdded }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const web = /^https?:\/\/\S+$/i.test(url.trim())
  const add = async () => {
    if (!web) { setNote({ kind: 'bad', text: T.link.bad }); return }
    setBusy(true)
    setNote(null)
    try {
      const r = await call('addManualLink', url.trim(), title.trim())
      if (r?.added === false) { setNote({ kind: 'seen', text: T.link.seen }); return }
      onAdded()
      onClose()
    } catch (err) { setNote({ kind: 'bad', text: err?.code === 'bad_arguments' ? T.link.bad : T.failed }) } finally { setBusy(false) }
  }
  const actions = html`<span class="st-act" data-action="cancel-link"><button type="button" class="btn quiet" disabled=${busy} onClick=${onClose}>${T.link.cancel}</button></span>
    <span class="st-act" data-action="confirm-link"><button type="button" class="btn primary" disabled=${busy || !url.trim()} onClick=${add}>${T.link.confirm}</button></span>`
  return html`<${Dialog} name="add-link" title=${T.link.title} onCancel=${onClose} actions=${actions}>
    <label class="field"><span>${T.link.urlLabel}</span><input type="url" data-field="link-url" placeholder=${T.link.urlPlaceholder} value=${url} data-dialog-initial
      onInput=${e => setUrl(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} /></label>
    <label class="field"><span>${T.link.titleLabel}</span><input data-field="link-title" value=${title} onInput=${e => setTitle(e.currentTarget.value)} /></label>
    ${note ? html`<p class="limit-note" role="status" data-part="link-note" data-kind=${note.kind}>${note.text}</p>` : null}
  <//>`
}

/** 详情 of the current card (F30): 推荐理由, 核验, the folded 核验记录, the source line; then the recent reasons for letting go. */
function CardDetail({ item, reasons }) {
  const D = PANEL.detail.inbox
  const scores = item.scores ?? {}
  const ids = ['relevance', 'substance', 'freshness', ...Object.keys(scores).filter(k => !['relevance', 'substance', 'freshness'].includes(k))].filter(id => scores[id])
  const scoreless = item.scoreless === true
  const moved = item.moved === 'rejected'
  const verified = scoreless || moved || !item.verification ? 'none' : item.verification.passed === false ? 'failed' : 'passed'
  const ai = item.aiInstruction === true
  const seen = item.firstSeen ? whenText(item.firstSeen, WHEN) : null
  return html`<${DetailBlock} where=${D.eyebrow} title=${item.title} part="detail-inbox">
    <div class="panel-section" data-part="detail-scores" data-url=${item.url}>
      <div class="section-label"><span>${D.scores}</span></div>
      ${ids.length ? html`<dl class="decision-points">${ids.map((id, i) => {
        const sc = scores[id]
        const value = typeof sc.score === 'number' ? num(sc.score) : Object.hasOwn(T.card.freshness, sc.value) ? T.card.freshness[sc.value] : String(sc.value ?? '')
        return html`<div key=${id} data-detail-score=${id}><dt><span class="point-index">${pad(i + 1)}</span>${fmt(D.score, { name: nodeName(id), score: value })}</dt><dd>${sc.reason ?? ''}</dd></div>`
      })}</dl>` : html`<p class="limit-note">${D.scoresNone}</p>`}
    </div>
    <div class="panel-section" data-part="detail-check" data-verified=${verified} data-ai-instruction=${String(ai)}>
      <div class="section-label"><span>${D.check}</span></div>
      <div class="step-line"><${TIcon} name=${verified === 'passed' ? 'check' : 'clock'} /><span>${verified === 'passed' ? D.passed : verified === 'failed' ? D.failed : D.unchecked}</span></div>
      <div class="step-line"><${TIcon} name=${ai ? 'clock' : 'check'} /><span>${ai ? D.aiYes : D.aiNo}</span></div>
      <${VerdictFold} url=${item.url} />
    </div>
    <div class="panel-section" data-part="detail-source">
      <div class="section-label"><span>${D.source}</span></div>
      <p class="limit-note">${seen ? fmt(D.sourceLine, { source: item.source ?? '', date: item.date ?? '', when: seen }) : fmt(D.sourceLineNoSeen, { source: item.source ?? '', date: item.date ?? '' })}</p>
    </div>
    <${Reasons} reasons=${reasons} />
  <//>`
}

function Reasons({ reasons }) {
  const D = PANEL.detail.inbox
  return html`<div class="panel-section" data-part="reasons">
    <div class="section-label"><span>${D.reasons}</span></div>
    ${reasons.length ? reasons.map((r, i) => html`<div key=${i} class="activity-row" data-reason=${r.reason} title=${r.title ?? ''}>${r.reason}<small>${dayText(r.ts, DAY) ?? ''}${r.title ? `${SEP}${r.title}` : ''}</small></div>`)
      : html`<p class="limit-note">${D.reasonsNone}</p>`}
  </div>`
}

export function InboxScreen() {
  const { appState, libraries, queue } = useApp()
  const libraryId = appState?.data?.library?.libraryId ?? null
  const row = (libraries?.data ?? []).find(r => r.id === libraryId) ?? null
  const inbox = useLoad(() => call('getInbox'), [libraryId])
  const home = useLoad(() => call('getHome'), [libraryId])
  useEvent('inbox-changed', p => { if (isOfLibrary(p, libraryId)) inbox.reload() }, [libraryId])
  useEvent('library-changed', () => { inbox.reload(); home.reload() }, [libraryId])
  useEvent('round-progress', p => { if (p?.done && isOfLibrary(p, libraryId)) { inbox.reload(); home.reload() } }, [libraryId])
  useEvent('connections-changed', () => home.reload(), [libraryId])
  const [current, setCurrent] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [laterOpen, setLaterOpen] = useState(false)
  const [rejectedOpen, setRejectedOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const listRef = useRef(null)
  const [focusTick, setFocusTick] = useState(0)
  const focusCurrent = () => setFocusTick(t => t + 1)
  const d = inbox.data
  const items = d?.items ?? []
  const held = d?.held ?? null
  const cur = items[current] ?? null
  const last = Math.max(0, items.length - 1)
  useEffect(() => { if (current > last) setCurrent(last) }, [items.length])
  useEffect(() => { listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' }) }, [current, items.length])
  useEffect(() => { if (focusTick > 0) listRef.current?.querySelector('[data-current="true"]')?.focus({ preventScroll: true }) }, [focusTick])
  // leaving this page (another tab, another library, another screen) closes the bar: the held 放弃 is written without a reason
  const heldRef = useRef(null)
  heldRef.current = held
  useEffect(() => () => { if (heldRef.current) call('settleDismiss', null, null).catch(() => {}) }, [libraryId])

  const act = async (fn, after) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await fn(); after?.() } catch { setError(T.failed) } finally { setBusy(false); inbox.reload(); home.reload() }
  }
  const keep = item => item && act(async () => { await call('keepItem', item.url); inbox.mutate(x => ({ ...x, items: x.items.filter(i => i.url !== item.url), held: null })) }, focusCurrent)
  const dismiss = item => item && act(async () => {
    const title = item.title
    await call('dismissItem', item.url)
    inbox.mutate(x => ({ ...x, items: x.items.filter(i => i.url !== item.url), held: { url: item.url, title } }))
  }, focusCurrent)
  const later = item => item && act(async () => { await call('laterItem', item.url); inbox.mutate(x => ({ ...x, items: x.items.filter(i => i.url !== item.url), later: [...(x.later ?? []), item], held: null })) }, focusCurrent)
  const settle = (reason, quick) => act(async () => { await call('settleDismiss', reason, quick); inbox.mutate(x => ({ ...x, held: null })) })
  const undo = () => act(async () => { await call('undoDismiss') }, focusCurrent)
  const move = url => act(async () => { await call('moveToInbox', url) })
  const open = url => { call('openReader', url, 'reader').catch(() => setError(T.failed)) }

  // the keys: one listener for the screen's life, reading the newest state from a ref (see v2's notes in git history)
  const latest = useRef(null)
  latest.current = { items, keep, dismiss, later, blocked: adding }
  const pos = useRef(0)
  pos.current = Math.min(current, last)
  useEffect(() => {
    const onKey = e => {
      const st = latest.current
      if (st.blocked || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('[data-dialog]')) return
      const k = typeof e.key === 'string' ? e.key.toLowerCase() : ''
      const end = Math.max(0, st.items.length - 1)
      const item = st.items[Math.min(pos.current, end)] ?? null
      if (k === 'j') { e.preventDefault(); pos.current = Math.min(pos.current + 1, end); setCurrent(pos.current); focusCurrent() } else if (k === 'k') { e.preventDefault(); pos.current = Math.max(0, pos.current - 1); setCurrent(pos.current); focusCurrent() } else if (k === 'c') { e.preventDefault(); st.keep(item) } else if (k === 'd') { e.preventDefault(); st.dismiss(item) } else if (k === 'l') { e.preventDefault(); st.later(item) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const running = queue?.data?.running && queue.data.running.libraryId === libraryId ? queue.data.running : null
  const h = home.data
  const problem = h?.problem ?? null
  const reasons = d?.recentDismissReasons ?? []
  const laterItems = d?.later ?? []
  const rejected = d?.rejected ?? { total: 0, items: [] }
  const manual = d?.manual ?? []
  const detail = cur ? html`<${CardDetail} key=${cur.url} item=${cur} reasons=${reasons} />`
    : d ? html`<div class="panel-summary"><span class="eyebrow">${PANEL.tabs.detail}</span><p class="st-rp-none" data-part="detail-none">${PANEL.detail.inbox.empty}</p></div><${Reasons} reasons=${reasons} />` : null
  const state = d && h ? 'ready' : inbox.status === 'error' ? 'error' : 'loading'
  const nextRun = h?.nextRun ? fmt(T.empty.next, { when: nextText(h.nextRun, NEXT_WHEN) ?? h.nextRun }) : T.empty.nextNone

  const rejectedFold = html`<${Fold} part="rejected" index=${laterItems.length ? 2 : 1} title=${T.rejected.title} small=${fmt(T.rejected.count, { n: rejected.total })} count=${rejected.total} open=${rejectedOpen} onToggle=${setRejectedOpen}>
    <${RescoreAlert} rescore=${d?.rescore ?? null} libraryId=${libraryId} onStarted=${() => inbox.reload()} />
    ${rejected.items.length ? rejected.items.map(r => html`<div key=${r.url} class="file-row" data-rejected=${r.url} data-gate=${r.gate} data-score=${r.score ?? ''} data-old=${String(r.old === true)}>
      <span class="file-icon"><${TIcon} name="file" /></span>
      <span class="file-text">${r.title || r.url}<small>${fmt(T.rejected.below, { name: nodeName(r.gate), score: num(r.score) })}${r.reason ? `${SEP}${r.reason}` : ''}</small></span>
      ${r.old === true ? html`<span class="status-chip" data-part="old">${T.rejected.old}</span>` : null}
      <span class="st-act" data-action="move"><button type="button" class="btn" disabled=${busy} onClick=${() => move(r.url)}>${T.rejected.move}</button></span>
    </div>`) : html`<p class="limit-note">${T.rejected.none}</p>`}
    ${rejected.total > rejected.items.length ? html`<p class="limit-note">${fmt(T.rejected.shown, { n: rejected.items.length })}</p>` : null}
  <//>`

  return html`<${LibraryFrame} tab="inbox" state=${state} labelledby="inbox-title" detail=${detail}>
    <div class="st-main__body thread-scroll inbox-body" ref=${listRef} data-count=${items.length}>
      <div class="thread">
        <div class="section-label st-inbox-head" data-part="inbox-head">
          <span><b id="inbox-title" data-part="inbox-count" data-count=${items.length}>${fmt(T.count, { n: items.length })}</b>${items.length ? html`${SEP}${T.sorted}` : null}</span>
          <span class="st-inbox-head__end">
            ${items.length ? html`<small class="muted" data-part="keys">${T.keys}</small>` : null}
            <span class="st-act" data-action="add-link"><button type="button" onClick=${() => setAdding(true)}><${TIcon} name="plus" /> ${T.addLink}</button></span>
          </span>
        </div>
        ${inbox.status === 'error' && !d ? html`<div class="progress-alert" role="alert">${inbox.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed} <button type="button" class="btn quiet" onClick=${() => inbox.reload()}>${ERRORS.retry}</button></div>` : null}
        ${error ? html`<div class="progress-alert" role="alert">${error}</div>` : null}
        ${running ? html`${items.length ? null : html`<div class="empty-state" data-part="run-pending"><${TIcon} name="clock" /><b>${T.running.title}</b>${T.running.note}</div>`}
          <${RunSteps} running=${running} sources=${row?.sources ?? 0} />` : null}
        ${d && !items.length && !running ? (problem && (h?.toScore ?? 0) > 0
          ? html`<div class="empty-state" data-part="caught-waiting" data-count=${h.toScore}><${TIcon} name="clock" /><b>${fmt(T.empty.caughtTitle, { n: h.toScore })}</b>${T.empty.caughtNote}</div>`
          : html`<div class="empty-state" data-part="empty"><${TIcon} name="check" /><b>${T.empty.title}</b>${nextRun}</div>`) : null}
        ${items.length ? html`<div class="st-stack">${items.map((item, i) => html`<${Card} key=${item.url} item=${item} isCurrent=${i === current} busy=${busy}
          onPick=${() => setCurrent(i)} onKeep=${() => { setCurrent(i); keep(item) }} onDismiss=${() => { setCurrent(i); dismiss(item) }} onLater=${() => { setCurrent(i); later(item) }} onOpen=${() => open(item.url)} />`)}</div>` : null}
        ${manual.length ? html`<div class="st-manual" data-part="manual">${manual.map(m => html`<div key=${m.url} class="file-row" data-manual=${m.url}>
          <span class="file-icon"><${TIcon} name="clip" fallback="file" /></span><span class="file-text">${m.url}<small>${m.title ? `${m.title}${SEP}` : ''}${T.manual.note}</small></span>
          <span class="status-chip">${T.manual.tag}</span></div>`)}</div>` : null}
        ${held ? html`<${DismissBar} key=${held.url} held=${held} busy=${busy} onReason=${settle} onUndo=${undo} onClose=${() => settle(null, null)} />` : null}
        ${d && !items.length && !running && h ? html`<${RunFunnel} lastRun=${h.lastRun} />
          <div class="panel-section" data-part="recent">
            <div class="section-label"><span>${T.empty.recent}</span></div>
            ${(h.recentKept ?? []).length ? h.recentKept.map(k => html`<button key=${k.id} type="button" class="file-row" data-kept=${k.id} onClick=${() => k.source && /^https?:/i.test(k.source) && open(k.source)}>
              <span class="file-icon"><${TIcon} name="file" /></span><span class="file-text">${k.title}<small>${fmt(T.empty.recentLine, { source: k.source_name ?? '', when: dayText(localDay(k.kept), DAY) ?? '' })}</small></span><${TIcon} name="arrow" /></button>`)
              : html`<p class="limit-note">${T.empty.recentNone}</p>`}
          </div>` : null}
        ${laterItems.length ? html`<${Fold} part="later" index=${1} title=${T.later.title} small=${fmt(T.later.count, { n: laterItems.length })} count=${laterItems.length} open=${laterOpen} onToggle=${setLaterOpen}>
          ${laterItems.map(it => html`<button key=${it.url} type="button" class="file-row" data-later=${it.url} onClick=${() => open(it.url)}>
            <span class="file-icon"><${TIcon} name="clock" /></span><span class="file-text">${it.title}<small>${fmt(T.later.line, { source: it.source ?? '', date: it.date ?? '' })}</small></span><${TIcon} name="arrow" /></button>`)}
        <//>` : null}
        ${d && rejected.total > 0 ? rejectedFold : null}
      </div>
    </div>
    ${adding ? html`<${AddLinkDialog} onClose=${() => setAdding(false)} onAdded=${() => inbox.reload()} />` : null}
  <//>`
}
