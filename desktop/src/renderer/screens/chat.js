// 和主 Agent 聊 (v2 package G, contract G3; design P2, P8, UC1 steps 1–4). The sidebar's second entry; 库架's 「新建库 · 和主 Agent
// 聊着建」 and its empty state lead here too.
//   - 「等你定的事 · N」 at the top (N = the proposal cards waiting + the suggestion cards not handled, every library's; the
//     sidebar's badge counts the same): the suggestion cards (screens/suggestion-card.js) and the proposal cards waiting
//     (screens/proposal-card.js; one already in the conversation below is a line with 「看这张卡」). Foldable; 「没有」 when
//     there is nothing.
//   - The conversation, from the record (getAgentTranscript: the newest 100 lines, 「加载更早的对话」 for the ones before;
//     read again when a turn ends, `agent-changed` done): your words on the right; the main Agent's on the left with its round
//     mark, then its question (`ask`: one at a time, 2–4 quick answers — pressing one sends that answer as your words) and
//     the proposal cards it made in that turn (data.proposalIds; `proposals-changed` reads the cards again). A lookup, a
//     note, a summary is one faint line, never its text: 「查了：<库名> 的概况」 · 「记了一笔」 · 「较早的对话已缩成摘要」. What a
//     turn brought besides (agentSend's `notice`, and the same read back from the record's notes): 「这次没有听懂模型的回答」 ·
//     「有 N 张提议没出（格式不对）」 · 「会话接不上，已从记录里接着」 · the connection's problem with 「去设置」.
//   - The input (1–4000 characters) and 发送; while a turn runs (this page's or another's: 问库's change, 交给主 Agent) 「主
//     Agent 在想…」 shows and nothing can be sent. No connection chosen → v1.0's line 「还没选连接方式」 with 「去设置」.
//   - redesign R4a: params.send (首次打开's 发送) — that sentence is sent once when the page opens.
//   - v2 package I (contract I1, 首次打开's second step): while the app knows no library and you have said nothing yet, a guide above the conversation —
//     「告诉主 Agent 你想持续跟踪什么…」, three example sentences (a click puts one in the input and nothing is sent) and
//     「也可以手动新建」 (→ 新建库, app.js newLibrary()). No connection chosen in settings.json (getAppState().activeConnection) →
//     the guide says 「还没有连接，主 Agent 用不了」 with 「去设置」 (and the input's own v1.0 line is not drawn twice).
// v2 package L: the window's right panel (screens/right-panel.js) beside it; its 「详情」 is the latest turn — what the main Agent
// looked up in it ([data-part="detail-looked"] [data-detail-lookup]) and the cards it made ([data-part="detail-cards"]
// [data-detail-card=<id>][data-status]; a click scrolls to the card). Opened from 等你决定 with `params.card`, the page scrolls
// to that card ([data-proposal] in the conversation, else in 「等你定的事」).
// Words: texts/agent.js AGENT (and texts/common.js NO_CONNECTION, CONNECTIONS).
// Test hooks: main[data-screen="chat"][data-state], [data-part=waiting|waiting-items|conversation|intro|compose|thinking|
// no-connection|chat-note|first-guide|guide-no-connection], [data-action="example"][data-example=<0..2>], [data-action="manual-new"], [data-waiting=<n>], [data-waiting-card=<id>], [data-row=you|agent|lookup|note|summary][data-turn],
// [data-notice=<code>], [data-part="ask"] [data-action="quick"][data-option], [data-action=send|load-more|fold|see-card|
// go-settings], textarea[data-field="message"].
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useEvent } from '../lib/use-events.js'
import { useAgentBusy, useProposals, useSuggestions } from '../lib/agent.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, Icon, LinkButton, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, NO_CONNECTION } from '../texts/common.js'
import { AGENT } from '../texts/agent.js'
import { ProposalCard, cardTitle, libraryNameOf } from './proposal-card.js'
import { DetailBlock, RightPanel } from './right-panel.js'
import { PANEL } from '../texts/panel.js'
import { SuggestionCard } from './suggestion-card.js'

const T = AGENT.chat
const PAGE = 100
export const MESSAGE_MAX = 4000

const rowKey = r => `${r.turn}|${r.role}|${r.at}|${typeof r.text === 'string' ? r.text.length : 0}`

/** Two reads of the record as one list: every line once, in the record's order (turn by turn). */
export function mergeRows(have, got) {
  const seen = new Set(have.map(rowKey))
  const out = [...have]
  for (const r of Array.isArray(got) ? got : []) {
    const k = rowKey(r)
    if (!seen.has(k)) { seen.add(k); out.push(r) }
  }
  // stable: within a turn, the lines keep the order they came in
  return out.map((r, i) => [r, i]).sort((a, b) => a[0].turn - b[0].turn || a[1] - b[1]).map(x => x[0])
}

/** A lookup line in words (contract G3): 「查了：<库名> 的概况」 …; `nameOf(id)` gives a library's name. */
export function lookupText(row, nameOf = () => null) {
  const q = row?.data?.request ?? {}
  const L = AGENT.rows.lookup
  const name = q.libraryId ? nameOf(q.libraryId) ?? AGENT.rows.unknownLibrary : null
  switch (q.what) {
    case 'library': return fmt(L.library, { name: name ?? AGENT.rows.unknownLibrary })
    case 'source_log': return fmt(L.source_log, { name: name ?? AGENT.rows.unknownLibrary, source: q.name ?? '' })
    case 'proposals': return name ? fmt(L.proposalsOf, { name }) : L.proposals
    case 'suggestions': return name ? fmt(L.suggestionsOf, { name }) : L.suggestions
    case 'notes_search': return fmt(L.notes_search, { name: name ?? AGENT.rows.unknownLibrary })
    default: return L.other
  }
}

/** What a line of the record says happened besides the words (the same codes as agentSend's `notice`), or null. */
export function noticeOfRow(row) {
  const d = row?.data
  if (!d || typeof d !== 'object') return null
  if (row.role === 'agent') return d.fallback === true ? { code: 'not-understood' } : null
  if (row.role !== 'note') return null
  if (Array.isArray(d.dropped) && d.dropped.length) return { code: 'proposals-dropped', count: d.dropped.length }
  if (d.session === 'lost') return { code: 'session-rebuilt' }
  if (typeof d.error === 'string') return { code: 'connection', connection: d.error }
  return null
}

/** One notice as the page says it. */
export function Notice({ notice, onSettings }) {
  const code = notice?.code
  if (code === 'connection') {
    const c = notice.connection
    const text = c && Object.hasOwn(CONNECTIONS.codes, c) ? fmt(AGENT.notices.connection, { reason: CONNECTIONS.codes[c] }) : AGENT.notices.connectionOther
    return html`<div class="chat-notice chat-notice--wait" data-notice="connection" data-connection=${c ?? ''} role="alert">
      <span>${text}</span><${Act} name="go-settings" onClick=${onSettings}>${NO_CONNECTION.go}<//>
    </div>`
  }
  if (code === 'proposals-dropped') return html`<div class="chat-notice chat-notice--wait" data-notice=${code}>${fmt(AGENT.notices[code], { n: notice.count ?? 0 })}</div>`
  if (code === 'not-understood' || code === 'session-rebuilt') return html`<div class="chat-notice" data-notice=${code}>${AGENT.notices[code]}</div>`
  return null
}

/** v1.0's line for a step that needs a model while no connection is chosen. */
export function NoConnection({ onSettings }) {
  return html`<div class="chat-problem" data-part="no-connection" role="alert">
    <span class="st-t-wait">${NO_CONNECTION.text}</span><${Act} name="go-settings" onClick=${onSettings}>${NO_CONNECTION.go}<//>
  </div>`
}

/**
 * The input at the foot of the page (exported for the page-level test that draws it in each state).
 * @param {object} p
 * @param {boolean} p.busy - a turn of the main Agent runs: 「主 Agent 在想…」, nothing can be sent
 * @param {boolean} p.noConnection - v1.0's 「还没选连接方式」 with 「去设置」
 */
export function Compose({ text, onText, onSend, busy, noConnection, note, onSettings }) {
  const empty = !String(text ?? '').trim()
  const send = () => { if (!busy && !empty) onSend() }
  return html`<div class="chat-compose-wrap" data-part="compose" data-busy=${String(busy)}>
    ${noConnection ? html`<${NoConnection} onSettings=${onSettings} />` : null}
    ${busy ? html`<div class="chat-thinking st-t-small st-t-sub" data-part="thinking" role="status">${T.thinking}</div>` : null}
    ${note ? html`<div class="st-t-small st-t-wait" data-part="chat-note" role="alert">${note}</div>` : null}
    <div class="chat-compose">
      <textarea class="agent-textarea" data-field="message" rows="2" aria-label=${T.inputLabel} placeholder=${T.placeholder} maxlength=${MESSAGE_MAX}
        value=${text} disabled=${busy} onInput=${e => onText(e.currentTarget.value)}
        onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } }}></textarea>
      <${Act} name="send" variant="primary" disabled=${busy || empty} onClick=${send}>${T.send}<//>
    </div>
  </div>`
}

function YouBubble({ text, libraryName, turn, sending }) {
  return html`<div class="chat-me" data-row="you" data-turn=${turn ?? null} data-sending=${sending ? 'true' : null}>
    <span class="st-t-tiny st-t-muted">${AGENT.you}</span>
    <span class="chat-text">${text}</span>
    ${libraryName ? html`<span class="st-t-tiny st-t-muted" data-part="from-library">${fmt(T.fromLibrary, { name: libraryName })}</span>` : null}
  </div>`
}

/** The main Agent's words, its question and the cards of that turn (used by 问库 too). */
export function AgentBubble({ turn, text, ask, askOpen, busy, onQuick, cards, onSend, onChanged, children }) {
  return html`<div class="chat-bot" data-row="agent" data-turn=${turn ?? null}>
    <span class="agent-av agent-av--l" aria-hidden="true">${AGENT.avatar}</span>
    <div class="chat-bot__bubble">
      <span class="st-t-tiny st-t-muted">${AGENT.name}</span>
      ${text ? html`<div class="chat-text">${text}</div>` : null}
      ${ask && typeof ask.question === 'string' ? html`<div class="chat-ask" data-part="ask" data-open=${String(askOpen)}>
        <div class="chat-text">${ask.question}</div>
        ${askOpen ? html`<div class="chat-quick">${(Array.isArray(ask.options) ? ask.options : []).map(o => html`<span key=${o} class="st-act" data-action="quick" data-option=${o}>
          <button type="button" class="st-button chat-quick__button" disabled=${busy} onClick=${() => onQuick(o)}>${o}</button>
        </span>`)}</div>` : null}
      </div>` : null}
      ${(cards ?? []).map(c => html`<${ProposalCard} key=${c.id} card=${c} onSend=${onSend} onChanged=${onChanged} />`)}
      ${children}
    </div>
  </div>`
}

function Faint({ row, children }) {
  return html`<div class="chat-faint st-t-tiny st-t-muted" data-row=${row.role} data-turn=${row.turn}>${children}</div>`
}

/** 首次打开's second step (v2 package I): what to follow, three sentences to start from, the manual way. */
export function FirstGuide({ noConnection, onExample, onManual, onSettings }) {
  const G = AGENT.guide
  return html`<section class="chat-guide" data-part="first-guide" aria-labelledby="chat-guide-title">
    <h2 class="chat-guide__title" id="chat-guide-title">${G.title}</h2>
    <p class="chat-guide__text">${G.text}</p>
    ${noConnection ? html`<div class="chat-problem" data-part="guide-no-connection" role="alert">
      <span class="st-t-wait">${G.noConnection}</span><${Act} name="go-settings" onClick=${onSettings}>${G.goSettings}<//>
    </div>` : null}
    <div class="st-t-small st-t-sub">${G.examplesLabel}</div>
    <div class="chat-guide__examples">${G.examples.map((t, i) => html`<span key=${i} class="st-act" data-action="example" data-example=${i}>
      <button type="button" class="chat-guide__example" onClick=${() => onExample(t)}>${t}</button>
    </span>`)}</div>
    <div class="chat-guide__manual st-t-small">
      <span class="st-act" data-action="manual-new"><${LinkButton} onClick=${onManual}>${G.manual}<//></span>
      <span class="st-t-sub">${G.manualHint}</span>
    </div>
  </section>`
}

/** v2 package L, 详情: the latest turn's lookups and cards (a click on a card scrolls to it). */
function TurnDetail({ rows, nameOf, cardOf }) {
  const D = PANEL.detail.chat
  const last = rows.length ? Math.max(...rows.map(r => (Number.isInteger(r.turn) ? r.turn : -1))) : -1
  if (last < 0) return html`<p class="st-t-small st-t-sub st-rp-none" data-part="detail-none">${D.none}</p>`
  const mine = rows.filter(r => r.turn === last)
  const looked = mine.filter(r => r.role === 'lookup').map(r => lookupText(r, nameOf))
  const cards = mine.filter(r => r.role === 'agent').flatMap(r => (Array.isArray(r.data?.proposalIds) ? r.data.proposalIds : [])).map(id => cardOf(id) ?? { id, status: null })
  const go = id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"], [data-waiting-card="${id}"]`)?.scrollIntoView({ block: 'center' })
  return html`<${DetailBlock} where=${PANEL.detail.where.chat} title=${D.title} part="detail-chat">
    <section class="st-rp-section" data-part="detail-looked" data-turn=${last} data-n=${looked.length}>
      <h3 class="st-rp-heading">${fmt(D.looked, { n: looked.length })}</h3>
      ${looked.length ? html`<ul class="st-rp-looked">${looked.map((t, i) => html`<li key=${i} data-detail-lookup=${i}><${Icon} name="search" />${t}</li>`)}</ul>`
        : html`<p class="st-t-small st-t-muted">${D.lookedNone}</p>`}
    </section>
    <section class="st-rp-section" data-part="detail-cards" data-n=${cards.length}>
      <h3 class="st-rp-heading">${fmt(D.cards, { n: cards.length })}</h3>
      ${cards.length ? cards.map(c => html`<button type="button" key=${c.id} class="st-rp-decide" data-detail-card=${c.id} data-status=${c.status ?? ''} onClick=${() => go(c.id)}>
        <span class="st-rp-decide__kind st-rp-decide__kind--proposal">${PANEL.decide.proposal}</span>
        <b class="st-rp-decide__title">${c.kind ? cardTitle(c, nameOf(c.libraryId)) : c.id}</b>
        <span class="st-rp-decide__where">${[Object.hasOwn(D.cardState, c.status ?? '') ? D.cardState[c.status] : null, D.see].filter(Boolean).join(' · ')}<${Icon} name="chevron-right" /></span>
      </button>`) : html`<p class="st-t-small st-t-muted">${D.cardsNone}</p>`}
    </section>
  <//>`
}

export function ChatScreen({ params = {} }) {
  const { navigate, libraries, appState, newLibrary } = useApp()
  const proposals = useProposals()
  const suggestions = useSuggestions(null)
  const agent = useAgentBusy()
  const [entries, setEntries] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [more, setMore] = useState('idle')
  const [text, setText] = useState('')
  const [sending, setSending] = useState([])
  const [problem, setProblem] = useState(null)
  const [note, setNote] = useState(null)
  const [notices, setNotices] = useState({})
  const [open, setOpen] = useState(true)
  // what was decided in 「等你定的事」 stays there (with what became of it) until the page is left; it no longer counts
  const [keptCards, setKeptCards] = useState([])
  const [keptSuggestions, setKeptSuggestions] = useState([])
  const listRef = useRef(null)
  const toEnd = useRef(true)
  const keep = useRef(null)
  const inFlight = useRef(false)
  const nameOf = id => libraryNameOf(libraries?.data, id)
  const settings = () => navigate('settings')

  const latest = () => call('getAgentTranscript', { limit: PAGE })
  const load = async () => {
    try {
      const t = await latest()
      setEntries(have => mergeRows(have ?? [], t.entries))
      if (entries === null) setHasMore(t.hasMore === true)
      setLoadError(false)
    } catch { setLoadError(true) }
  }
  useEffect(() => {
    let live = true
    latest().then(t => { if (live) { setEntries(t.entries ?? []); setHasMore(t.hasMore === true) } }, () => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [])
  // v2 package L: opened from the right panel's 等你决定 with a card: scrolled to it once the record and the cards are here
  const shownCard = useRef(null)
  useEffect(() => {
    const id = typeof params.card === 'string' ? params.card : null
    if (!id || shownCard.current === id || entries === null || !proposals.data) return
    const el = document.querySelector(`[data-part="conversation"] [data-proposal="${id}"], [data-waiting-card="${id}"]`)
    if (!el) return
    shownCard.current = id
    toEnd.current = false
    el.scrollIntoView({ block: 'center' })
  })
  // a turn ended (this page's, 问库's, 交给主 Agent): the record again, and the end of it in view if it was there
  useEvent('agent-changed', p => {
    if (p?.phase !== 'done') return
    const el = listRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) toEnd.current = true
    load()
  })
  const earlier = async () => {
    if (!entries?.length || more === 'loading') return
    setMore('loading')
    try {
      // the first turn shown again too (a page of the record may start inside a turn): mergeRows keeps each line once
      const t = await call('getAgentTranscript', { limit: PAGE, before: entries[0].turn + 1 })
      const el = listRef.current
      keep.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null
      setEntries(have => mergeRows(t.entries ?? [], have ?? []))
      setHasMore(t.hasMore === true && (t.entries ?? []).length > 0)
      setMore('idle')
    } catch { setMore('failed') }
  }
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (keep.current) { el.scrollTop = keep.current.top + (el.scrollHeight - keep.current.height); keep.current = null; return }
    if (toEnd.current) { el.scrollTop = el.scrollHeight; toEnd.current = false }
  }, [entries, sending])

  const busy = sending.length > 0 || agent.busy
  /** Send a sentence to the main Agent. From the input (and a quick answer): only while no turn runs. After 改一下: queued. */
  const send = async (raw, { fromInput = false, queue = false } = {}) => {
    const t = String(raw ?? '').trim()
    if (!t) return
    if (!queue && (busy || inFlight.current)) { setNote(T.busy); return }
    if ([...t].length > MESSAGE_MAX) { setNote(T.tooLong); return }
    if (!queue) inFlight.current = true
    const mine = { text: t, at: Date.now() }
    setNote(null)
    setProblem(null)
    setSending(list => [...list, mine])
    toEnd.current = true
    if (fromInput) setText('')
    let got = null
    try {
      const r = await call('agentSend', t)
      if (Array.isArray(r?.notice) && r.notice.length) setNotices(n => ({ ...n, [r.turn]: r.notice }))
      try { got = await latest() } catch { /* the record is read again on the next turn */ }
    } catch (err) {
      if (err?.code === 'no_connection') setProblem('no_connection')
      else setNote(T.failed)
      if (fromInput) setText(have => (have ? have : t))
    } finally {
      if (!queue) inFlight.current = false
      // the record and the end of the sending in one draw (no line shown twice in between)
      if (got) setEntries(have => mergeRows(have ?? [], got.entries))
      setSending(list => list.filter(x => x !== mine))
    }
  }

  // redesign R4a: 首次打开's 发送 opens this page with the sentence (params.send): it is sent once, as if typed here — the first
  // real call of the connection (there is no separate 试一次)
  const handed = useRef(false)
  useEffect(() => {
    if (handed.current || typeof params.send !== 'string' || params.send.trim() === '') return
    handed.current = true
    void send(params.send)
  }, [])

  const rows = entries ?? []
  // the open question: the main Agent's latest one, with no words of yours after it
  let askAt = -1
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role === 'you') break
    if (rows[i].role === 'agent' && rows[i].data?.ask) { askAt = i; break }
  }
  const inChat = new Set(rows.flatMap(r => (r.role === 'agent' && Array.isArray(r.data?.proposalIds) ? r.data.proposalIds : [])))
  // a sentence being sent shows until the record has it
  const shownSending = sending.filter(s => !rows.some(r => r.role === 'you' && r.text === s.text && Date.parse(r.at) >= s.at - 2000))
  const cardsOf = r => (Array.isArray(r.data?.proposalIds) ? r.data.proposalIds.map(id => proposals.byId.get(id)).filter(Boolean) : [])
  const onChanged = c => proposals.put(c)
  const onWaitingChanged = c => { proposals.put(c); setKeptCards(l => (l.includes(c.id) ? l : [...l, c.id])) }
  const sendQueued = t => send(t, { queue: true })

  const items = []
  const derived = new Map()
  rows.forEach((r, i) => {
    const n = noticeOfRow(r)
    if (n) derived.set(r.turn, [...(derived.get(r.turn) ?? []), n.code])
    const k = `${rowKey(r)}#${i}`
    if (r.role === 'you') items.push(html`<${YouBubble} key=${k} text=${r.text} turn=${r.turn} libraryName=${r.data?.libraryId ? nameOf(r.data.libraryId) : null} />`)
    else if (r.role === 'agent') {
      items.push(html`<${AgentBubble} key=${k} turn=${r.turn} text=${r.text} ask=${r.data?.ask ?? null} askOpen=${i === askAt} busy=${busy}
        onQuick=${o => send(o)} cards=${cardsOf(r)} onSend=${sendQueued} onChanged=${onChanged} />`)
      if (n) items.push(html`<${Notice} key=${`${k}:n`} notice=${n} onSettings=${settings} />`)
    } else if (r.role === 'lookup') items.push(html`<${Faint} key=${k} row=${r}>${lookupText(r, nameOf)}<//>`)
    else if (r.role === 'summary') items.push(html`<${Faint} key=${k} row=${r}>${AGENT.rows.summary}<//>`)
    else if (n) items.push(html`<${Notice} key=${k} notice=${n} onSettings=${settings} />`)
    else {
      // a turn that starts with a note is a suggestion card handed over (交给主 Agent); any other note: 记了一笔
      const opens = i === 0 || rows[i - 1].turn !== r.turn
      items.push(html`<${Faint} key=${k} row=${r}>${opens ? AGENT.rows.handed : AGENT.rows.note}<//>`)
    }
    // the turn's notices from agentSend that its lines do not say already
    const last = i === rows.length - 1 || rows[i + 1].turn !== r.turn
    if (last && Array.isArray(notices[r.turn])) {
      for (const nn of notices[r.turn]) if (!(derived.get(r.turn) ?? []).includes(nn.code)) items.push(html`<${Notice} key=${`live:${r.turn}:${nn.code}`} notice=${nn} onSettings=${settings} />`)
    }
  })

  const n = proposals.pending.length + suggestions.items.length
  const waitingCards = [...proposals.pending, ...keptCards.map(id => proposals.byId.get(id)).filter(c => c && c.status !== 'pending')]
  const waitingSuggestions = [...suggestions.items, ...keptSuggestions.filter(k => !suggestions.items.some(x => x.libraryId === k.libraryId && x.key === k.key))]
  const shownWaiting = waitingCards.length + waitingSuggestions.length
  const noConnection = problem === 'no_connection' || (agent.status && agent.status.connection === null)
  // 首次打开's second step: the app knows no library yet. Redesign R4a: 首次打开 is one screen with these examples on it, so the guide
  // goes once you have said something here (a sentence of yours in the record, or one being sent)
  const guide = Array.isArray(libraries?.data) && libraries.data.length === 0 && sending.length === 0 && !rows.some(r => r.role === 'you')
  const guideNoConnection = guide && Boolean(appState?.data) && !appState.data.activeConnection
  const fill = t => {
    setText(t)
    setNote(null)
    setTimeout(() => document.querySelector('[data-part="compose"] textarea[data-field="message"]')?.focus(), 0)
  }
  const state = entries !== null ? 'ready' : loadError ? 'error' : 'loading'
  const detail = entries !== null ? html`<${TurnDetail} rows=${rows} nameOf=${nameOf} cardOf=${id => proposals.byId.get(id) ?? null} />` : null
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="chat" />`} panel=${html`<${RightPanel} detail=${detail} />`}>
    <${Main} screen="chat" state=${state} labelledby="chat-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h1" titleId="chat-title" />
      <div class="st-main__body chat-body">
        ${guide ? html`<${FirstGuide} noConnection=${guideNoConnection} onExample=${fill} onManual=${() => newLibrary?.()} onSettings=${settings} />` : null}
        <section class=${`chat-waiting${n ? '' : ' chat-waiting--none'}`} data-part="waiting" aria-labelledby="chat-waiting-title">
          <div class="chat-waiting__head">
            <h2 class="chat-waiting__title" id="chat-waiting-title" data-waiting=${n}>${n ? fmt(AGENT.waiting.title, { n }) : AGENT.waiting.none}</h2>
            ${shownWaiting ? html`<span class="st-act" data-action="fold"><button type="button" class="st-link-button" aria-expanded=${String(open)} onClick=${() => setOpen(o => !o)}>${open ? AGENT.waiting.fold : AGENT.waiting.unfold}</button></span>` : null}
          </div>
          ${shownWaiting && open ? html`<div class="chat-waiting__items" data-part="waiting-items">
            ${waitingSuggestions.map(s => html`<${SuggestionCard} key=${`${s.libraryId}:${s.key}`} item=${s} showLibrary=${true}
              onHandled=${h => setKeptSuggestions(l => [...l.filter(x => !(x.libraryId === h.libraryId && x.key === h.key)), h])}
              onAccepted=${t => { if (t && Array.isArray(t.notice) && t.notice.length) setNotices(m => ({ ...m, [t.turn]: t.notice })) }} />`)}
            ${waitingCards.map(c => (inChat.has(c.id) && c.status === 'pending'
              ? html`<div key=${c.id} class="chat-waiting__line st-t-small" data-waiting-card=${c.id}>
                  <span>${fmt(AGENT.waiting.inChat, { title: cardTitle(c, nameOf(c.libraryId)) })}</span>
                  <span class="st-act" data-action="see-card"><button type="button" class="st-link-button" onClick=${() => document.querySelector(`[data-part="conversation"] [data-proposal="${c.id}"]`)?.scrollIntoView({ block: 'center' })}>${AGENT.waiting.see}</button></span>
                </div>`
              : html`<div key=${c.id} data-waiting-card=${c.id}><${ProposalCard} card=${c} onSend=${sendQueued} onChanged=${onWaitingChanged} /></div>`))}
          </div>` : null}
        </section>
        <div class="chat-list" data-part="conversation" ref=${listRef}>
          ${loadError && entries === null ? html`<div class="st-t-wait" role="alert">${T.loadFailed}<${Act} name="reload" onClick=${() => { setLoadError(false); load() }}>${T.retry}<//></div>` : null}
          ${hasMore ? html`<div class="chat-more"><${Act} name="load-more" disabled=${more === 'loading'} onClick=${earlier}>${more === 'loading' ? T.loadingMore : T.loadMore}<//>
            ${more === 'failed' ? html`<span class="st-t-small st-t-wait" role="alert">${T.loadFailed}</span>` : null}</div>` : null}
          ${entries !== null && !hasMore ? html`<div class="chat-bot" data-part="intro">
            <span class="agent-av agent-av--l" aria-hidden="true">${AGENT.avatar}</span>
            <div class="chat-bot__bubble"><span class="st-t-tiny st-t-muted">${AGENT.name}</span><div class="chat-text">${T.intro}</div></div>
          </div>` : null}
          ${items}
          ${shownSending.map(s => html`<${YouBubble} key=${`sending:${s.at}`} text=${s.text} sending=${true} />`)}
        </div>
        <${Compose} text=${text} onText=${setText} onSend=${() => send(text, { fromInput: true })} busy=${busy} noConnection=${noConnection && !guideNoConnection} note=${note} onSettings=${settings} />
      </div>
    <//>
  <//>`
}
