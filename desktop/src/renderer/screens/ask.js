// v2 package F: the 问库 tab of a library's page (screens/library-frame.js; design P6; its tab has the speech-bubble icon),
// otherwise as v1.0 had it.
// v2 package G (contract G4; design P6, UC3): the box sends sendLibraryMessage instead of askLibrary (placeholder 「问这个库，
// 或者说说想怎么改它…」, and under it what the box does). The main process routes the sentence (docs/desktop.md §4.7):
//   question → the answer below, as v1.0 drew it (askLibrary's same path);
//   change   → 「这句转给主 Agent」 beside your words, then the main Agent's reply and its proposal cards (screens/proposal-card.js)
//              in the same conversation (its question's quick answers and a card's 改一下 go to it with this library's id);
//   unsure   → 「这是要改这个库吗？」 with 「是，改这个库」 / 「不是，问问题」 → resolveLibraryMessage(text, 'change' | 'question').
// The turns handed over are in the main Agent's record too, so 和主 Agent 聊 shows them.
// 问库 (mockup S10; docs/desktop.md §4.2). The top bar says the answer only uses the library, and over what (已收藏 n 条 ·
// 我写的 n 条: getLibrary's counts). The conversation: each question, then the answer the core's ask gives (askLibrary):
// every sentence followed by its numbered sources as superscripts; a click on a number marks that source in the list
// under the answer, and 「打开」 there opens the note in 资料库. When the check took sources or sentences out
// (`removedCites` / `removedSentences`), a line says so. `notInLibrary` is a real answer — 「库里没有。」 — and, like any
// answer that names what is missing (`missing`), offers 「记到想补的主题」 with the phrase filled in (addDemand). 「这个回答哪里
// 不对」 opens a line to write (answerFeedback). While a question runs the field is disabled and 「正在查库……」 shows; no
// connection chosen → 「还没选连接方式」 with 「去设置」. The right panel: what this answer used (hits · used · calls · the
// connection · no tools, no network) and the topics you want more of (getDemands; 3 asks or more → 「建议加成主题」).
// Test hooks: main[data-screen="ask"][data-state], textarea[data-field="question"], [data-action=send|open-cite|add-demand|
// feedback|send-feedback|go-settings|route-change|route-question], [data-turn=<i>][data-state][data-route][data-by],
// [data-part=routed|unsure|handing|input-hint], [data-sentence=<i>], [data-cite=<n>],
// [data-source-n=<n>][data-highlight], [data-part=asking|removed-cites|removed-sentences|not-in-library|missing|used|demands],
// input[data-field="demand-topic"], textarea[data-field="feedback"], [data-demand=<topic>][data-count][data-suggest].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { useProposals } from '../lib/agent.js'
import { Panel, Tag, TopBar } from '../kit/index.js'
import { LibraryFrame } from './library-frame.js'
import { AgentBubble, Notice } from './chat.js'
import { AGENT } from '../texts/agent.js'
import { BRAND, CONNECTIONS, NO_CONNECTION } from '../texts/common.js'
import { ASK as T } from '../texts/ask.js'

const MAX_CHARS = 500
const sizeOf = v => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0)

function DemandBox({ question, missing, onAdded }) {
  const [topic, setTopic] = useState(missing ?? '')
  const [state, setState] = useState(null)
  const add = async () => {
    const t = topic.trim()
    if (!t) { setState({ kind: 'error' }); return }
    setState({ kind: 'busy' })
    try { await call('addDemand', t, question); setState({ kind: 'done', topic: t }); onAdded() } catch { setState({ kind: 'error' }) }
  }
  if (state?.kind === 'done') return html`<div class="ask-demand st-t-small st-t-done" data-part="demand-added" role="status">${fmt(T.demand.added, { topic: state.topic })}</div>`
  return html`<div class="ask-demand" data-part="demand">
    <input class="ask-input-line" data-field="demand-topic" aria-label=${T.demand.label} placeholder=${T.demand.label} value=${topic} onInput=${e => setTopic(e.currentTarget.value)} />
    <${Act} name="add-demand" disabled=${state?.kind === 'busy'} onClick=${add}>${T.demand.add}<//>
    ${state?.kind === 'error' ? html`<span class="st-t-small st-t-wait" role="alert">${T.demand.failed}</span>` : null}
  </div>`
}

function FeedbackBox({ question }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState(null)
  const send = async () => {
    if (!text.trim()) { setState('error'); return }
    setState('busy')
    try { await call('answerFeedback', question, text.trim()); setState('done') } catch { setState('error') }
  }
  if (state === 'done') return html`<div class="st-t-small st-t-done" data-part="feedback-sent" role="status">${T.feedback.sent}</div>`
  if (!open) return html`<${Act} name="feedback" onClick=${() => setOpen(true)}>${T.feedback.open}<//>`
  return html`<div class="ask-feedback" data-part="feedback">
    <label class="st-t-small st-t-sub" for="ask-feedback">${T.feedback.label}</label>
    <textarea id="ask-feedback" class="ask-textarea" data-field="feedback" rows="2" placeholder=${T.feedback.placeholder} value=${text} onInput=${e => setText(e.currentTarget.value)}></textarea>
    <div class="ask-row">
      <${Act} name="send-feedback" disabled=${state === 'busy'} onClick=${send}>${T.feedback.send}<//>
      <${Act} name="cancel-feedback" onClick=${() => setOpen(false)}>${T.feedback.cancel}<//>
      ${state === 'error' ? html`<span class="st-t-small st-t-wait" role="alert">${T.feedback.failed}</span>` : null}
    </div>
  </div>`
}

/** One answer under its question (exported for the page-level test that draws a given answer: test/ui-ask.test.mjs). */
export function Answer({ turn, index, highlight, onCite, onOpen, onDemand, onSettings }) {
  if (turn.status === 'asking') return html`<div class="ask-answer st-t-sub" data-part="asking" role="status">${T.asking}</div>`
  if (turn.status === 'error') {
    if (turn.code === 'no_connection') {
      return html`<div class="ask-answer" data-part="no-connection" role="alert">
        <span class="st-t-wait">${NO_CONNECTION.text}</span>
        <${Act} name="go-settings" onClick=${onSettings}>${NO_CONNECTION.go}<//>
      </div>`
    }
    return html`<div class="ask-answer st-t-wait" data-part="ask-error" role="alert">${turn.code === 'bad_arguments' ? T.busy : T.failedOther}</div>`
  }
  const r = turn.result ?? {}
  if (r.ok === false) {
    const reason = Object.hasOwn(CONNECTIONS.codes, r.code) ? CONNECTIONS.codes[r.code] : String(r.code ?? '')
    return html`<div class="ask-answer st-t-wait" data-part="ask-error" data-code=${r.code ?? ''} role="alert">${fmt(T.failed, { reason })}</div>`
  }
  const sentences = Array.isArray(r.answer) ? r.answer : []
  const sources = Array.isArray(r.sources) ? r.sources : []
  const removedCites = sizeOf(r.removedCites)
  const removedSentences = sizeOf(r.removedSentences)
  const lit = highlight?.turn === index ? highlight.n : null
  return html`<div class="ask-answer">
    ${r.notInLibrary ? html`<div class="ask-none" data-part="not-in-library">
      <p class="st-t-strong">${T.answer.notInLibrary}</p>
      <p class="st-t-small st-t-sub">${T.answer.notInLibraryText}</p>
    </div>` : null}
    ${sentences.length ? html`<p class="ask-sentences">${sentences.map((s, i) => html`<span key=${i} class="ask-sentence" data-sentence=${i}>${s.text}${(Array.isArray(s.cites) ? s.cites : []).map(n => html`<sup key=${n} class="ask-cite-wrap"><button type="button" class=${`ask-cite${lit === n ? ' ask-cite--lit' : ''}`} data-cite=${n} aria-label=${fmt(T.answer.citeLabel, { n })} onClick=${() => onCite(n)}>${n}</button></sup>`)} </span>`)}</p>` : null}
    ${removedCites > 0 ? html`<div class="ask-removed st-t-small" data-part="removed-cites" data-n=${removedCites}>${fmt(T.answer.removedCites, { n: removedCites })}</div>` : null}
    ${removedSentences > 0 ? html`<div class="ask-removed st-t-small" data-part="removed-sentences" data-n=${removedSentences}>${fmt(T.answer.removedSentences, { n: removedSentences })}</div>` : null}
    ${sources.length ? html`<ol class="ask-sources" aria-label=${T.answer.sources}>
      ${sources.map(s => html`<li key=${s.n} class=${`ask-source${lit === s.n ? ' ask-source--lit' : ''}`} data-source-n=${s.n} data-id=${s.id} data-highlight=${String(lit === s.n)}>
        <span class="ask-source__n st-t-strong">${s.n}</span>
        <span class="ask-source__title">${s.title}</span>
        <span class="st-t-small st-t-muted">${s.date ?? ''}</span>
        <${Act} name="open-cite" onClick=${() => onOpen(s.id)}>${T.answer.open}<//>
      </li>`)}
    </ol>` : null}
    ${r.missing ? html`<div class="st-t-small st-t-sub" data-part="missing">${fmt(T.answer.missing, { missing: r.missing })}</div>` : null}
    <div class="ask-row">
      ${r.notInLibrary || r.missing ? html`<${DemandBox} question=${turn.question} missing=${r.missing ?? ''} onAdded=${onDemand} />` : null}
      <${FeedbackBox} question=${turn.question} />
    </div>
  </div>`
}

function UsedPanel({ result, connection }) {
  if (!result || result.ok === false) return html`<p class="st-t-small st-t-muted">${T.panel.none}</p>`
  const name = connection && Object.hasOwn(CONNECTIONS.names, connection) ? CONNECTIONS.names[connection] : null
  const v = result.verification ?? null
  return html`<div class="ask-used">
    <div data-used="hits" data-candidates=${sizeOf(result.candidates)} data-used-n=${sizeOf(result.used)}>${fmt(T.panel.hits, { candidates: sizeOf(result.candidates), used: sizeOf(result.used) })}</div>
    <div data-used="calls" data-calls=${result.calls ?? 0}>${name ? fmt(T.panel.calls, { n: result.calls ?? 0, name }) : fmt(T.panel.callsNoName, { n: result.calls ?? 0 })}</div>
    ${v ? html`<div data-used="check" data-passed=${String(v.passed === true)}>${fmt(T.panel.check, { rounds: v.rounds ?? 0, passed: v.passed ? T.panel.checkPassed : T.panel.checkFailed })}</div>` : null}
    <div class="st-t-strong">${T.panel.noTools}</div>
  </div>`
}

/** 「这是要改这个库吗？」 under a sentence the routing could not tell (route unsure): you choose. */
export function RouteChoice({ busy, onChoose }) {
  return html`<div class="ask-unsure" data-part="unsure" role="group" aria-label=${T.route.unsure}>
    <span class="st-t-strong">${T.route.unsure}</span>
    <div class="ask-row">
      <${Act} name="route-change" variant="primary" disabled=${busy} onClick=${() => onChoose('change')}>${T.route.yes}<//>
      <${Act} name="route-question" disabled=${busy} onClick=${() => onChoose('question')}>${T.route.no}<//>
    </div>
  </div>`
}

export function AskScreen() {
  const { navigate, appState } = useApp()
  const libraryId = appState?.data?.library?.libraryId ?? null
  const counts = useLoad(() => call('getLibrary', 'kept', { topics: [], days: null }).then(r => r?.counts ?? null), [])
  const demands = useLoad(() => call('getDemands'), [])
  const conns = useLoad(() => call('getConnections').catch(() => null), [])
  const proposals = useProposals()
  useEvent('library-changed', () => { counts.reload(); demands.reload() })
  useEvent('connections-changed', () => conns.reload())
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState([])
  const [highlight, setHighlight] = useState(null)
  const [note, setNote] = useState(null)
  const listRef = useRef(null)
  // a choice in 「这是要改这个库吗？」 is taken once (a second press before the page draws again does nothing)
  const chosen = useRef(new Set())
  const running = turns.some(t => t.status === 'asking')
  const toEnd = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight })
  // each turn has its own id (a card's 改一下 can add a turn long after the one it belongs to)
  const seq = useRef(0)
  const addTurn = turn => { const id = ++seq.current; setTurns(list => [...list, { id, ...turn }]); return id }
  const patch = (id, p) => setTurns(list => list.map(t => (t.id === id ? { ...t, ...p } : t)))
  /** A sentence of the box, routed by the main process (sendLibraryMessage): answered here, handed to the main Agent, or unsure. */
  const send = async () => {
    const q = question.trim()
    if (!q || running) return
    if ([...q].length > MAX_CHARS) { setNote(T.tooLong); return }
    setNote(null)
    const index = addTurn({ question: q, status: 'asking', route: null })
    setQuestion('')
    try {
      const r = await call('sendLibraryMessage', q)
      if (r?.route === 'unsure') patch(index, { status: 'unsure', route: 'unsure', by: r.by })
      else patch(index, { status: 'done', route: r?.route ?? 'question', by: r?.by, result: r?.result ?? null })
      if (r?.route === 'question') demands.reload()
    } catch (err) { patch(index, { status: 'error', code: err?.code ?? null }) }
    toEnd()
  }
  /** Your answer to 「这是要改这个库吗？」: resolveLibraryMessage with the route you chose. */
  const choose = async (index, route) => {
    const turn = turns.find(t => t.id === index)
    if (!turn || turn.status !== 'unsure' || running || chosen.current.has(index)) return
    chosen.current.add(index)
    patch(index, { status: 'asking', route, by: 'you' })
    try {
      const r = await call('resolveLibraryMessage', turn.question, route)
      patch(index, { status: 'done', route: r?.route ?? route, by: 'you', result: r?.result ?? null })
      if (route === 'question') demands.reload()
    } catch (err) { patch(index, { status: 'error', route, code: err?.code ?? null }) }
    toEnd()
  }
  /** Words for the main Agent straight from this box: a quick answer to its question, or the sentence of 改一下. */
  const toAgent = async text => {
    const t = String(text ?? '').trim()
    if (!t) return
    const index = addTurn({ question: t, status: 'asking', route: 'change', via: 'agent' })
    try {
      const r = await call('agentSend', t, libraryId ? { libraryId } : null)
      patch(index, { status: 'done', result: r })
    } catch (err) { patch(index, { status: 'error', code: err?.code ?? null }) }
    toEnd()
  }
  const latest = [...turns].reverse().find(t => t.status === 'done' && t.route === 'question')?.result ?? null
  const c = counts.data
  const list = Array.isArray(demands.data) ? demands.data : []
  const panel = html`<${Panel} label=${T.panel.used}>
    <div class="ask-panel">
      <section class="ask-panel__block" data-part="used" aria-labelledby="ask-used">
        <h2 class="st-t-small st-t-sub st-t-strong" id="ask-used">${T.panel.used}</h2>
        <p class="st-t-small st-t-sub">${T.panel.how}</p>
        <${UsedPanel} result=${latest} connection=${conns.data?.active ?? null} />
      </section>
      <section class="ask-panel__block" data-part="demands" aria-labelledby="ask-demands">
        <h2 class="st-t-small st-t-sub st-t-strong" id="ask-demands">${fmt(T.panel.demands, { n: list.length })}</h2>
        ${list.length ? html`<ul class="ask-demands">${list.map(dm => html`<li key=${dm.topic} data-demand=${dm.topic} data-count=${dm.count} data-suggest=${String(dm.suggest === true)}>
          <span>${fmt(T.panel.demandLine, { topic: dm.topic, n: dm.count })}</span>
          ${dm.suggest ? html`<${Tag} tone="wait">${T.panel.suggest}<//>` : null}
        </li>`)}</ul>` : html`<p class="st-t-small st-t-muted">${T.panel.demandsNone}</p>`}
        <p class="st-t-tiny st-t-muted">${T.panel.demandsHint}</p>
      </section>
    </div>
  <//>`
  const cardsOf = r => (Array.isArray(r?.proposalIds) ? r.proposalIds.map(id => proposals.byId.get(id)).filter(Boolean) : [])
  const reply = (t, i) => {
    if (t.status === 'unsure') return html`<${RouteChoice} busy=${running} onChoose=${route => choose(t.id, route)} />`
    if (t.route === 'change' && t.status === 'asking') return html`<div class="ask-answer st-t-sub" data-part="handing" role="status">${T.route.handing}</div>`
    if (t.route === 'change' && t.status === 'done') {
      const r = t.result ?? {}
      return html`<${AgentBubble} turn=${null} text=${r.reply ?? ''} ask=${r.ask ?? null} askOpen=${i === turns.length - 1} busy=${running}
        onQuick=${o => toAgent(o)} cards=${cardsOf(r)} onSend=${toAgent} onChanged=${card => proposals.put(card)}>
        ${(Array.isArray(r.notice) ? r.notice : []).map(n => html`<${Notice} key=${n.code} notice=${n} onSettings=${() => navigate('settings')} />`)}
      <//>`
    }
    return html`<div class="ask-a">
      <span class="ask-a__mark" aria-hidden="true">${BRAND.mark}</span>
      <${Answer} turn=${t} index=${i} highlight=${highlight} onCite=${n => setHighlight({ turn: i, n })}
        onOpen=${id => navigate('library', { id })} onDemand=${() => demands.reload()} onSettings=${() => navigate('settings')} />
    </div>`
  }
  return html`<${LibraryFrame} tab="ask" state=${c ? 'ready' : counts.status} labelledby="ask-title" panel=${panel}>
      <${TopBar} title=${T.title} titleTag="h2" titleId="ask-title" subtitle=${c ? fmt(T.scope, { kept: c.kept ?? 0, authored: c.authored ?? 0 }) : null} />
      <div class="st-main__body ask-body">
        <div class="ask-list" data-part="conversation" ref=${listRef}>
          ${turns.length ? null : html`<p class="st-t-small st-t-muted ask-empty">${T.empty}</p>`}
          ${turns.map((t, i) => html`<section key=${t.id} class="ask-turn" data-turn=${i} data-state=${t.status} data-route=${t.route ?? ''} data-by=${t.by ?? ''}>
            <div class="ask-q-row">
              ${t.route === 'change' && t.via !== 'agent' ? html`<span class="ask-routed st-t-tiny" data-part="routed">${T.route.routed}</span>` : null}
              <div class="ask-q"><span class="ask-q__who st-t-tiny st-t-muted">${t.route === 'question' || t.route === null ? T.you : AGENT.you}</span><span class="ask-q__text">${t.question}</span></div>
            </div>
            ${reply(t, i)}
          </section>`)}
        </div>
        <div class="ask-compose">
          <div class="ask-compose__field">
            <textarea class="ask-textarea" data-field="question" rows="2" aria-label=${T.inputLabel} placeholder=${T.inputPlaceholder} maxlength=${MAX_CHARS}
              value=${question} disabled=${running} onInput=${e => setQuestion(e.currentTarget.value)}
              onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } }}></textarea>
            <span class="st-t-tiny st-t-muted" data-part="input-hint">${T.inputHint}</span>
          </div>
          <${Act} name="send" variant="primary" disabled=${running || !question.trim()} onClick=${send}>${T.send}<//>
        </div>
        ${running ? html`<div class="st-t-small st-t-sub ask-status" data-part="asking-bar" role="status">${T.asking}</div>` : null}
        ${note ? html`<div class="st-t-small st-t-wait" role="alert">${note}</div>` : null}
      </div>
  <//>`
}
