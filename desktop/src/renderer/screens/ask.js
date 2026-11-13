// 问库 — redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-5; design 03-页面稿 P13, 07-模板版 streams/app.js 「问库」; F41–F44),
// built on the template's conversation parts (thread, date-line, user-message, assistant-message, speaker, cite, file-row,
// after-card, composer).
//   On top one line (date-line): 「仅基于库内内容回答 · 范围：已收藏 n 条 · 我的笔记 n 条 · 不联网」 (getLibrary's counts).
//   The box sends sendLibraryMessage; the main process routes the sentence (docs/desktop.md §4.7):
//     question → the answer: its sentences, each with its cite numbers (`cite`; a click marks that note in the list); the notes
//                cited (file-row: number, title, date · 打开 → that note in 资料库, 查看原文 → Streams' reading window for a web
//                source); what the check took out; 「库内暂无相关内容。」 is a real answer (V9's sentence — 维护者 11-11 第 16 题 changed it in
//                R6a with the standard); 「库内缺少：…」 + 「记到想补的主题」 (addDemand) — once pressed 「已加入待补充主题」, and so when
//                the page is opened again: the state is read from getDemands (`added`: the questions it was pressed for, the
//                core's record), not kept by the page; 「反馈回答问题」 (answerFeedback).
//     change   → 「已转交主 Agent」: the main Agent's words and its proposal cards (screens/proposal-card.js: 确认 · 提出修改 ·
//                拒绝) in the conversation; the same cards are in the right panel's 待确认 (useWaitingItems, the same bridge
//                calls), so a card decided in one place is decided in the other (proposals-changed reads both again).
//     unsure   → 「这句话是要修改该库吗？」 with 是 / 否 → resolveLibraryMessage(text, 'change' | 'question').
//   The conversation stays while you go to another tab and come back (the app's memory, per library; gone when the app quits).
//   Under the box: 「每次提问约 2–5 次模型调用 · 如需调整来源、主题或要求，可直接描述」 (ASK_CALLS: the routing — none when its rules
//   decide, else one call — then the answer and its check: one call each, a second round when the check sends it back).
//   The right panel's 详情: 「引用了 n 篇笔记」, the line of what this answer used (命中 · 引用 · 模型调用 · 核验 · 模型未获得任何工具
//   权限，未联网), 本次回答依据 (the cited notes; a click opens it in 资料库), 待补充主题（n） (each with 已提问 n 次; 「提问达 3 次的内
//   容将建议添加为主题。」).
// Test hooks: main[data-screen="ask"][data-state], [data-part="scope"], textarea[data-field="question"], [data-part="input-hint"],
// [data-action=send|open-cite|cite-original|add-demand|feedback|send-feedback|go-settings|route-change|route-question],
// [data-turn=<i>][data-state][data-route][data-by], [data-part=agent-reply] [data-part=reply], [data-part=routed|unsure|handing|asking|removed-cites|removed-sentences|
// not-in-library|missing|demand|demand-added|feedback|feedback-sent|ask-error|no-connection], [data-sentence=<i>], [data-cite=<n>],
// [data-source-n=<n>][data-id][data-highlight], input[data-field="demand-topic"], textarea[data-field="feedback"]; 详情:
// [data-part="detail-ask"] with [data-part=detail-lead|detail-cites] [data-detail-cite=<n>][data-id], [data-part="demands"]
// [data-demand=<topic>][data-count][data-suggest].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { useProposals } from '../lib/agent.js'
import { TIcon } from '../lib/template-icons.js'
import { BrandMark } from '../lib/brand-mark.js'
import { LibraryFrame } from './library-frame.js'
import { Notice } from './chat.js'
import { ProposalCard } from './proposal-card.js'
import { CONNECTIONS, NO_CONNECTION, SEP } from '../texts/common.js'
import { ASK as T } from '../texts/ask.js'
import { PANEL } from '../texts/panel.js'
import { DetailBlock } from './right-panel.js'

const MAX_CHARS = 500
/** Model calls a question takes: the routing (0 when its rules decide, else 1) + the answer and its check (1 each), twice at most. */
export const ASK_CALLS = Object.freeze({ lo: 2, hi: 5 })
const sizeOf = v => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0)
const isWeb = u => typeof u === 'string' && /^https?:\/\//i.test(u)
// the same folding as the core's topicKey: trimmed, inner white space one space, lower case
const keyOf = t => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').toLowerCase() : '')

/** Whether 「记到想补的主题」 was pressed for this topic and question (getDemands' `added`, the core's record). */
export function demandAdded(demands, topic, question) {
  const row = (Array.isArray(demands) ? demands : []).find(d => keyOf(d.topic) === keyOf(topic))
  const q = typeof question === 'string' && question.trim() ? question.trim() : null
  return Boolean(row && Array.isArray(row.added) && row.added.some(a => a === q))
}

/** 库内缺少 + 记到想补的主题 → 已加入待补充主题 (a topic the answer names; with none, a field to write one). */
function Demand({ question, missing, demands, onAdded }) {
  const [topic, setTopic] = useState(missing ?? '')
  const [state, setState] = useState(null)
  // the topic written here and noted (an answer that names none): what it was noted as, while this answer is on the page
  const [noted, setNoted] = useState(null)
  const named = typeof missing === 'string' && missing.trim() !== ''
  // an answer that names what the library lacks: added or not is the core's record (getDemands' `added`), so it stays so when
  // the page is opened again; one that names nothing: the topic you wrote, once noted
  const added = named ? demandAdded(demands, missing, question) : noted !== null && demandAdded(demands, noted, question)
  const add = async () => {
    const t = (named ? missing : topic).trim()
    if (!t) { setState('error'); return }
    setState('busy')
    try { await call('addDemand', t, question); setNoted(t); setState(null); onAdded() } catch { setState('error') }
  }
  if (added) return html`<span class="st-ask-added" data-part="demand-added" role="status"><${TIcon} name="check" /> ${T.demand.added}</span>`
  return html`<span class="st-ask-demand" data-part="demand">
    ${named ? null : html`<input class="st-ask-input" data-field="demand-topic" aria-label=${T.demand.label} placeholder=${T.demand.label} value=${topic} onInput=${e => setTopic(e.currentTarget.value)} />`}
    <span class="st-act" data-action="add-demand"><button type="button" disabled=${state === 'busy'} onClick=${add}>${T.demand.add}</button></span>
    ${state === 'error' ? html`<span role="alert">${T.demand.failed}</span>` : null}
  </span>`
}

function Feedback({ question }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState(null)
  const send = async () => {
    if (!text.trim()) { setState('error'); return }
    setState('busy')
    try { await call('answerFeedback', question, text.trim()); setState('done') } catch { setState('error') }
  }
  if (state === 'done') return html`<span data-part="feedback-sent" role="status">${T.feedback.sent}</span>`
  if (!open) return html`<span class="st-act" data-action="feedback"><button type="button" onClick=${() => setOpen(true)}>${T.feedback.open}</button></span>`
  return html`<div class="st-ask-feedback" data-part="feedback">
    <label class="field"><span>${T.feedback.label}</span>
      <textarea data-field="feedback" rows="2" placeholder=${T.feedback.placeholder} value=${text} onInput=${e => setText(e.currentTarget.value)}></textarea></label>
    <div class="row">
      <span class="st-act" data-action="send-feedback"><button type="button" class="btn" disabled=${state === 'busy'} onClick=${send}>${T.feedback.send}</button></span>
      <span class="st-act" data-action="cancel-feedback"><button type="button" class="btn quiet" onClick=${() => setOpen(false)}>${T.feedback.cancel}</button></span>
      ${state === 'error' ? html`<span class="limit-note" role="alert">${T.feedback.failed}</span>` : null}
    </div>
  </div>`
}

/**
 * One answer under its question (exported for the page-level test that draws a given answer: test/ui-ask.test.mjs).
 * `demands` (getDemands) says whether 「记到想补的主题」 was pressed; `sourceOf(id)` a note's web source (查看原文).
 */
export function Answer({ turn, index, highlight, onCite, onOpen, onOriginal, onDemand, onSettings, demands = [], sourceOf = () => null }) {
  if (turn.status === 'asking') return html`<p class="limit-note" data-part="asking" role="status">${T.asking}</p>`
  if (turn.status === 'error') {
    if (turn.code === 'no_connection') {
      return html`<div class="progress-alert" data-part="no-connection" role="alert">
        <span>${NO_CONNECTION.text}</span> <span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${onSettings}>${NO_CONNECTION.go}</button></span>
      </div>`
    }
    return html`<div class="progress-alert" data-part="ask-error" role="alert">${turn.code === 'bad_arguments' ? T.busy : T.failedOther}</div>`
  }
  const r = turn.result ?? {}
  if (r.ok === false) {
    const reason = Object.hasOwn(CONNECTIONS.codes, r.code) ? CONNECTIONS.codes[r.code] : String(r.code ?? '')
    return html`<div class="progress-alert" data-part="ask-error" data-code=${r.code ?? ''} role="alert">${fmt(T.failed, { reason })}</div>`
  }
  const sentences = Array.isArray(r.answer) ? r.answer : []
  const sources = Array.isArray(r.sources) ? r.sources : []
  const removedCites = sizeOf(r.removedCites)
  const removedSentences = sizeOf(r.removedSentences)
  const lit = highlight?.turn === index ? highlight.n : null
  return html`<div class="st-ask-answer">
    ${r.notInLibrary ? html`<p class="intro-copy" data-part="not-in-library"><b>${T.answer.notInLibrary}</b>${T.answer.notInLibraryText}</p>` : null}
    ${sentences.length ? html`<p class="intro-copy">${sentences.map((s, i) => html`<span key=${i} class="st-ask-sentence" data-sentence=${i}>${s.text}${(Array.isArray(s.cites) ? s.cites : []).map(n => html`<button type="button" key=${n} class=${`cite${lit === n ? ' st-cite-lit' : ''}`} data-cite=${n} aria-label=${fmt(T.answer.citeLabel, { n })} onClick=${() => onCite(n)}>${n}</button>`)} </span>`)}</p>` : null}
    ${removedCites > 0 ? html`<p class="limit-note" data-part="removed-cites" data-n=${removedCites}>${fmt(T.answer.removedCites, { n: removedCites })}</p>` : null}
    ${removedSentences > 0 ? html`<p class="limit-note" data-part="removed-sentences" data-n=${removedSentences}>${fmt(T.answer.removedSentences, { n: removedSentences })}</p>` : null}
    ${sources.length ? html`<div class="st-ask-sources" role="list" aria-label=${T.answer.sources}>
      ${sources.map(s => html`<div key=${s.n} role="listitem" class="file-row" data-source-n=${s.n} data-id=${s.id} data-highlight=${String(lit === s.n)} aria-current=${lit === s.n ? 'true' : undefined}>
        <span class="file-icon"><${TIcon} name="file" /></span>
        <span class="file-text">${fmt(T.answer.sourceLine, { n: s.n, title: s.title })}<small>${s.date ?? ''}</small></span>
        ${isWeb(sourceOf(s.id)) ? html`<span class="st-act" data-action="cite-original"><button type="button" class="btn quiet" onClick=${() => onOriginal?.(sourceOf(s.id))}><${TIcon} name="external" /> ${T.answer.original}</button></span>` : null}
        <span class="st-act" data-action="open-cite"><button type="button" class="btn quiet" onClick=${() => onOpen(s.id)}>${T.answer.open}</button></span>
      </div>`)}
    </div>` : null}
    <div class="after-card st-ask-after">
      ${r.missing ? html`<span data-part="missing">${fmt(T.answer.missing, { missing: r.missing })}</span><span>·</span>` : null}
      ${r.notInLibrary || r.missing ? html`<${Demand} key=${`demand-${turn.id ?? index}`} question=${turn.question} missing=${r.missing ?? ''} demands=${demands} onAdded=${onDemand} /><span>·</span>` : null}
      <${Feedback} question=${turn.question} />
    </div>
  </div>`
}

/** 「这句话是要修改该库吗？」 under a sentence the routing could not tell (route unsure): you choose. */
export function RouteChoice({ busy, onChoose }) {
  return html`<div class="progress-alert st-ask-unsure" data-part="unsure" role="group" aria-label=${T.route.unsure}>
    <b>${T.route.unsure}</b>
    <div class="row">
      <span class="st-act" data-action="route-change"><button type="button" class="btn primary" disabled=${busy} onClick=${() => onChoose('change')}>${T.route.yes}</button></span>
      <span class="st-act" data-action="route-question"><button type="button" class="btn" disabled=${busy} onClick=${() => onChoose('question')}>${T.route.no}</button></span>
    </div>
  </div>`
}

/** The main Agent's reply to a sentence handed over: its words, its question's quick answers, its proposal cards, its notices. */
function AgentReply({ result, askOpen, busy, cards, onQuick, onSend, onChanged, onSettings }) {
  const r = result ?? {}
  const ask = r.ask && typeof r.ask.question === 'string' ? r.ask : null
  return html`<div class="st-ask-agent" data-part="agent-reply">
    ${r.reply ? html`<p class="intro-copy" data-part="reply">${r.reply}</p>` : null}
    ${ask ? html`<div data-part="ask" data-open=${String(askOpen)}>
      <p class="intro-copy">${ask.question}</p>
      ${askOpen ? html`<div class="filters">${(Array.isArray(ask.options) ? ask.options : []).map(o => html`<span key=${o} class="st-act" data-action="quick" data-option=${o}><button type="button" class="filter" disabled=${busy} onClick=${() => onQuick(o)}>${o}</button></span>`)}</div>` : null}
    </div>` : null}
    ${cards.length ? html`<div class="st-stack">${cards.map(c => html`<${ProposalCard} key=${c.id} card=${c} onSend=${onSend} onChanged=${onChanged} />`)}</div>` : null}
    ${(Array.isArray(r.notice) ? r.notice : []).map(n => html`<${Notice} key=${n.code} notice=${n} onSettings=${onSettings} />`)}
  </div>`
}

function Speaker({ name, role, part }) {
  // the new logo: 流息's mark (lib/brand-mark.js) where the template drew its own brand's glyph
  return html`<div class="speaker"><span class="avatar"><${BrandMark} /></span>${name} <small data-part=${part}>${role}</small></div>`
}

/** 详情 of the latest answer: 引用了 n 篇笔记 · what it used · 本次回答依据 · 待补充主题. */
function AnswerDetail({ result, demands, onOpen }) {
  const P = T.panel
  const ok = result && result.ok !== false
  const sources = ok && Array.isArray(result.sources) ? result.sources : []
  const v = ok ? result.verification ?? null : null
  const check = v && (v.rounds ?? 0) > 0 ? fmt(P.check, { rounds: v.rounds, passed: v.passed ? P.checkPassed : P.checkFailed }) : P.checkNone
  const lead = ok ? fmt(P.basisLine, { candidates: sizeOf(result.candidates), used: sizeOf(result.used), calls: result.calls ?? 0, check }) : P.none
  const list = Array.isArray(demands) ? demands : []
  return html`<${DetailBlock} where=${PANEL.detail.where.ask} title=${ok ? fmt(P.cites, { n: sources.length }) : P.citesNone} lead=${lead} part="detail-ask">
    <div class="panel-section" data-part="detail-cites" data-n=${sources.length}>
      <div class="section-label"><span>${P.basis}</span></div>
      ${sources.map(s => html`<button type="button" key=${s.n} class="file-row" data-detail-cite=${s.n} data-id=${s.id} onClick=${() => onOpen(s.id)}>
        <span class="file-icon"><${TIcon} name="file" /></span><span class="file-text">${s.title}<small>${s.date ?? ''}</small></span><${TIcon} name="arrow" /></button>`)}
      ${sources.length ? null : html`<p class="limit-note">${P.none}</p>`}
    </div>
    <div class="panel-section" data-part="demands">
      <div class="section-label"><span>${fmt(P.demands, { n: list.length })}</span></div>
      ${list.length ? list.map(d => html`<div key=${d.topic} class="activity-row" data-demand=${d.topic} data-count=${d.count} data-suggest=${String(d.suggest === true)}>
        ${d.topic}<small>${fmt(P.demandLine, { n: d.count })}${d.suggest ? `${SEP}${P.suggest}` : ''}</small></div>`)
        : html`<p class="limit-note">${P.demandsNone}</p>`}
      <p class="limit-note">${P.demandsHint}</p>
    </div>
  <//>`
}

export function AskScreen() {
  const { navigate, appState, memory } = useApp()
  const libraryId = appState?.data?.library?.libraryId ?? null
  const files = useLoad(() => call('getLibrary', 'all', { topics: [], days: null }), [])
  const demands = useLoad(() => call('getDemands'), [])
  const proposals = useProposals()
  useEvent('library-changed', () => { files.reload(); demands.reload() })
  // the conversation stays while you are on another tab of this library (the app's memory: not on disk, gone when the app quits)
  if (memory && !memory.ask) memory.ask = new Map()
  const kept = memory?.ask?.get(libraryId ?? '') ?? null
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState(kept?.turns ?? [])
  const [highlight, setHighlight] = useState(null)
  const [note, setNote] = useState(null)
  const listRef = useRef(null)
  const chosen = useRef(new Set())
  const seq = useRef(kept?.seq ?? 0)
  useEffect(() => { memory?.ask?.set(libraryId ?? '', { turns: turns.filter(t => t.status !== 'asking'), seq: seq.current }) }, [turns])
  useEffect(() => { const el = listRef.current; if (el && turns.length) el.scrollTop = el.scrollHeight }, [])
  const running = turns.some(t => t.status === 'asking')
  const toEnd = () => requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight })
  const addTurn = turn => { const id = ++seq.current; setTurns(list => [...list, { id, ...turn }]); return id }
  const patch = (id, p) => setTurns(list => list.map(t => (t.id === id ? { ...t, ...p } : t)))
  const send = async () => {
    const q = question.trim()
    if (!q || running) return
    if ([...q].length > MAX_CHARS) { setNote(T.tooLong); return }
    setNote(null)
    const index = addTurn({ question: q, status: 'asking', route: null })
    setQuestion('')
    toEnd()
    try {
      const r = await call('sendLibraryMessage', q)
      if (r?.route === 'unsure') patch(index, { status: 'unsure', route: 'unsure', by: r.by })
      else patch(index, { status: 'done', route: r?.route ?? 'question', by: r?.by, result: r?.result ?? null })
      if (r?.route === 'question') demands.reload()
    } catch (err) { patch(index, { status: 'error', code: err?.code ?? null }) }
    toEnd()
  }
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
  const counts = files.data?.counts ?? null
  const sourceOf = id => (files.data?.items ?? []).find(e => e.id === id)?.source ?? null
  const open = id => navigate('library', { id })
  const original = url => { call('openReader', url, 'reader').catch(() => setNote(T.failedOther)) }
  const cardsOf = r => (Array.isArray(r?.proposalIds) ? r.proposalIds.map(id => proposals.byId.get(id)).filter(Boolean) : [])
  const detail = html`<${AnswerDetail} result=${latest} demands=${demands.data} onOpen=${open} />`
  const reply = (t, i) => {
    if (t.status === 'unsure') return html`<div class="assistant-message"><${RouteChoice} busy=${running} onChoose=${route => choose(t.id, route)} /></div>`
    if (t.route === 'change') {
      return html`<div class="assistant-message">
        <${Speaker} name=${T.route.agent} role=${T.route.routed} part=${t.via !== 'agent' ? 'routed' : undefined} />
        ${t.status === 'asking' ? html`<p class="limit-note" data-part="handing" role="status">${T.route.handing}</p>`
          : t.status === 'error' ? html`<${Answer} turn=${t} index=${i} onSettings=${() => navigate('settings')} />`
            : html`<${AgentReply} result=${t.result} askOpen=${i === turns.length - 1} busy=${running} cards=${cardsOf(t.result)}
              onQuick=${toAgent} onSend=${toAgent} onChanged=${card => proposals.put(card)} onSettings=${() => navigate('settings')} />`}
      </div>`
    }
    return html`<div class="assistant-message">
      <${Speaker} name=${T.speaker} role=${T.speakerRole} />
      <${Answer} turn=${t} index=${i} highlight=${highlight} demands=${demands.data} sourceOf=${sourceOf} onCite=${n => setHighlight({ turn: i, n })}
        onOpen=${open} onOriginal=${original} onDemand=${() => demands.reload()} onSettings=${() => navigate('settings')} />
    </div>`
  }
  const state = counts ? 'ready' : files.status
  return html`<${LibraryFrame} tab="ask" state=${state} labelledby="ask-title" detail=${detail}>
    <div class="st-ask">
      <div class="st-main__body thread-scroll" ref=${listRef}>
        <div class="thread" data-part="conversation">
          <div class="date-line" data-part="scope"><b id="ask-title">${T.title}</b><span>${SEP}</span><span>${counts ? fmt(T.scope, { kept: counts.kept ?? 0, authored: counts.authored ?? 0 }) : ''}</span></div>
          ${turns.length ? null : html`<p class="limit-note st-ask-empty" data-part="ask-empty">${T.empty}</p>`}
          ${turns.map((t, i) => html`<section key=${t.id} class="st-ask-turn" data-turn=${i} data-state=${t.status} data-route=${t.route ?? ''} data-by=${t.by ?? ''}>
            <div class="user-message">${t.question}</div>
            ${reply(t, i)}
          </section>`)}
        </div>
      </div>
      <div class="composer-wrap">
        ${note ? html`<p class="progress-alert" role="alert">${note}</p>` : null}
        <form class="composer" onSubmit=${e => { e.preventDefault(); send() }}>
          <textarea data-field="question" aria-label=${T.inputLabel} placeholder=${T.inputPlaceholder} maxlength=${MAX_CHARS}
            value=${question} disabled=${running} onInput=${e => setQuestion(e.currentTarget.value)}
            onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } }}></textarea>
          <div class="composer-tools">
            <span class="chip"><${TIcon} name="spark" /> ${T.who}</span><small>${T.newline}</small><span class="spacer"></span>
            ${running ? html`<small data-part="asking-bar" role="status">${T.asking}</small>` : null}
            <span class="st-act" data-action="send"><button type="submit" class="send-btn" aria-label=${T.send} title=${T.send} disabled=${running || !question.trim()}><${TIcon} name="send" /></button></span>
          </div>
        </form>
        <div class="compose-help" data-part="input-hint">${fmt(T.inputHint, { n: fmt(T.callsRange, ASK_CALLS) })}</div>
      </div>
    </div>
  <//>`
}
