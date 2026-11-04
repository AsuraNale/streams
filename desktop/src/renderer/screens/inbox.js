// 待看 (mockup S3): the cards waiting for a decision, in getInbox().items order (the core sorts by score); a right panel with
// the recent reasons for letting go. Keys: J / K move, C keeps, D opens the dialog, L = later. A decision takes the card off
// the page at once (useLoad mutate) and the list is read again; the main process says `inbox-changed` as well. Words:
// texts/inbox.js, texts/common.js NODE_NAMES.
// The keyboard focus follows the current card (docs/desktop.md §4.3): J / K / L and a keep move it there (card.focus()), and when
// a dialog (放弃, 这一条的记录) goes, the focus goes back to the current card, so a screen reader follows the list.
// Test hooks: article[data-card][data-url][data-current], [data-waiting], [data-unverified], [data-maybe-duplicate],
// [data-action=open|keep|dismiss|later], the dialog [data-dialog="dismiss"] with [data-field="reason"] and
// [data-action=confirm-dismiss|cancel-dismiss], the panel [data-part="reasons"] with [data-reason] lines, [data-action="adjust"].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, Dialog, LinkButton, Main, Panel, Tag, TopBar } from '../kit/index.js'
import { DAY, ERRORS, NODE_NAMES, SEP } from '../texts/common.js'
import { INBOX as T } from '../texts/inbox.js'
import { VerdictDialog } from './verdict-dialog.js'

const LONG_WAIT = 14
const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)
const scoreText = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : String(v ?? ''))

function ScoreLine({ id, score }) {
  if (!score) return null
  const value = typeof score.score === 'number' ? scoreText(score.score) : (Object.hasOwn(T.card.freshness, score.value) ? T.card.freshness[score.value] : String(score.value ?? ''))
  return html`<span class="inbox-score" data-score=${id}>
    <span class="st-t-strong">${fmt(T.card.score, { name: nodeName(id), score: value })}</span>
    ${score.reason ? html`<span class="st-t-small st-t-sub">${SEP}${score.reason}</span>` : null}
  </span>`
}

function Card({ item, isCurrent, busy, onKeep, onDismiss, onLater, onOpen, onRecord }) {
  const scores = item.scores ?? {}
  const ids = ['relevance', 'substance', 'freshness', ...Object.keys(scores).filter(k => !['relevance', 'substance', 'freshness'].includes(k))]
  const waiting = typeof item.waitingDays === 'number' ? item.waitingDays : 0
  // a round without a connection (the user skipped it) puts items here unscored: no check ran, so no 「未通过核验」
  const scoreless = item.scoreless === true
  const unverified = !scoreless && item.verification && item.verification.passed === false
  return html`<article class=${`inbox-card${isCurrent ? ' inbox-card--current' : ''}`} data-card data-url=${item.url} data-current=${String(isCurrent)} aria-current=${isCurrent ? 'true' : undefined} aria-label=${T.card.label} tabindex="-1">
    <div class="inbox-card__head">
      <a href="#" class="inbox-card__title st-t-title" data-action="open" onClick=${e => { e.preventDefault(); onOpen() }}>${item.title}</a>
      <div class="inbox-card__tags">
        ${waiting >= LONG_WAIT ? html`<${Tag} tone="wait"><span data-waiting=${waiting}>${fmt(T.card.waiting, { n: waiting })}</span><//>` : null}
        ${unverified ? html`<span class="inbox-card__unverified" data-unverified>${T.card.unverified}</span>` : null}
        ${scoreless ? html`<${Tag} tone="wait"><span data-scoreless>${T.card.scoreless}</span><//>` : null}
      </div>
    </div>
    <div class="st-t-small st-t-sub">
      ${fmt(T.card.meta, { source: item.source ?? '', date: item.date ?? '' })}
      ${waiting > 0 && waiting < LONG_WAIT ? html`<span data-waiting=${waiting}>${SEP}${fmt(T.card.waiting, { n: waiting })}</span>` : null}
    </div>
    ${item.summary?.what ? html`<p class="inbox-card__what"><b>${T.card.what}</b>${item.summary.what}</p>` : null}
    ${scoreless ? html`<p class="inbox-card__what" data-part="excerpt"><b>${T.card.excerpt}</b>${item.excerpt ?? ''}</p>` : null}
    ${scoreless ? html`<div class="st-t-small st-t-muted">${T.card.scorelessNote}</div>` : null}
    ${Array.isArray(item.summary?.points) && item.summary.points.length ? html`<ul class="inbox-card__points">${item.summary.points.map((p, i) => html`<li key=${i}>${p}</li>`)}</ul>` : null}
    <div class="inbox-card__scores">${ids.filter(id => scores[id]).map(id => html`<${ScoreLine} key=${id} id=${id} score=${scores[id]} />`)}</div>
    ${item.maybeDuplicateOf ? html`<div class="st-t-small st-t-wait" data-maybe-duplicate=${item.maybeDuplicateOf}>${T.card.maybeDuplicate}</div>` : null}
    <div class="inbox-card__actions">
      <${Act} name="keep" variant="primary" disabled=${busy} onClick=${onKeep}>${T.card.keep}<//>
      <${Act} name="dismiss" disabled=${busy} onClick=${onDismiss}>${T.card.dismiss}<//>
      <${Act} name="later" disabled=${busy} onClick=${onLater}>${T.card.later}<//>
      ${scoreless ? null : html`<${LinkButton} onClick=${onRecord}><span data-action="record">${T.card.record}</span><//>`}
    </div>
  </article>`
}

function DismissDialog({ reason, setReason, busy, onConfirm, onCancel }) {
  const ready = reason.trim() !== '' && !busy
  const actions = html`<${Act} name="cancel-dismiss" disabled=${busy} onClick=${onCancel}>${T.dialog.cancel}<//>
    <${Act} name="confirm-dismiss" variant="primary" disabled=${!ready} onClick=${onConfirm}>${T.dialog.confirm}<//>`
  return html`<${Dialog} name="dismiss" title=${T.dialog.title} onCancel=${onCancel} actions=${actions}>
    <label class="st-dialog__label" for="inbox-reason">${T.dialog.why}</label>
    <textarea id="inbox-reason" class="inbox-reason" data-field="reason" rows="3" placeholder=${T.dialog.placeholder} value=${reason} data-dialog-initial
      onInput=${e => setReason(e.currentTarget.value)}
      onKeyDown=${e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ready) { e.preventDefault(); onConfirm() } }}></textarea>
  <//>`
}

export function InboxScreen() {
  const { navigate } = useApp()
  const inbox = useLoad(() => call('getInbox'), [])
  useEvent('inbox-changed', () => inbox.reload())
  const [current, setCurrent] = useState(0)
  const [dismissing, setDismissing] = useState(null)
  // S15: the check record of one card, in a dialog (its url and title)
  const [record, setRecord] = useState(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)
  // bumped by every move of the keyboard's card (J / K / L, a keep, a dialog gone): the effect below puts the focus on it
  const [focusTick, setFocusTick] = useState(0)
  const focusCurrent = () => setFocusTick(t => t + 1)
  const items = inbox.data?.items ?? []
  const cur = items[current] ?? null
  const last = Math.max(0, items.length - 1)
  useEffect(() => { if (current > last) setCurrent(last) }, [items.length])
  useEffect(() => { listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' }) }, [current, items.length])
  useEffect(() => { if (focusTick > 0) listRef.current?.querySelector('[data-current="true"]')?.focus({ preventScroll: true }) }, [focusTick])
  // a dialog gone (confirmed or cancelled): the focus back on the current card (the dialog would give it to what opened it)
  const dialogOpen = dismissing !== null || record !== null
  const wasOpen = useRef(false)
  useEffect(() => { if (wasOpen.current && !dialogOpen) focusCurrent(); wasOpen.current = dialogOpen }, [dialogOpen])

  const remove = url => inbox.mutate(d => ({ ...d, items: d.items.filter(i => i.url !== url) }))
  const keep = async item => {
    if (!item || busy) return
    setBusy(true)
    setError(null)
    try { await call('keepItem', item.url); remove(item.url); focusCurrent(); inbox.reload() } catch { setError(T.card.failed) } finally { setBusy(false) }
  }
  const openDismiss = item => { if (item && !busy) { setReason(''); setDismissing(item.url) } }
  const confirmDismiss = async () => {
    const text = reason.trim()
    if (!text || !dismissing || busy) return
    setBusy(true)
    setError(null)
    try {
      await call('dismissItem', dismissing, text)
      remove(dismissing)
      setDismissing(null)
      setReason('')
      inbox.reload()
    } catch { setError(T.card.failed) } finally { setBusy(false) }
  }
  const later = async item => {
    if (!item || busy) return
    const at = items.findIndex(i => i.url === item.url)
    try { await call('laterItem', item.url) } catch { /* nothing is written for later */ }
    pos.current = Math.min((at < 0 ? pos.current : at) + 1, last)
    setCurrent(pos.current)
    focusCurrent()
  }
  const open = item => { if (item) call('openItemUrl', item.url).catch(() => setError(T.card.failed)) }

  // the keys: not while the dialog is open, not while typing in a field, not with a modifier
  // One listener for the screen's life, reading the newest state from a ref: a listener re-made per render can still be the
  // old one when the next key comes (effects run after paint, and a hidden window paints late), and would act on the card
  // that was current a key earlier. `pos` moves at once with J / K, before the render that shows it.
  const latest = useRef(null)
  latest.current = { items, current, dismissing: dismissing ?? record, keep, openDismiss, later }
  const pos = useRef(0)
  pos.current = Math.min(current, last)
  useEffect(() => {
    const onKey = e => {
      const st = latest.current
      if (st.dismissing !== null || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const k = typeof e.key === 'string' ? e.key.toLowerCase() : ''
      const end = Math.max(0, st.items.length - 1)
      const item = st.items[Math.min(pos.current, end)] ?? null
      if (k === 'j') { e.preventDefault(); pos.current = Math.min(pos.current + 1, end); setCurrent(pos.current); focusCurrent() } else if (k === 'k') { e.preventDefault(); pos.current = Math.max(0, pos.current - 1); setCurrent(pos.current); focusCurrent() } else if (k === 'c') { e.preventDefault(); st.keep(item) } else if (k === 'd') { e.preventDefault(); st.openDismiss(item) } else if (k === 'l') { e.preventDefault(); st.later(item) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const reasons = inbox.data?.recentDismissReasons ?? []
  const panel = html`<${Panel} label=${T.panel.title}>
    <div class="inbox-panel" data-part="reasons">
      <h2 class="st-t-small st-t-sub st-t-strong">${T.panel.title}</h2>
      ${reasons.length ? html`<ul class="inbox-panel__list">
        ${reasons.map((r, i) => html`<li key=${i} class="inbox-panel__line" data-reason=${r.reason} title=${r.title ?? ''}>${fmt(T.panel.line, { when: dayText(r.ts, DAY) ?? '', reason: r.reason })}</li>`)}
      </ul>` : html`<div class="st-t-small st-t-muted">${T.panel.none}</div>`}
      <div class="inbox-panel__ask">
        <span class="st-t-small st-t-sub">${T.panel.ask}</span>
        <${Act} name="adjust" onClick=${() => navigate('pipeline')}>${T.panel.adjust}<//>
      </div>
    </div>
  <//>`
  const state = inbox.data ? 'ready' : inbox.status
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="inbox" />`} panel=${panel}>
    <${Main} screen="inbox" state=${state} labelledby="inbox-title">
      <${TopBar} title=${inbox.data ? `${T.title}${SEP}${fmt(T.count, { n: items.length })}` : T.title} subtitle=${T.subtitle} titleTag="h1" titleId="inbox-title"
        actions=${html`<span class="inbox-keys st-t-small st-t-muted" data-part="keys">${T.keys}</span>`} />
      <div class="st-main__body inbox-body" ref=${listRef} data-count=${items.length}>
        ${inbox.status === 'error' && !inbox.data ? html`<div class="inbox-error" role="alert">${inbox.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => inbox.reload()}>${ERRORS.retry}<//></div>` : null}
        ${error ? html`<div class="inbox-error" role="alert">${error}</div>` : null}
        ${inbox.data && !items.length ? html`<div class="inbox-empty st-t-sub" data-part="empty">${T.empty}</div>` : null}
        ${items.map((item, i) => html`<${Card} key=${item.url} item=${item} isCurrent=${i === current} busy=${busy}
          onKeep=${() => { setCurrent(i); keep(item) }} onDismiss=${() => { setCurrent(i); openDismiss(item) }} onLater=${() => { setCurrent(i); later(item) }} onOpen=${() => open(item)} onRecord=${() => { setCurrent(i); setRecord({ url: item.url, title: item.title }) }} />`)}
      </div>
    <//>
    ${record !== null ? html`<${VerdictDialog} url=${record.url} title=${record.title} onClose=${() => setRecord(null)} />` : null}
    ${dismissing !== null ? html`<${DismissDialog} reason=${reason} setReason=${setReason} busy=${busy} onConfirm=${confirmDismiss} onCancel=${() => { setDismissing(null); setReason('') }} />` : null}
  <//>`
}
