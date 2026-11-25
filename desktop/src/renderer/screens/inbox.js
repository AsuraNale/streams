// 待看 — redesign R2 (docs/checks/2026-11-11-r2/contract.md R2-1 … R2-7, R2-9; design 03-页面稿 P05–P08 and 07-模板版
// streams/app.js 「待看」 · 「待看空着时」 · 「运行与排队」 · 「连接出问题」; F24–F28, F31, F33, F38, F50, N03, N09, N10), built on the
// template's parts: the list head (section-label: 「待看 · n 条」, the order, the keys), the cards (confirmation), the bar after
// 放弃 (progress-alert + filters), 稍后处理 folded (phase-row), the empty page (empty-state + the last run in one line,
// screens/run-steps.js LastRun, + 最近收藏), the run in progress (screens/run-steps.js RunSteps).
//   A card (1.1 W6a): the title (a click opens Streams' reading window: openReader(url, 'reader')), ONE line 「来源 · 发布于 日期 ·
//   已存原文」, the marks (原文未存下 · 摘要未写成 · 检测到面向 AI 的指令，已忽略 · 未通过核验 · 只有标题 · 等了 n 天), 内容概述 and
//   its points (each with its place in the kept original), the opening of the original, 收藏 · 放弃 · 稍后处理. The reasons
//   are NOT on the card: they are the right panel's 详情 of the current card (why it was picked, 核验, the folded 核验记录, the
//   source and the original).
//   放弃 (D) takes the card off at once (dismissItem: held in the main process, nothing written); the bar 「已放弃「…」。可选择原
//   因：营销内容 · 不相关 · 内容过浅 · 重复 · 其他原因… · 撤销」: a reason → written with it (settleDismiss), 撤销 → back where it was
//   (undoDismiss, nothing written), 关闭 → written without a reason; the next 收藏 / 放弃 / 稍后处理, another library, the app
//   quitting write it too (the main process), and leaving this page closes the bar (written without a reason).
//   稍后处理 (L) puts it in the folded row 「稍后处理 · n 条（下次运行后重新列入待看）」 until this library's next run has ended.
//   1.1 W7b: v1.0's 未通过筛选, 重新评分, 待评分 and 添加链接 are gone with its scoring pipeline; a card of an old library shows what
//   it has (its title, source, date, overview) without v1.0's marks.
// Keys: J / K move, C keeps, D lets go, L 稍后处理 (not while typing, not with a modifier, not while a dialog is open).
// Words: texts/inbox.js INBOX, texts/panel.js PANEL.detail.inbox, texts/run.js RUN.
// Test hooks: [data-part="inbox-head"] with [data-part="inbox-count"][data-count], [data-part="keys"];
// article[data-card][data-url][data-current] with [data-action="open"] (the title), [data-part="card-line"], the marks
// [data-waiting] [data-unverified] [data-ai-instruction][title] [data-title-only] [data-original-missing] [data-summary-missing],
// [data-part="needs-contact"][data-site] with [data-action="to-source-auth"] (1.1.1 P9), [data-part=what|points|opening], [data-action=keep|dismiss|later|open-point|open-stored|open-web]; [data-part="dismiss-bar"]
// [data-url] with [data-reason=<quick id>|other], [data-action=undo|close-bar|save-reason], [data-field="other-reason"];
// [data-part="later"][data-open][data-count] with [data-later=<url>]; [data-part="empty"]; [data-part="last-run"];
// [data-part="recent"] [data-kept=<id>]; [data-part="update-banner"][data-code]. 详情: [data-part="detail-inbox"] …
// [data-part="detail-why"], [data-part="detail-check"][data-verified][data-ai-instruction], [data-part="detail-record"][data-open]
// (its .vd body when open), [data-part="detail-source"], [data-part="reasons"] [data-reason].
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { moEase, moMs, stillMotion } from '../lib/motion.js'
import { isOfLibrary, useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { DAY, ERRORS, NEXT_WHEN, SEP, WHEN } from '../texts/common.js'
import { INBOX as T } from '../texts/inbox.js'
import { PANEL } from '../texts/panel.js'
import { aiPhrases, VerdictFold } from './verdict-dialog.js'
import { LibraryFrame } from './library-frame.js'
import { DetailBlock } from './right-panel.js'
import { LastRun, RunSteps, UpdateNote } from './run-steps.js'

const LONG_WAIT = 14
// 1.1.1 P14 (M2): how long a leaving card is drawn (its animation is var(--mo-in), 200 ms; a little more so it ends unseen);
// the cards below move up into its place in var(--mo-in) too (lib/motion.js reads it from motion.css)
const LEAVE_MS = 240
/** The list as drawn: the cards, and each leaving one at the place it had (its index then, kept within the list). */
function withLeaving(items, leaving) {
  const out = items.map((item, i) => ({ item, i, ghost: null }))
  for (const g of [...leaving].sort((a, b) => a.index - b.index)) out.splice(Math.max(0, Math.min(g.index, out.length)), 0, { item: g.item, i: -1, ghost: g.kind })
  return out
}
const QUICK = ['marketing', 'irrelevant', 'shallow', 'duplicate']
const pad = n => String(n).padStart(2, '0')
// a note's date (YYYY-MM-DD) is a local day: without a time, Date would read it as UTC midnight
const localDay = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d)

/** The hover line of the 「写给 AI 的话」 mark: the sentences the card's check found. */
function aiHint(item) {
  const phrases = aiPhrases(item.verification?.aiInstruction)
  return phrases.length ? fmt(T.card.aiInstructionHint, { phrases: phrases.map(p => fmt(T.card.aiInstructionPhrase, { phrase: p })).join(SEP) }) : T.card.aiInstructionNoPhrase
}

function Mark({ attrs, title, children }) {
  // the hook and the words on one inner element (its text is the mark's words, nothing else)
  return html`<span class="status-chip st-mark" title=${title}><span class="dot"></span><span ...${attrs} title=${title}>${children}</span></span>`
}

function Card({ item, isCurrent, busy, onKeep, onDismiss, onLater, onOpen, onOpenPoint = () => {}, onOpenWeb = () => {}, onPick, onToSettings = () => {}, motion = '', motionIndex = null, leaving = null }) {
  const waiting = typeof item.waitingDays === 'number' ? item.waitingDays : 0
  const unverified = Boolean(item.verification) && item.verification.passed === false
  // 1.1 W6a (A3; E4): the line is the source, the date and whether the original was kept — no score
  const missing = item.original?.saved === false
  const kept = item.original?.saved === true
  const line = [item.source ?? '', item.date ? fmt(T.card.published, { date: item.date }) : '', kept ? T.card.saved : ''].filter(Boolean).join(SEP)
  const points = missing ? [] : Array.isArray(item.summary?.points) ? item.summary.points : []
  const anchors = Array.isArray(item.summary?.anchors) ? item.summary.anchors : []
  const placeOf = i => anchors.find(a => a.point === i) ?? null
  // 1.1.1 P14: a card leaving is drawn where it was (data-leaving: keep · dismiss · later), never a card of the list
  return html`<article class=${`confirmation st-card${isCurrent ? ' st-current' : ''}${motion ? ` ${motion}` : ''}`} style=${motionIndex === null ? undefined : { '--mo-i': motionIndex }} data-card=${leaving ? undefined : ''} data-leaving=${leaving ?? undefined} data-url=${item.url} data-current=${String(isCurrent)}
    aria-current=${isCurrent ? 'true' : undefined} aria-label=${T.card.label} tabindex="-1" onClick=${onPick}>
    <div class="confirm-top">
      <div class="confirm-title"><${TIcon} name="file" />
        <div><h2><a href="#" class="st-card__title" data-action="open" onClick=${e => { e.preventDefault(); e.stopPropagation(); onOpen() }}>${item.title}</a></h2>
          <small data-part="card-line">${line}</small></div>
      </div>
      <div class="st-card__marks">
        ${missing ? html`<${Mark} attrs=${{ 'data-original-missing': item.original.reason ?? '' }}>${T.card.missing}<//>` : null}
        ${item.summaryMissing ? html`<${Mark} attrs=${{ 'data-summary-missing': '' }}>${T.card.summaryMissing}<//>` : null}
        ${item.aiInstruction === true ? html`<${Mark} attrs=${{ 'data-ai-instruction': '' }} title=${aiHint(item)}>${T.card.aiInstruction}<//>` : null}
        ${unverified ? html`<${Mark} attrs=${{ 'data-unverified': '' }}>${T.card.unverified}<//>` : null}
        ${item.materials === 'title-only' ? html`<${Mark} attrs=${{ 'data-title-only': '' }} title=${T.card.titleOnlyHint}>${T.card.titleOnly}<//>` : null}
        ${waiting >= LONG_WAIT ? html`<${Mark} attrs=${{ 'data-waiting': waiting }}>${fmt(T.card.waiting, { n: waiting })}<//>` : null}
      </div>
    </div>
    <div class="card-body">
      ${missing ? html`<p class="intro-copy" data-part="missing-note">${fmt(T.card.missingNote, { why: T.card.missingWhy[item.original.reason] ?? T.card.missingWhy['no-article'] })}</p>` : null}
      ${missing && item.needsContact ? html`<p class="intro-copy" data-part="needs-contact" data-site=${item.needsContact}>${T.card.needsContact}
        <span class="st-act" data-action="to-source-auth"><button type="button" class="btn quiet" onClick=${e => { e.stopPropagation(); onToSettings() }}>${T.card.needsContactGo}</button></span></p>` : null}
      ${item.summaryMissing ? html`<p class="intro-copy" data-part="summary-missing-note">${T.card.summaryMissingNote}</p>` : null}
      ${!missing && item.summary?.what ? html`<p class="intro-copy" data-part="what"><b>${T.card.what}</b>${item.summary.what}</p>` : null}
      ${points.length ? html`<dl class="decision-points" data-part="points">${points.map((p, i) => {
        const at = placeOf(i)
        return html`<div key=${i}><dt><span class="point-index">${pad(i + 1)}</span></dt><dd>${p}${at ? html`<br /><a href="#" class="muted st-card__place" data-action="open-point" data-point=${i} data-paragraph=${at.paragraph}
          onClick=${e => { e.preventDefault(); e.stopPropagation(); onOpenPoint(i) }}>${fmt(T.card.pointLink, { n: at.paragraph + 1 })}</a>` : null}</dd></div>`
      })}</dl>` : null}
      ${item.opening ? html`<div class="st-card__opening" data-part="opening">
        <div class="section-label"><span>${T.card.opening}</span><small class="muted" data-part="opening-meta">${fmt(T.card.openingMeta, { method: T.card.methods[item.originalMethod] ?? '', when: whenText(item.originalAt, WHEN) ?? '' })}</small></div>
        <p>${item.opening}</p>
        <p class="st-card__opening-links"><a href="#" class="muted" data-action="open-stored" onClick=${e => { e.preventDefault(); e.stopPropagation(); onOpen() }}>${T.card.openStored}</a>${SEP}<a href="#" class="muted" data-action="open-web" onClick=${e => { e.preventDefault(); e.stopPropagation(); onOpenWeb() }}>${T.card.openWeb}</a></p>
      </div>` : null}
    </div>
    <div class="confirm-footer">
      <span class="muted">${waiting > 0 && waiting < LONG_WAIT ? html`<span data-waiting=${waiting}>${fmt(T.card.waiting, { n: waiting })}</span>` : ''}</span>
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
      <span class="st-act" data-action="close-bar"><button type="button" class="icon-btn" aria-label=${T.bar.close} title=${T.bar.close} disabled=${busy} onClick=${onClose}><${TIcon} name="close" /></button></span>
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

/** 详情 of the current card (F30): why it was picked, 核验, the folded 核验记录, the source line; then the recent reasons for letting go. */
function CardDetail({ item, reasons }) {
  const D = PANEL.detail.inbox
  const verified = !item.verification ? 'none' : item.verification.passed === false ? 'failed' : 'passed'
  const ai = item.aiInstruction === true
  const seen = item.firstSeen ? whenText(item.firstSeen, WHEN) : null
  return html`<${DetailBlock} where=${D.eyebrow} title=${item.title} part="detail-inbox">
    ${typeof item.why === 'string' && item.why !== '' ? html`<div class="panel-section" data-part="detail-why" data-url=${item.url}>
      <div class="section-label"><span>${D.why}</span></div>
      <p class="limit-note">${item.why}</p>
    </div>` : null}
    <div class="panel-section" data-part="detail-check" data-verified=${verified} data-ai-instruction=${String(ai)}>
      <div class="section-label"><span>${D.check}</span></div>
      <div class="step-line"><${TIcon} name=${verified === 'passed' ? 'check' : 'clock'} /><span>${verified === 'passed' ? D.passed : verified === 'failed' ? D.failed : D.unchecked}</span></div>
      <div class="step-line"><${TIcon} name=${ai ? 'clock' : 'check'} /><span>${ai ? D.aiYes : D.aiNo}</span></div>
      <${VerdictFold} url=${item.url} />
    </div>
    ${item.original ? html`<div class="panel-section" data-part="detail-source" data-original=${item.original.saved ? 'kept' : 'missing'}>
      <div class="section-label"><span>${D.sourceAndOriginal}</span></div>
      <p class="limit-note">${fmt(D.inboxLine, { source: item.source ?? '', date: item.date ?? '', when: whenText(item.inboxAt, WHEN) ?? '' })}</p>
      <p class="limit-note" data-part="detail-original">${item.original.saved
        ? fmt(D.originalLine, { method: T.card.methods[item.originalMethod] ?? '', when: whenText(item.originalAt, WHEN) ?? '' })
        : fmt(D.originalMissingLine, { why: T.card.missingWhy[item.original.reason] ?? T.card.missingWhy['no-article'] })}</p>
    </div>` : html`<div class="panel-section" data-part="detail-source">
      <div class="section-label"><span>${D.source}</span></div>
      <p class="limit-note">${seen ? fmt(D.sourceLine, { source: item.source ?? '', date: item.date ?? '', when: seen }) : fmt(D.sourceLineNoSeen, { source: item.source ?? '', date: item.date ?? '' })}</p>
    </div>`}
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

// 1.1.1 P8 (A12): 快到期 — at the top of the page, the items whose deadline is today or within 30 days (getInbox's dueSoon:
// core pipeline/due.mjs), in 待看 and kept, nearest first, each with its days left; not there when there is none.
// Test hooks: [data-part="due"][data-count], [data-due=<url>][data-days][data-where=inbox|kept].
function dueWhen(days) {
  return days === 0 ? T.due.today : days === 1 ? T.due.tomorrow : fmt(T.due.days, { n: days })
}
function dueDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number)
  return fmt(T.due.date, { m, d })
}
function DueSoon({ items, onOpen }) {
  if (!items?.length) return null
  return html`<div class="panel-section st-due" data-part="due" data-count=${items.length}>
    <div class="section-label"><span><b>${T.due.title}</b>${SEP}${fmt(T.due.count, { n: items.length })}</span></div>
    <p class="limit-note">${T.due.note}</p>
    ${items.map(it => html`<button key=${it.url} type="button" class="file-row" data-due=${it.url} data-days=${it.days} data-where=${it.where} onClick=${() => onOpen(it.url)}>
      <span class="file-icon"><${TIcon} name="clock" /></span><span class="file-text">${it.title}<small><span class="st-due__when" data-soon=${it.days <= 7 ? 'true' : 'false'}>${fmt(T.due.line, { when: dueWhen(it.days), date: dueDate(it.due) })}</span>${SEP}${it.where === 'kept' ? T.due.kept : T.due.inbox}</small></span><${TIcon} name="arrow" /></button>`)}
  </div>`
}

export function InboxScreen() {
  const { appState, queue, navigate } = useApp()
  const libraryId = appState?.data?.library?.libraryId ?? null
  const inbox = useLoad(() => call('getInbox'), [libraryId])
  const home = useLoad(() => call('getHome'), [libraryId])
  useEvent('inbox-changed', p => { if (isOfLibrary(p, libraryId)) inbox.reload() }, [libraryId])
  useEvent('library-changed', () => { inbox.reload(); home.reload() }, [libraryId])
  useEvent('round-progress', p => { if (p?.done && isOfLibrary(p, libraryId)) { justRan.current = true; inbox.reload(); home.reload() } }, [libraryId])
  useEvent('connections-changed', () => home.reload(), [libraryId])
  const [current, setCurrent] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [laterOpen, setLaterOpen] = useState(false)
  const listRef = useRef(null)
  const [focusTick, setFocusTick] = useState(0)
  const focusCurrent = () => setFocusTick(t => t + 1)
  const d = inbox.data
  // 1.1.1 P14 (A17, M2): a decision runs at once — its bridge call is sent when it is pressed; the card leaves the list the
  // keys walk at once (C pressed three times keeps three items) and is drawn where it was, leaving, for LEAVE_MS while the
  // call goes; the cards below move up into its place (FLIP, below). One whose call failed comes back with the error.
  const pending = useRef(new Set())
  const [leaving, setLeaving] = useState([])
  const [back, setBack] = useState(null)
  const [fresh, setFresh] = useState(() => new Map())
  const items = (d?.items ?? []).filter(i => !pending.current.has(i.url))
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
  const decide = (item, kind, method, after) => {
    if (!item || pending.current.has(item.url)) return
    setError(null)
    pending.current.add(item.url)
    const index = items.findIndex(i => i.url === item.url)
    setLeaving(l => [...l.filter(g => g.item.url !== item.url), { item, kind, index }])
    setTimeout(() => setLeaving(l => l.filter(g => g.item.url !== item.url)), LEAVE_MS)
    focusCurrent()
    call(method, item.url)
      .then(() => { inbox.mutate(x => after({ ...x, items: x.items.filter(i => i.url !== item.url) })) }, () => setError(T.failed))
      .finally(() => { pending.current.delete(item.url); inbox.reload(); home.reload() })
  }
  const keep = item => decide(item, 'keep', 'keepItem', x => ({ ...x, held: null }))
  const dismiss = item => decide(item, 'dismiss', 'dismissItem', x => ({ ...x, held: { url: item.url, title: item.title } }))
  const later = item => decide(item, 'later', 'laterItem', x => ({ ...x, later: [...(x.later ?? []), item], held: null }))
  const settle = (reason, quick) => act(async () => { await call('settleDismiss', reason, quick); inbox.mutate(x => ({ ...x, held: null })) })
  // 撤销: the card comes back where it was, fading in (M2)
  const undo = () => {
    const url = held?.url ?? null
    act(async () => { await call('undoDismiss'); setBack(url); setTimeout(() => setBack(b => (b === url ? null : b)), 400) }, focusCurrent)
  }
  // M6: after a run, the items it put in 待看 come in one after another (the first six); the first load has none
  const seen = useRef(null)
  const justRan = useRef(false)
  useEffect(() => {
    if (!d) return
    const urls = (d.items ?? []).map(i => i.url)
    if (seen.current && justRan.current) {
      justRan.current = false
      const added = urls.filter(u => !seen.current.has(u)).slice(0, 6)
      if (added.length) { setFresh(new Map(added.map((u, i) => [u, i]))); setTimeout(() => setFresh(new Map()), 900) }
    }
    seen.current = new Set([...(seen.current ?? []), ...urls])
  }, [d])
  // M2: the cards below a leaving one move up into its place — each card's offset before and after, the difference undone
  // and played back (only transform; none with 减少动态效果)
  const stackRef = useRef(null)
  const tops = useRef(new Map())
  useLayoutEffect(() => {
    const stack = stackRef.current
    const now = new Map()
    const cards = stack ? [...stack.querySelectorAll('article[data-card]')] : []
    for (const el of cards) now.set(el.dataset.url, el.offsetTop)
    if (!stillMotion()) {
      const duration = moMs('--mo-in', 200)
      const easing = moEase()
      for (const el of cards) {
        const was = tops.current.get(el.dataset.url)
        const dy = was === undefined ? 0 : was - el.offsetTop
        if (dy > 1 && typeof el.animate === 'function') el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { id: 'st-mo-fill', duration, easing })
      }
    }
    tops.current = now
  })
  const open = url => { call('openReader', url, 'reader').catch(() => setError(T.failed)) }
  // 1.1 W6a (A4): a point's place in the kept original; the web page itself in the system browser
  const openAt = (url, point) => { call('openReader', url, 'reader', point).catch(() => setError(T.failed)) }
  const openWeb = url => { call('openReader', url, 'browser').catch(() => setError(T.failed)) }

  // the keys: one listener for the screen's life, reading the newest state from a ref (see v2's notes in git history)
  const latest = useRef(null)
  latest.current = { items, keep, dismiss, later }
  const pos = useRef(0)
  pos.current = Math.min(current, last)
  useEffect(() => {
    const onKey = e => {
      const st = latest.current
      if (e.ctrlKey || e.metaKey || e.altKey) return
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
  const reasons = d?.recentDismissReasons ?? []
  const laterItems = d?.later ?? []
  const detail = cur ? html`<${CardDetail} key=${cur.url} item=${cur} reasons=${reasons} />`
    : d ? html`<div class="panel-summary"><span class="eyebrow">${PANEL.tabs.detail}</span><p class="st-rp-none" data-part="detail-none">${PANEL.detail.inbox.empty}</p></div><${Reasons} reasons=${reasons} />` : null
  const state = d && h ? 'ready' : inbox.status === 'error' ? 'error' : 'loading'
  const nextRun = h?.nextRun ? fmt(T.empty.next, { when: nextText(h.nextRun, NEXT_WHEN) ?? h.nextRun }) : T.empty.nextNone

  return html`<${LibraryFrame} tab="inbox" state=${state} labelledby="inbox-title" detail=${detail}>
    <div class="st-main__body thread-scroll inbox-body" ref=${listRef} data-count=${items.length}>
      <div class="thread">
        <div class="section-label st-inbox-head" data-part="inbox-head">
          <span><b id="inbox-title" data-part="inbox-count" data-count=${items.length}>${fmt(T.count, { n: items.length })}</b>${items.length ? html`${SEP}${T.sorted}` : null}</span>
          <span class="st-inbox-head__end">
            ${items.length ? html`<small class="muted" data-part="keys">${T.keys}</small>` : null}
          </span>
        </div>
        <${DueSoon} items=${d?.dueSoon ?? []} onOpen=${open} />
        ${inbox.status === 'error' && !d ? html`<div class="progress-alert" role="alert">${inbox.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed} <button type="button" class="btn quiet" onClick=${() => inbox.reload()}>${ERRORS.retry}</button></div>` : null}
        ${error ? html`<div class="progress-alert" role="alert">${error}</div>` : null}
        ${d?.updateProblem?.code === 'login-expired' ? html`<div class="progress-alert" data-part="update-banner" data-code="login-expired" role="alert">${T.banner.loginExpired}
          <span class="st-act" data-action="to-settings"><button type="button" class="btn quiet" onClick=${() => navigate('settings')}>${T.banner.toSettings}</button></span></div>` : null}
        ${!running && h ? html`<${UpdateNote} record=${h.lastRound} onToCard=${t => navigate('build', { edit: libraryId, opener: t })} />` : null}
        ${running ? html`${items.length ? null : html`<div class="empty-state" data-part="run-pending"><${TIcon} name="clock" /><b>${T.running.title}</b>${T.running.note}</div>`}
          <${RunSteps} running=${running} last=${h?.lastRound ?? null} />` : null}
        ${d && !items.length && !running ? html`<div class="empty-state" data-part="empty"><${TIcon} name="check" /><b>${T.empty.title}</b>${nextRun}</div>` : null}
        ${items.length || leaving.length ? html`<div class="st-stack" ref=${stackRef}>${withLeaving(items, leaving).map(({ item, i, ghost }) => ghost ? html`<${Card} key=${`leave:${item.url}`} item=${item} isCurrent=${false} busy=${true} leaving=${ghost} motion=${`st-mo-leave-${ghost}`}
          onPick=${() => {}} onKeep=${() => {}} onDismiss=${() => {}} onLater=${() => {}} onOpen=${() => {}} />` : html`<${Card} key=${item.url} item=${item} isCurrent=${i === current} busy=${busy}
          motion=${item.url === back ? 'st-mo-back' : fresh.has(item.url) ? 'st-mo-new' : ''} motionIndex=${fresh.has(item.url) ? fresh.get(item.url) : null}
          onPick=${() => setCurrent(i)} onKeep=${() => { setCurrent(i); keep(item) }} onDismiss=${() => { setCurrent(i); dismiss(item) }} onLater=${() => { setCurrent(i); later(item) }} onOpen=${() => open(item.url)}
          onOpenPoint=${p => openAt(item.url, p)} onOpenWeb=${() => openWeb(item.url)} onToSettings=${() => navigate('settings')} />`)}</div>` : null}
        ${held ? html`<${DismissBar} key=${held.url} held=${held} busy=${busy} onReason=${settle} onUndo=${undo} onClose=${() => settle(null, null)} />` : null}
        ${d && !items.length && !running && h ? html`${h.lastRound?.kind === 'update' ? null : html`<${LastRun} record=${h.lastRound} />`}
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
      </div>
    </div>
  <//>`
}
