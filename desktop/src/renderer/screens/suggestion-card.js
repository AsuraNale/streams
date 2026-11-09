// The suggestion card (v2 package G, contract G2; design P2, P3, UC2 step 4): one rule of package D found something
// (listSuggestions; docs/desktop.md §4.6) — one sentence by its kind (a source that keeps failing · N rounds without output ·
// words written to an AI in a source's articles · two libraries whose topics overlap), one line of its evidence, and two
// buttons: 交给主 Agent (acceptSuggestion: recorded, and handed to the main Agent for one turn — it decides whether to
// propose a card) · 不要 (dismissSuggestion). It is only a suggestion: nothing on it changes a library, and there is no
// switch that lets this kind of thing be done by itself later (the maintainer 11-05: no standing permission). A button pressed stays
// pressed until the bridge answers. Shown in 概览 (this library's: Suggestions below) and in 「等你定的事」 of 和主 Agent 聊
// (every library's, with the library's name).
// Test hooks: [data-suggestion=<key>][data-kind][data-library][data-state=open|accepting|dismissing|accepted|dismissed][data-busy],
// [data-part=sentence|evidence|done], [data-action=accept|dismiss|go-chat].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, whenText } from '../lib/format.js'
import { suggestionsChanged, useSuggestions } from '../lib/agent.js'
import { Act } from '../lib/action.js'
import { FETCH_STATES, SEP, WHEN } from '../texts/common.js'
import { AGENT } from '../texts/agent.js'
import { libraryNameOf } from './proposal-card.js'

const T = AGENT.suggestion

/** The card's one sentence (contract G2). `nameOf(id)` gives a library's name (topic-overlap names the other library). */
export function suggestionSentence(s, nameOf = () => null) {
  const e = s?.evidence ?? {}
  switch (s?.kind) {
    case 'source-failing': return fmt(T.kinds['source-failing'], { subject: s.subject ?? '', n: e.rounds ?? 0 })
    case 'no-output': return fmt(T.kinds['no-output'], { n: e.rounds ?? 0 })
    case 'ai-instruction': return fmt(T.kinds['ai-instruction'], { subject: s.subject ?? '' })
    case 'topic-overlap': {
      const other = s.otherLibraryId ?? s.subject ?? null
      return fmt(T.kinds['topic-overlap'], { other: nameOf(other) ?? AGENT.rows.unknownLibrary })
    }
    default: return T.kinds.other
  }
}

/** The card's line of evidence, or null. */
export function suggestionEvidence(s) {
  const e = s?.evidence ?? {}
  const E = T.evidence
  switch (s?.kind) {
    case 'source-failing': {
      const last = e.last ?? {}
      const when = whenText(last.ts, WHEN) ?? ''
      const state = Object.hasOwn(FETCH_STATES, last.status ?? '') ? FETCH_STATES[last.status] : ''
      return `${fmt(E['source-failing'], { failed: e.failed ?? 0, blocked: e.blocked ?? 0, when })}${state ? `${SEP}${state}` : ''}${last.http ? `${SEP}HTTP ${last.http}` : ''}`
    }
    case 'no-output': return fmt(E['no-output'], { n: e.rounds ?? 0, when: whenText(e.since, WHEN) ?? '' })
    case 'ai-instruction': {
      const phrase = Array.isArray(e.phrases) ? e.phrases.find(p => typeof p === 'string' && p) : null
      return phrase ? fmt(E['ai-instruction'], { n: e.count ?? 0, phrase }) : fmt(E['ai-instruction-plain'], { n: e.count ?? 0 })
    }
    case 'topic-overlap': {
      const pct = typeof e.jaccard === 'number' ? Math.round(e.jaccard * 100) : 0
      const shared = Array.isArray(e.shared) ? e.shared.slice(0, 6).join(SEP) : ''
      return fmt(E['topic-overlap'], { pct, shared })
    }
    default: return null
  }
}

/**
 * @param {object} p
 * @param {object} p.item - a row of listSuggestions: { libraryId, key, kind, subject, otherLibraryId?, evidence, createdAt }
 * @param {boolean} [p.showLibrary] - name the library on the card (「等你定的事」 holds every library's)
 * @param {boolean} [p.goChat] - after 交给主 Agent, offer the way to 和主 Agent 聊 (not on that page itself)
 * @param {(turn: object|null) => void} [p.onAccepted] - acceptSuggestion's answer (the turn the main Agent ran)
 * @param {(item: object, state: string) => void} [p.onHandled] - the card was accepted or dismissed (the bridge said so)
 */
export function SuggestionCard({ item, showLibrary = false, goChat = false, onAccepted, onHandled }) {
  const app = useApp()
  const [state, setState] = useState('open')
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const nameOf = id => libraryNameOf(app?.libraries?.data, id)
  const act = async (next, job) => {
    if (inFlight.current) return
    inFlight.current = true
    setFailed(false)
    setState(next === 'accepted' ? 'accepting' : 'dismissing')
    try {
      const r = await job()
      setState(next)
      onHandled?.(item, next)
      suggestionsChanged()
      if (next === 'accepted') onAccepted?.(r?.turn ?? null)
    } catch {
      setState('open')
      setFailed(true)
    } finally {
      inFlight.current = false
    }
  }
  const busy = state === 'accepting' || state === 'dismissing'
  const live = state === 'open' || busy
  const evidence = suggestionEvidence(item)
  const lib = nameOf(item.libraryId)
  return html`<section class=${`sc${live ? '' : ' sc--done'}`} data-suggestion=${item.key ?? ''} data-kind=${item.kind ?? ''} data-library=${item.libraryId ?? ''} data-state=${state} data-busy=${String(busy)}>
    <div class="sc-who st-t-small st-t-sub"><span class="agent-av" aria-hidden="true">${AGENT.avatar}</span>${showLibrary && lib ? fmt(T.whoOf, { lib }) : T.who}</div>
    <div class="sc-text" data-part="sentence">${suggestionSentence(item, nameOf)}</div>
    ${evidence ? html`<div class="st-t-small st-t-sub" data-part="evidence">${evidence}</div>` : null}
    ${live ? html`<div class="sc-actions">
      <${Act} name="accept" variant="primary" disabled=${busy} onClick=${() => act('accepted', () => call('acceptSuggestion', item.libraryId, item.key))}>${T.accept}<//>
      <${Act} name="dismiss" disabled=${busy} onClick=${() => act('dismissed', () => call('dismissSuggestion', item.libraryId, item.key))}>${T.dismiss}<//>
      ${state === 'accepting' ? html`<span class="st-t-small st-t-sub" role="status">${T.accepting}</span>` : null}
    </div>` : html`<div class="sc-actions st-t-small" data-part="done">
      <span class=${state === 'accepted' ? 'st-t-done st-t-strong' : 'st-t-sub'}>${state === 'accepted' ? T.accepted : T.dismissed}</span>
      ${state === 'accepted' && goChat ? html`<${Act} name="go-chat" onClick=${() => app?.navigate?.('chat')}>${T.go}<//>` : null}
    </div>`}
    ${failed ? html`<div class="st-t-small st-t-wait" role="alert">${T.callFailed}</div>` : null}
  </section>`
}

/** 概览's part 「主 Agent 给这个库的建议」: the current library's open suggestion cards, or a line that there is none. */
export function LibrarySuggestions({ libraryId }) {
  const list = useSuggestions(libraryId ?? null)
  // a card handled here stays on the page (with what became of it) until the page is left, though the list no longer has it
  const [handled, setHandled] = useState([])
  const open = libraryId ? list.items.filter(s => s.libraryId === libraryId) : []
  const items = [...open, ...handled.filter(h => !open.some(s => s.key === h.key))]
  return html`<section class="ov-suggestions" data-part="suggestions" data-state=${list.status} data-count=${items.length} aria-labelledby="ov-suggestions">
    <h2 class="st-t-small st-t-sub st-t-strong" id="ov-suggestions">${T.title}</h2>
    ${items.length ? html`<div class="sc-list">${items.map(s => html`<${SuggestionCard} key=${`${s.libraryId}:${s.key}`} item=${s} goChat=${true} onHandled=${h => setHandled(l => [...l.filter(x => x.key !== h.key), h])} />`)}</div>`
      : html`<p class="st-t-small st-t-muted" data-part="suggestions-none">${list.status === 'loading' && !list.data ? '' : T.none}</p>`}
  </section>`
}
