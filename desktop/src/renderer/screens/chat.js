// 主 Agent — redesign R5b (docs/checks/2026-11-12-r5b/contract.md R5b-2; design 03-页面稿 P03, 07-模板版 streams/app.js 「主
// Agent」; F14, F15, O1), on the template's conversation parts as 问库 has them (R3): thread, date-line, user-message,
// assistant-message, speaker, composer.
//   The head (work-header): h1 「主 Agent」, P03's line, and on the right 「n 项待确认」 — n is the length of the right panel's
//   待确认 list (app.js useToConfirm: every library's, read again on its events); a click opens that tab. The page opens the
//   right panel on 待确认 (P03; 07 streams/app.js DEFAULT_TAB.agent = 'decide').
//   The conversation, from the record (getAgentTranscript: the newest 100 lines, 「加载更早的对话」 for the ones before; read again
//   when a turn ends, `agent-changed` done): a date line on top of each day (「主 Agent · 今天」), your words (user-message), the
//   main Agent's (assistant-message with its speaker 「主 Agent · 管理全部库」), its question (`ask`: one at a time, 2–4 quick
//   answers — pressing one sends that answer as your words) and the proposals it made in that turn (data.proposalIds): the full
//   card of the one kind (screens/proposal.js; `proposals-changed` reads them again, so a card decided in the right panel is
//   decided here too). A lookup, a note, a summary is one faint line, never its text (「已查询：<库名> 的概况」 …). What a turn
//   brought besides (agentSend's `notice`, and the same read back from the record's notes) is a progress-alert in the
//   interface's words (O9: never the connection's own text): 未能读取模型的回答 · n 项提议未能生成 · 会话已中断… · the
//   connection's problem with 「前往设置」.
//   There is NO 「等你定的事」 above the conversation any more (F15) and no 系统检测 in it (they are the right panel's).
//   The box (composer): P03's placeholder, 「主 Agent」 and 「Shift + Enter 换行」, send; under it the calls one message takes
//   (screens/proposal.js AGENT_CALLS: usually one for the answer and one more for each round of lookups — core agent/turn.mjs, at
//   most 3 rounds — and at most 18 with the retries and the summary: core TURN_CALLS, precheck fix 3). While a turn
//   runs (this page's or another's: 问库's change, 交由主 Agent 分析) 「主 Agent 正在处理…」 shows at the end of the conversation and
//   nothing can be sent. No connection chosen → 「尚未选择连接方式…」 with 「前往设置」.
//   - redesign R4a: params.send (首次打开's 发送) — that sentence is sent once when the page opens.
//   - v2 package I (contract I1, 首次打开's second step): while the app knows no library and you have said nothing yet, a guide
//     above the conversation — what to track, three example sentences (a click puts one in the input and nothing is sent) and
//     「手动创建」 (→ 新建库, app.js newLibrary()). No connection chosen in settings.json (getAppState().activeConnection) → the
//     guide says so with 「前往设置」 (and the box's own line is not drawn twice).
// v2 package L: the window's right panel (screens/right-panel.js) beside it; its 「详情」 is the latest turn — what the main Agent
// looked up in it ([data-part="detail-looked"] [data-detail-lookup]) and the proposals it made ([data-part="detail-cards"]
// [data-detail-card=<id>][data-status]; a click scrolls to the card). Opened with `params.card`, the page scrolls to that card.
// Words: texts/agent.js AGENT, texts/proposals.js PROPOSALS (and texts/common.js NO_CONNECTION, CONNECTIONS).
// Test hooks: main[data-screen="chat"][data-state], [data-part=to-confirm-chip][data-count], [data-part=conversation|intro|compose|
// thinking|no-connection|chat-note|first-guide|guide-no-connection|input-hint|date-line], [data-action="example"][data-example=<0..2>],
// [data-action="manual-new"], [data-row=you|agent|lookup|note|summary][data-turn] ([data-faint] on the faint ones),
// [data-notice=<code>], [data-part="ask"] [data-part="question"], [data-action="quick"][data-option], [data-action=send|load-more|
// go-settings|open-to-confirm], textarea[data-field="message"].
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt } from '../lib/format.js'
import { useEvent } from '../lib/use-events.js'
import { useAgentBusy, useProposals } from '../lib/agent.js'
import { TIcon } from '../lib/template-icons.js'
import { BrandMark } from '../lib/brand-mark.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, DAY, NO_CONNECTION } from '../texts/common.js'
import { AGENT } from '../texts/agent.js'
import { PROPOSALS } from '../texts/proposals.js'
import { AGENT_CALLS, Proposal, agentItem, libraryNameOf, proposalTitle } from './proposal.js'
import { DetailBlock, RightPanel } from './right-panel.js'
import { PANEL } from '../texts/panel.js'

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

/** A lookup line in words: 「已查询：<库名> 的概况」 …; `nameOf(id)` gives a library's name. */
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

/** One notice as the page says it (the template's progress-alert; the interface's words, never a raw text). */
export function Notice({ notice, onSettings }) {
  const code = notice?.code
  if (code === 'connection') {
    const c = notice.connection
    const text = c && Object.hasOwn(CONNECTIONS.codes, c) ? fmt(AGENT.notices.connection, { reason: CONNECTIONS.codes[c] }) : AGENT.notices.connectionOther
    return html`<div class="progress-alert st-notice" data-notice="connection" data-connection=${c ?? ''} role="alert">
      <span>${text}</span> <span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${onSettings}>${NO_CONNECTION.go}</button></span>
    </div>`
  }
  if (code === 'proposals-dropped') return html`<div class="progress-alert st-notice" data-notice=${code}>${fmt(AGENT.notices[code], { n: notice.count ?? 0 })}</div>`
  if (code === 'not-understood' || code === 'session-rebuilt') return html`<div class="progress-alert st-notice" data-notice=${code}>${AGENT.notices[code]}</div>`
  return null
}

/** v1.0's line for a step that needs a model while no connection is chosen. */
export function NoConnection({ onSettings }) {
  return html`<div class="progress-alert" data-part="no-connection" role="alert">
    <span>${NO_CONNECTION.text}</span> <span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${onSettings}>${NO_CONNECTION.go}</button></span>
  </div>`
}

/**
 * The box at the foot of the page (the template's composer; exported for the page-level test that draws it in each state).
 * @param {object} p
 * @param {boolean} p.busy - a turn of the main Agent runs: nothing can be sent
 * @param {boolean} p.noConnection - the line 「尚未选择连接方式…」 with 「前往设置」 (texts/common.js NO_CONNECTION)
 */
export function Compose({ text, onText, onSend, busy, noConnection, note, onSettings }) {
  const empty = !String(text ?? '').trim()
  const send = () => { if (!busy && !empty) onSend() }
  return html`<div class="composer-wrap" data-part="compose" data-busy=${String(busy)}>
    ${noConnection ? html`<${NoConnection} onSettings=${onSettings} />` : null}
    ${note ? html`<p class="progress-alert" data-part="chat-note" role="alert">${note}</p>` : null}
    <form class="composer" onSubmit=${e => { e.preventDefault(); send() }}>
      <textarea data-field="message" rows="2" aria-label=${T.inputLabel} placeholder=${T.placeholder} maxlength=${MESSAGE_MAX}
        value=${text} disabled=${busy} onInput=${e => onText(e.currentTarget.value)}
        onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } }}></textarea>
      <div class="composer-tools">
        <span class="chip"><${TIcon} name="spark" /> ${T.who}</span><small>${T.newline}</small><span class="spacer"></span>
        <span class="st-act" data-action="send"><button type="submit" class="send-btn" aria-label=${T.send} title=${T.send} disabled=${busy || empty}><${TIcon} name="send" /></button></span>
      </div>
    </form>
    <div class="compose-help" data-part="input-hint">${fmt(T.calls, AGENT_CALLS)}</div>
  </div>`
}

/** The main Agent's speaker line (流息's mark where the template drew its own brand's glyph, as 问库's). */
function Speaker() {
  return html`<div class="speaker"><span class="avatar"><${BrandMark} /></span>${AGENT.name} <small>${AGENT.role}</small></div>`
}

function YouMessage({ text, libraryName, turn, sending }) {
  return html`<div class="user-message" data-row="you" data-turn=${turn ?? null} data-sending=${sending ? 'true' : null}>${text}${libraryName
    ? html`<small class="st-from-library" data-part="from-library">${fmt(T.fromLibrary, { name: libraryName })}</small>` : null}</div>`
}

/** The main Agent's words, its question and the proposals of that turn. */
function AgentMessage({ turn, text, ask, askOpen, busy, onQuick, items, onSend, onChanged }) {
  return html`<div class="assistant-message" data-row="agent" data-turn=${turn ?? null}>
    <${Speaker} />
    ${text ? html`<p class="intro-copy" data-part="reply">${text}</p>` : null}
    ${ask && typeof ask.question === 'string' ? html`<div data-part="ask" data-open=${String(askOpen)}>
      <p class="intro-copy" data-part="question">${ask.question}</p>
      ${askOpen ? html`<div class="filters">${(Array.isArray(ask.options) ? ask.options : []).map(o => html`<span key=${o} class="st-act" data-action="quick" data-option=${o}>
        <button type="button" class="filter" disabled=${busy} onClick=${() => onQuick(o)}>${o}</button>
      </span>`)}</div>` : null}
    </div>` : null}
    ${items.length ? html`<div class="st-stack">${items.map(i => html`<${Proposal} key=${i.id} item=${i} size="full" onSend=${onSend} onChanged=${onChanged} />`)}</div>` : null}
  </div>`
}

function Faint({ row, children }) {
  return html`<p class="limit-note st-faint" data-faint="true" data-row=${row.role} data-turn=${row.turn}>${children}</p>`
}

/** 首次打开's second step (v2 package I): what to follow, three sentences to start from, the manual way. */
export function FirstGuide({ noConnection, onExample, onManual, onSettings }) {
  const G = AGENT.guide
  return html`<section class="home-context st-guide" data-part="first-guide" aria-labelledby="chat-guide-title">
    <h3 id="chat-guide-title">${G.title}</h3>
    <p>${G.text}</p>
    ${noConnection ? html`<div class="progress-alert" data-part="guide-no-connection" role="alert">
      <span>${G.noConnection}</span> <span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${onSettings}>${G.goSettings}</button></span>
    </div>` : null}
    <div class="section-label"><span>${G.examplesLabel}</span></div>
    ${G.examples.map((t, i) => html`<span key=${i} class="st-act" data-action="example" data-example=${i}>
      <button type="button" class="file-row" onClick=${() => onExample(t)}><span class="file-icon"><${TIcon} name="spark" /></span><span class="file-text">${t}</span></button>
    </span>`)}
    <p class="limit-note">
      <span class="st-act" data-action="manual-new"><button type="button" class="btn" onClick=${onManual}>${G.manual}</button></span>
      ${' '}${G.manualHint}
    </p>
  </section>`
}

/** v2 package L, 详情: the latest turn's lookups and proposals (a click on one scrolls to it). */
function TurnDetail({ rows, nameOf, cardOf }) {
  const D = PANEL.detail.chat
  const last = rows.length ? Math.max(...rows.map(r => (Number.isInteger(r.turn) ? r.turn : -1))) : -1
  if (last < 0) return html`<p class="st-rp-none" data-part="detail-none">${D.none}</p>`
  const mine = rows.filter(r => r.turn === last)
  const looked = mine.filter(r => r.role === 'lookup').map(r => lookupText(r, nameOf))
  const cards = mine.filter(r => r.role === 'agent').flatMap(r => (Array.isArray(r.data?.proposalIds) ? r.data.proposalIds : [])).map(id => cardOf(id) ?? { id, status: null })
  const go = id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)?.scrollIntoView({ block: 'center' })
  return html`<${DetailBlock} where=${PANEL.detail.where.chat} title=${D.title} part="detail-chat">
    <div class="panel-section" data-part="detail-looked" data-turn=${last} data-n=${looked.length}>
      <div class="section-label"><span>${fmt(D.looked, { n: looked.length })}</span></div>
      ${looked.length ? looked.map((t, i) => html`<div key=${i} class="activity-row" data-detail-lookup=${i}>${t}</div>`)
        : html`<p class="limit-note">${D.lookedNone}</p>`}
    </div>
    <div class="panel-section" data-part="detail-cards" data-n=${cards.length}>
      <div class="section-label"><span>${fmt(D.cards, { n: cards.length })}</span></div>
      ${cards.length ? cards.map(c => html`<button type="button" key=${c.id} class="file-row" data-detail-card=${c.id} data-status=${c.status ?? ''} onClick=${() => go(c.id)}>
        <span class="file-icon"><${TIcon} name="file" /></span>
        <span class="file-text">${c.kind ? proposalTitle(agentItem(c, nameOf(c.libraryId))) : c.id}<small>${[Object.hasOwn(D.cardState, c.status ?? '') ? D.cardState[c.status] : null, D.see].filter(Boolean).join(' · ')}</small></span>
        <${TIcon} name="arrow" />
      </button>`) : html`<p class="limit-note">${D.cardsNone}</p>`}
    </div>
  <//>`
}

export function ChatScreen({ params = {} }) {
  const { navigate, libraries, appState, newLibrary, toConfirm, setPanel } = useApp()
  const proposals = useProposals()
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
  const listRef = useRef(null)
  const toEnd = useRef(true)
  const keep = useRef(null)
  const inFlight = useRef(false)
  const nameOf = id => libraryNameOf(libraries?.data, id)
  const settings = () => navigate('settings')

  // P03 (07 streams/app.js DEFAULT_TAB.agent): on this page the right panel stands on 待确认
  useEffect(() => {
    const panel = appState?.data?.panel
    if (panel && panel.tab !== 'decide') setPanel?.({ tab: 'decide' })
  }, [])

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
  // opened with a card (详情, the right panel): scrolled to it once the record and the cards are here
  const shownCard = useRef(null)
  useEffect(() => {
    const id = typeof params.card === 'string' ? params.card : null
    if (!id || shownCard.current === id || entries === null || !proposals.data) return
    const el = document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)
    if (!el) return
    shownCard.current = id
    toEnd.current = false
    el.scrollIntoView({ block: 'center' })
  })
  // a turn ended (this page's, 问库's, 交由主 Agent 分析): the record again, and the end of it in view if it was there
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
  // 1.0.1 F2 (the maintainer 11-16: back on this page, the conversation stood at its top). Found in the real window (test/ui-v101.test.mjs):
  // this effect also runs when the page is first drawn — the record not read yet (entries null), the list as tall as its box,
  // nothing to scroll — and that first run used up `toEnd` (set it false); when the record came a moment later toEnd was false,
  // so nothing scrolled and the page stayed at scrollTop 0. The proposals' cards (useProposals) also come after the record and
  // make the conversation taller. So the end is scrolled to only once the record and the cards are both drawn, and only then is
  // toEnd used up. Opened with params.card, the effect below still moves to that card afterwards (useEffect runs after this).
  const cardsDrawn = proposals.data !== null || proposals.status === 'error'
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (keep.current) { el.scrollTop = keep.current.top + (el.scrollHeight - keep.current.height); keep.current = null; return }
    if (toEnd.current && entries !== null && cardsDrawn) { el.scrollTop = el.scrollHeight; toEnd.current = false }
  }, [entries, sending, cardsDrawn])

  const busy = sending.length > 0 || agent.busy
  /** Send a sentence to the main Agent. From the box (and a quick answer): only while no turn runs. After 提出修改: queued. */
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
  // a sentence being sent shows until the record has it
  const shownSending = sending.filter(s => !rows.some(r => r.role === 'you' && r.text === s.text && Date.parse(r.at) >= s.at - 2000))
  const itemsOf = r => (Array.isArray(r.data?.proposalIds) ? r.data.proposalIds.map(id => proposals.byId.get(id)).filter(Boolean).map(c => agentItem(c, nameOf(c.libraryId))) : [])
  const onChanged = c => proposals.put(c)
  const sendQueued = t => send(t, { queue: true })

  const items = []
  const derived = new Map()
  let day = null
  rows.forEach((r, i) => {
    const n = noticeOfRow(r)
    if (n) derived.set(r.turn, [...(derived.get(r.turn) ?? []), n.code])
    const k = `${rowKey(r)}#${i}`
    // a date line on top of each day of the conversation (「主 Agent · 今天」)
    const d = typeof r.at === 'string' ? dayText(r.at, DAY) : null
    if (d && d !== day) { day = d; items.push(html`<div key=${`day:${k}`} class="date-line" data-part="date-line">${fmt(T.dateLine, { day: d })}</div>`) }
    if (r.role === 'you') items.push(html`<${YouMessage} key=${k} text=${r.text} turn=${r.turn} libraryName=${r.data?.libraryId ? nameOf(r.data.libraryId) : null} />`)
    else if (r.role === 'agent') {
      items.push(html`<${AgentMessage} key=${k} turn=${r.turn} text=${r.text} ask=${r.data?.ask ?? null} askOpen=${i === askAt} busy=${busy}
        onQuick=${o => send(o)} items=${itemsOf(r)} onSend=${sendQueued} onChanged=${onChanged} />`)
      if (n) items.push(html`<${Notice} key=${`${k}:n`} notice=${n} onSettings=${settings} />`)
    } else if (r.role === 'lookup') items.push(html`<${Faint} key=${k} row=${r}>${lookupText(r, nameOf)}<//>`)
    else if (r.role === 'summary') items.push(html`<${Faint} key=${k} row=${r}>${AGENT.rows.summary}<//>`)
    else if (n) items.push(html`<${Notice} key=${k} notice=${n} onSettings=${settings} />`)
    else {
      // a turn that starts with a note is a 系统检测 handed over (交由主 Agent 分析); any other note: 已记录一条备注
      const opens = i === 0 || rows[i - 1].turn !== r.turn
      items.push(html`<${Faint} key=${k} row=${r}>${opens ? AGENT.rows.handed : AGENT.rows.note}<//>`)
    }
    // the turn's notices from agentSend that its lines do not say already
    const last = i === rows.length - 1 || rows[i + 1].turn !== r.turn
    if (last && Array.isArray(notices[r.turn])) {
      for (const nn of notices[r.turn]) if (!(derived.get(r.turn) ?? []).includes(nn.code)) items.push(html`<${Notice} key=${`live:${r.turn}:${nn.code}`} notice=${nn} onSettings=${settings} />`)
    }
  })

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
  // 「n 项待确认」: the right panel's list, the same number as its tab (O5)
  const n = toConfirm?.items?.length ?? 0
  const chip = html`<span class="st-act" data-action="open-to-confirm"><button type="button" class="status-chip st-chip-button" data-part="to-confirm-chip" data-count=${n}
    onClick=${() => setPanel?.({ open: true, tab: 'decide' })}><span class="dot"></span> ${fmt(PROPOSALS.chip, { n })}</button></span>`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="chat" />`} panel=${html`<${RightPanel} detail=${detail} />`}>
    <${Main} screen="chat" state=${state} labelledby="chat-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h1" titleId="chat-title" actions=${chip} />
      <div class="st-chat">
        <div class="st-main__body thread-scroll" ref=${listRef}>
          <div class="thread" data-part="conversation">
            ${guide ? html`<${FirstGuide} noConnection=${guideNoConnection} onExample=${fill} onManual=${() => newLibrary?.()} onSettings=${settings} />` : null}
            ${loadError && entries === null ? html`<div class="progress-alert" role="alert">${T.loadFailed} <span class="st-act" data-action="reload"><button type="button" class="btn quiet" onClick=${() => { setLoadError(false); load() }}>${T.retry}</button></span></div>` : null}
            ${hasMore ? html`<div class="st-more"><span class="st-act" data-action="load-more"><button type="button" class="btn quiet" disabled=${more === 'loading'} onClick=${earlier}>${more === 'loading' ? T.loadingMore : T.loadMore}</button></span>
              ${more === 'failed' ? html`<span class="limit-note" role="alert">${T.loadFailed}</span>` : null}</div>` : null}
            ${entries !== null && !hasMore ? html`<div class="assistant-message" data-part="intro"><${Speaker} /><p class="intro-copy">${T.intro}</p></div>` : null}
            ${items}
            ${shownSending.map(s => html`<${YouMessage} key=${`sending:${s.at}`} text=${s.text} sending=${true} />`)}
            ${busy ? html`<div class="assistant-message" data-part="thinking-row"><${Speaker} /><p class="limit-note" data-part="thinking" role="status">${T.thinking}</p></div>` : null}
          </div>
        </div>
        <${Compose} text=${text} onText=${setText} onSend=${() => send(text, { fromInput: true })} busy=${busy} noConnection=${noConnection && !guideNoConnection} note=${note} onSettings=${settings} />
      </div>
    <//>
  <//>`
}
