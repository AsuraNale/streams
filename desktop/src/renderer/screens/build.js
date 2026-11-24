// 新建库 and the build conversation (1.1 W6b; acceptance A1, A2, B3; the before / after of W6 that 维护者 saw on 11-21): the route
// 'build' (app.js newLibrary(): the sidebar's 「新建库」, the shelf, 首次打开; 来源与要求's 「改建库卡」 with params.edit, 上一版建的库's
// 「重新查一遍来源」 with params.from). 1.1 W7b: the sidebar's 「主 Agent」 opens it too (the route 'chat' is an alias of it): the
// sidebar marks 「新建库」 while the page shows its one sentence (data-view=start), 「主 Agent」 while it shows a conversation
// (data-view=talk). v1.0's form ('new-library') is gone.
//   No conversation going (getBuild null): the one-sentence page — what to follow (or, params.edit, what to change in that
//   library's card), 「开始」 only with words in the box and only on 「连接你电脑上的 Claude Code」 (another connection: why, with
//   去设置); params.send (首次打开's sentence) starts at once. The right panel's 详情 is 「流息怎样工作」.
//   A conversation going: the 主 Agent page's conversation parts (thread, user-message, assistant-message, composer), titled
//   新建库 (or 改建库卡). The main agent's questions as the core let them through (core checkQuestion: at most 5, at most 4 options
//   and 「其它」, the 1st one with no options in a new build) — a choice question is buttons (single: one pressed; multi: any) with
//   「其它」 to type and 确定; a question with no options is answered in the box. Its card (screens/build.js BuildCard): the
//   paragraph, the seven lines in three rows, what is left to decide, the other six parts counted; 看全文 shows every part; when
//   a card came before it (or the library's card, changing one), the lines that changed with 改前 / 改后 (A2). 「确认，建库」 only on
//   the last card while the core can confirm it (whole, every address read: A2); 不建了 ends the conversation, nothing made (B3).
//   A turn that failed (the connection): why, 再试一次 (and 去设置 for a sign-in). A build that stopped: why, 重新开始.
// Words: texts/build.js BUILD (BUILD.speaker for the speaker; texts/common.js CONNECTIONS / DAY).
// 1.1 W7a: params.from (with params.brief) — a library of the last version brought over: data-mode convert, its own words
// (texts/build.js BUILD.convert), the opening words made from its old requirements and sources (getSources).
// Test hooks: main[data-screen="build"][data-state][data-mode=create|edit|convert][data-view=start|talk]; [data-field=opener|message|other];
// [data-action=cancel-build] (params.back: the screen 新建库 was opened from, as v1.0's form had it);
// [data-part=start-why|from-old|going|progress-chip|conversation|thinking|not-shown|trouble|stopped|how-it-works];
// [data-row=you|agent][data-kind]; [data-part=question][data-n][data-kind] with [data-option=<text>][aria-pressed];
// article[data-part=build-card][data-can-confirm][data-last] with [data-part=card-points|card-full|card-changes|card-problems],
// 1.1.1 P1 (B19): [data-part=card-unchecked] with [data-unchecked=<url>][data-why], [data-action=ask-fix] (the last card, not
// confirmable: a message asking the agent to fix it, sent as the user's), [data-part=card-links-only][data-n];
// [data-change=<key>]; [data-action=start|answer|send|retry|restart|go-settings|drop|full|confirm].
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt } from '../lib/format.js'
import { confirmAndOpen } from '../lib/build.js'
import { TIcon } from '../lib/template-icons.js'
import { BrandMark } from '../lib/brand-mark.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, DAY, PUNCT, SEP } from '../texts/common.js'
import { BUILD as T } from '../texts/build.js'
import { RightPanel } from './right-panel.js'
import { Btn } from './t-dialog.js'

const OPENER_MAX = 2000
const MESSAGE_MAX = 4000
// the budget the core gives a build and a change of a card (core build/format.mjs BUILD_BUDGET), as the page says it
const BUDGET = Object.freeze({ searches: 20, reads: 35, changeSearches: 5, changeReads: 10 })

const list = v => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [])

function Speaker() {
  return html`<div class="speaker"><span class="avatar"><${BrandMark} /></span>${T.speaker.name} <small>${T.speaker.role}</small></div>`
}

/** 「流息怎样工作」 of the right panel's 详情 beside the page. */
function How() {
  const H = T.how
  const n = CONNECTIONS.names
  return html`<div class="home-context" data-part="how-it-works">
    <span class="eyebrow">${H.eyebrow}</span>
    <h3>${H.title}</h3>
    <p>${H.text}</p>
    <div class="section-label">${H.stepsLabel}</div>
    <ol>${H.steps.map((s, i) => html`<li key=${i}>${s}</li>`)}</ol>
    <div class="progress-alert">${H.note}</div>
    <div class="section-label">${H.usageLabel}</div>
    <p>${fmt(H.usage, { name: n['claude-code'], codex: n.codex, api: n.api })}</p>
  </div>`
}

// ---- the card ---------------------------------------------------------------------------------------------------------

const readWord = why => T.readWords[why] ?? T.readWords[why === null || why === undefined ? 'none' : 'failed']
// 1.1.1 P1: what Streams got when it read an address of the card itself (an entry's checked)
const checkedWords = c => (c && typeof c === 'object' && typeof c.ok === 'boolean' ? (c.ok ? T.checkedOk : fmt(T.checked, { why: readWord(c.reason) })) : '')

/** One entry of a part in words (a source, a sample, a thing to decide …). */
function entryWords(part, e) {
  if (typeof e === 'string') return e
  if (!e || typeof e !== 'object') return ''
  if (part === 'sources') return [e.name, e.url ?? e.query, e.status].filter(Boolean).join(SEP)
  if (part === 'unreadable') return [e.name, e.url, e.reason, checkedWords(e.checked)].filter(Boolean).join(SEP)
  if (part === 'samples') return [e.title, e.url, e.date].filter(Boolean).join(SEP)
  if (part === 'decide') return `${e.what ?? ''}${e.default ? fmt(T.defaultMark, { value: e.default }) : ''}`
  return Object.values(e).filter(v => typeof v === 'string').join(SEP)
}

/** What the card's lines and parts are missing, in words (the core's problem codes). */
export function problemWords(problems) {
  const out = []
  for (const p of Array.isArray(problems) ? problems : []) {
    const code = p?.code
    if (code === 'not-read' && typeof p.url === 'string') continue // listed one by one (BuildCard)
    const part = T.parts[p?.part] ?? p?.part ?? ''
    const line = T.parts[p?.line] ?? p?.line ?? ''
    const w = Object.hasOwn(T.problems, code ?? '') ? fmt(T.problems[code], { part, line }) : T.problems.other
    if (!out.includes(w)) out.push(w)
  }
  return out
}

function CardFull({ card }) {
  const d = card.definition ?? {}
  const parts = ['decide', 'collect', 'skip', 'sources', 'unreadable', 'pick', 'write', 'samples']
  return html`<div class="st-build-full" data-part="card-full">
    <dl class="decision-points">
      ${['summary', 'purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard'].map(k => html`<div key=${k} data-line=${k}><dt>${T.parts[k]}</dt><dd>${d[k] ?? T.empty}</dd></div>`)}
    </dl>
    ${parts.map(p => {
      const items = list(card[p])
      return html`<section key=${p} class="st-build-part" data-card-part=${p}>
        <div class="section-label"><span>${T.parts[p]}</span></div>
        ${items.length ? html`<ul>${items.map((e, i) => html`<li key=${i}>${entryWords(p, e)}</li>`)}</ul>` : html`<p class="muted">${T.empty}</p>`}
      </section>`
    })}
  </div>`
}

function Changes({ changes, edit }) {
  if (!Array.isArray(changes)) return null
  return html`<div class="st-build-changes" data-part="card-changes" data-n=${changes.length}>
    <div class="section-label"><span>${changes.length ? fmt(edit ? T.editChanges : T.changes, { n: changes.length }) : T.changesNone}</span></div>
    ${changes.map(c => html`<div key=${c.key} class="st-build-change" data-change=${c.key}>
      <b>${T.parts[c.key] ?? c.key}</b>
      <p class="st-build-change__before"><span class="eyebrow">${T.before}</span> <del>${c.before || T.empty}</del></p>
      <p class="st-build-change__after"><span class="eyebrow">${T.after}</span> <ins>${c.after || T.empty}</ins></p>
    </div>`)}
  </div>`
}

/** The card the main agent handed in (the conversation's; `last`: the newest card, the one 确认 is for). */
function BuildCard({ turn, last, mode, libraryName, busy, acting, onDrop, onConfirm, onAskFix }) {
  const [full, setFull] = useState(false)
  const card = turn.card ?? {}
  const d = card.definition ?? {}
  const edit = mode === 'edit'
  const cv = mode === 'convert' ? T.convert : null
  const decide = list(card.decide)
  const can = last && turn.canConfirm === true
  const problems = problemWords(turn.problems)
  const unchecked = (Array.isArray(turn.problems) ? turn.problems : []).filter(p => p?.code === 'not-read' && typeof p.url === 'string')
  const what = [problems.join(PUNCT.semi), unchecked.length ? fmt(T.notReadN, { n: unchecked.length }) : ''].filter(Boolean).join(PUNCT.semi)
  const askText = fmt(unchecked.length ? T.askFixUrls : T.askFixText, { what: [...problems, ...unchecked.map(p => fmt(T.unchecked, { url: p.url, why: readWord(p.reason) }))].join(PUNCT.semi) })
  const linksOnly = list(card.sources).filter(s => s && typeof s === 'object' && s.checked && s.checked.original === 'link')
  const rows = [
    [T.lines.summary, d.summary],
    [T.lines.purposeScope, [d.purpose, d.scope].filter(Boolean).join(PUNCT.semi)],
    [T.lines.excludeTrust, [d.exclude, d.trust].filter(Boolean).join(PUNCT.semi)],
    [T.lines.rhythmLanguageHard, [d.rhythm, d.language, d.hard].filter(Boolean).join(PUNCT.semi)],
    [T.lines.decide, decide.length ? decide.map((x, i) => `${i + 1}. ${entryWords('decide', x)}`).join(SEP) : T.decideNone],
    [T.lines.rest, fmt(T.rest, { sources: list(card.sources).length, unreadable: list(card.unreadable).length, samples: list(card.samples).length })],
  ]
  return html`<article class="confirmation st-proposal st-build-card" data-part="build-card" data-can-confirm=${String(can)} data-last=${String(last)} aria-label=${fmt(cv?.cardTitle ?? (edit ? T.editCardTitle : T.cardTitle), { name: card.name ?? '' })}>
    <div class="confirm-top">
      <div class="confirm-title"><${TIcon} name="file" /><div><h2 data-part="title">${fmt(cv?.cardTitle ?? (edit ? T.editCardTitle : T.cardTitle), { name: card.name ?? '' })}</h2><small data-part="from">${cv?.from ?? (edit ? T.editFrom : T.cardFrom)}</small></div></div>
      ${turn.urls ? html`<span class="confirm-number" data-part="urls">${fmt(T.urlsRead, { n: turn.urls })}</span>` : null}
    </div>
    <div class="card-body">
      <dl class="decision-points" data-part="card-points">${rows.map(([label, body], i) => html`<div key=${i}>
        <dt><span class="point-index">${String(i + 1).padStart(2, '0')}</span>${label}</dt><dd>${body || T.empty}</dd>
      </div>`)}</dl>
      <${Changes} changes=${turn.changes} edit=${edit} />
      ${full ? html`<${CardFull} card=${card} />` : null}
      ${linksOnly.length ? html`<p class="limit-note" data-part="card-links-only" data-n=${linksOnly.length}>${fmt(T.linksOnly, { n: linksOnly.length, names: linksOnly.map(s => s.name ?? s.url).join(PUNCT.list) })}</p>` : null}
      ${what ? html`<div class="progress-alert st-build-problems" role="status" data-part="card-problems">
        <p>${fmt(T.notWhole, { what })}</p>
        ${unchecked.length ? html`<p class="limit-note">${T.uncheckedLead}</p><ul data-part="card-unchecked">${unchecked.map(p => html`<li key=${p.url} data-unchecked=${p.url} data-why=${p.reason ?? ''}>${fmt(T.unchecked, { url: p.url, why: readWord(p.reason) })}</li>`)}</ul>` : null}
        ${last && turn.canConfirm !== true && onAskFix ? html`<span class="st-act" data-action="ask-fix"><button type="button" class="btn" disabled=${busy || acting} onClick=${() => onAskFix(askText)}>${T.askFix}</button></span>` : null}
      </div>` : null}
    </div>
    <div class="confirm-footer">
      <span class="muted" data-part="note">${cv ? fmt(cv.folder, { name: libraryName ?? card.name ?? '' }) : edit ? fmt(T.editFolder, { name: libraryName ?? card.name ?? '' }) : fmt(T.folder, { name: card.name ?? '' })}</span>
      <div class="row">
        ${acting ? html`<span class="limit-note" role="status">${T.confirming}</span>` : null}
        ${last ? html`<${Btn} name="drop" kind="quiet" disabled=${busy || acting} onClick=${onDrop}>${cv?.drop ?? (edit ? T.dropEdit : T.drop)}<//>` : null}
        <${Btn} name="full" onClick=${() => setFull(f => !f)}>${full ? T.fold : T.full}<//>
        ${can ? html`<span class="st-act" data-action="confirm"><button type="button" class="btn primary" disabled=${busy || acting} onClick=${onConfirm}><${TIcon} name="approve" fallback="check" /> ${cv?.confirm ?? (edit ? T.confirmEdit : T.confirm)}</button></span>` : null}
      </div>
    </div>
  </article>`
}

// ---- a question -------------------------------------------------------------------------------------------------------

function Question({ q, open, busy, onAnswer }) {
  const [picked, setPicked] = useState([])
  const [other, setOther] = useState('')
  const choice = q.kind === 'single' || q.kind === 'multi'
  const press = o => setPicked(p => (q.kind === 'single' ? (p.includes(o) ? [] : [o]) : p.includes(o) ? p.filter(x => x !== o) : [...p, o]))
  const ready = picked.length > 0 || other.trim() !== ''
  return html`<div data-part="question" data-n=${q.n} data-kind=${q.kind} data-open=${String(open)}>
    <p class="intro-copy"><b class="st-build-qn">${fmt(T.questionN, { n: q.n })}</b> ${q.text}${choice ? html` <small class="muted">${q.kind === 'single' ? T.single : T.multi}</small>` : null}</p>
    ${choice && open ? html`<div class="filters st-build-options" role="group" aria-label=${q.text}>
        ${q.options.map(o => html`<button type="button" key=${o} class=${`filter${picked.includes(o) ? ' active' : ''}`} aria-pressed=${String(picked.includes(o))}
          data-option=${o} disabled=${busy} onClick=${() => press(o)}>${o}</button>`)}
      </div>
      ${q.other ? html`<label class="search-field st-build-other"><span class="muted">${T.other}</span>
        <input data-field="other" placeholder=${T.otherPlaceholder} maxlength="2000" value=${other} disabled=${busy} onInput=${e => setOther(e.currentTarget.value)} /></label>` : null}
      <div class="row st-build-answer"><span class="st-act" data-action="answer"><button type="button" class="btn primary" disabled=${busy || !ready}
        onClick=${() => onAnswer({ picked, ...(other.trim() ? { other: other.trim() } : {}) })}>${T.answer}</button></span></div>` : null}
  </div>`
}

// ---- the one-sentence page --------------------------------------------------------------------------------------------

function StartPage({ params, onStarted }) {
  const { navigate, appState, libraries } = useApp()
  const edit = typeof params.edit === 'string' ? params.edit : null
  // 1.1 W7a: params.from — a library of the last version, brought over (its card goes into its own folder)
  const from = !edit && typeof params.from === 'string' ? params.from : null
  const cv = from ? T.convert : null
  const target = edit ?? from
  const libraryName = target ? (libraries?.data ?? []).find(l => l.id === target)?.name ?? '' : null
  const [text, setText] = useState(typeof params.opener === 'string' ? params.opener : typeof params.send === 'string' ? params.send : '')
  // bringing one over: the opening words carry its old requirements and sources (getSources: the current library is that one)
  useEffect(() => {
    if (!from || typeof params.opener === 'string') return
    let live = true
    call('getSources').then(v => {
      if (!live) return
      const names = (v?.sources ?? []).map(s => [s.name, s.url ?? s.query].filter(Boolean).join(SEP)).join(PUNCT.list)
      setText(t => t || fmt(cv.opener, { name: libraryName ?? '', brief: params.brief || cv.none, sources: names || cv.none }))
    }, () => {})
    return () => { live = false }
  }, [from])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const active = appState?.data?.activeConnection ?? null
  const can = active === 'claude-code'
  const names = CONNECTIONS.names
  // 1.1.1 P11a (A14): the cost line names the connection in use, and only one that can build (no other connection's quota)
  const start = async (words = text) => {
    const t = String(words ?? '').trim()
    if (!t || busy || !can) return
    setBusy(true)
    setError(null)
    try {
      onStarted(await call('startBuild', t, target ?? undefined))
    } catch (err) {
      if (err?.code === 'bad_arguments' && /going/.test(String(err?.message ?? ''))) setError('going')
      else setError('failed')
      setBusy(false)
    }
  }
  // 首次打开's sentence: started once, as if 开始 was pressed
  const handed = useRef(false)
  useEffect(() => {
    if (handed.current || typeof params.send !== 'string' || !params.send.trim() || !can) return
    handed.current = true
    void start(params.send)
  }, [can])
  const chip = html`<span class="status-chip" data-part="connection-chip"><span class="dot"></span> ${active ? fmt(T.chip, { name: names[active] ?? active }) : T.chipNone}</span>`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="build" />`} panel=${html`<${RightPanel} detail=${html`<${How} />`} />`}>
    <${Main} screen="build" state="ready" labelledby="build-title" attrs=${{ 'data-mode': edit ? 'edit' : from ? 'convert' : 'create', 'data-view': 'start' }}>
      <${TopBar} title=${cv?.title ?? (edit ? T.editTitle : T.title)} subtitle=${cv?.subtitle ?? (edit ? T.editSubtitle : T.subtitle)} titleTag="h1" titleId="build-title" actions=${chip} />
      <div class="st-main__body">
        <section class="new-content st-build-start" data-part="build-start">
          <span class="eyebrow">${cv?.eyebrow ?? (edit ? T.editEyebrow : T.eyebrow)}</span>
          <h2>${cv ? fmt(cv.heading, { name: libraryName }) : edit ? fmt(T.editHeading, { name: libraryName }) : T.heading}</h2>
          ${cv ? html`<p class="progress-alert" data-part="from-old">${cv.note}</p>` : null}
          <label class="field"><span>${cv?.label ?? (edit ? T.editLabel : T.label)}</span>
            <textarea data-field="opener" rows="4" maxlength=${OPENER_MAX} placeholder=${edit ? T.editPlaceholder : T.placeholder} value=${text} disabled=${busy}
              onInput=${e => setText(e.currentTarget.value)}></textarea></label>
          <p class="limit-note st-build-lead">${cv ? cv.subtitle : edit ? T.editLead : T.lead}</p>
          ${can ? null : html`<div class="progress-alert" role="alert" data-part="start-why">
            <span>${fmt(T.needClaude, { name: names['claude-code'], current: active ? names[active] ?? active : T.chipNone })}</span>
            <span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${() => navigate('settings')}>${T.goSettings}</button></span></div>`}
          ${error === 'going' ? html`<p class="progress-alert" role="alert" data-part="going">${T.going}</p>` : null}
          ${error === 'failed' ? html`<p class="progress-alert" role="alert" data-part="start-failed">${T.failedCall}</p>` : null}
          <div class="form-footer">
            <span class="muted st-build-cost" data-part="build-cost">${busy ? T.starting : can ? fmt(active === 'api' ? T.costApi : T.cost, { name: names[active] ?? active }) : ''}</span>
            ${typeof params.back === 'string' && params.back !== 'build' ? html`<${Btn} name="cancel-build" kind="quiet" disabled=${busy} onClick=${() => navigate(params.back)}>${T.cancel}<//>` : null}
            <span class="st-act" data-action="start"><button type="button" class="btn primary" disabled=${busy || !can || !text.trim()} onClick=${() => start()}>${T.start}</button></span>
          </div>
        </section>
      </div>
    <//>
  <//>`
}

// ---- the conversation -------------------------------------------------------------------------------------------------

function Talk({ view, onView }) {
  const app = useApp()
  const { navigate, libraries } = app
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState(false)
  const [note, setNote] = useState(null)
  const listRef = useRef(null)
  const edit = view.mode === 'edit'
  const cv = view.mode === 'convert' ? T.convert : null
  const libraryName = view.library?.name ?? (libraries?.data ?? []).find(l => l.id === view.library?.id)?.name ?? null
  const working = busy || view.busy
  const turns = view.turns ?? []
  const lastAgent = turns.map((t, i) => [t, i]).filter(([t]) => t.role === 'agent').at(-1)?.[1] ?? -1
  const lastCard = turns.map((t, i) => [t, i]).filter(([t]) => t.role === 'agent' && t.kind === 'card').at(-1)?.[1] ?? -1
  const openQuestion = lastAgent >= 0 && turns[lastAgent].kind === 'question' && lastAgent === turns.length - 1 ? lastAgent : -1
  const waiting = lastCard >= 0 && lastCard === lastAgent && turns[lastCard].canConfirm === true

  useLayoutEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [turns.length, working, view.trouble, view.stopped])

  const run = async (method, ...args) => {
    if (working) return
    setBusy(true)
    setNote(null)
    try { onView(await call(method, ...args)) } catch (err) { setNote(err?.code === 'busy' ? T.thinking : T.failedCall) } finally { setBusy(false) }
  }
  const send = () => {
    const t = text.trim()
    if (!t || [...t].length > MESSAGE_MAX) return
    setText('')
    void run('replyBuild', t)
  }
  const drop = async () => {
    if (working || acting) return
    setActing(true)
    try { await call('dropBuild'); onView(null) } catch { setNote(T.failedCall) } finally { setActing(false) }
  }
  const confirm = async () => {
    if (working || acting) return
    setActing(true)
    try { await confirmAndOpen(app) } catch { setNote(T.failedCall); setActing(false) }
  }
  const restart = async () => {
    try { await call('dropBuild') } catch { /* a stopped build: nothing waits */ }
    onView(null, { opener: view.opener })
  }

  const asked = view.asked ?? 0
  const chipText = waiting ? (cv?.waiting ?? (edit ? T.editWaiting : T.cardWaiting)) : fmt(T.progress, { n: Math.max(asked, 1) })
  const chip = html`<span class="status-chip" data-part="progress-chip" data-asked=${asked} data-waiting=${String(waiting)}><span class="dot"></span> ${chipText}</span>`
  const trouble = view.trouble?.code ?? null
  const troubleWords = trouble && Object.hasOwn(T.trouble, trouble) ? T.trouble[trouble] : T.trouble.failed
  const signIn = trouble === 'login-expired' || trouble === 'not-logged-in'
  const placeholder = waiting ? T.placeholderCard : openQuestion >= 0 ? T.placeholderAnswer : T.placeholderSay
  const today = dayText(new Date().toISOString(), DAY)

  // 1.1 W7b: a conversation going is 主 Agent's page (the sidebar marks 主 Agent, route alias 'chat')
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="chat" />`} panel=${html`<${RightPanel} detail=${html`<${How} />`} />`}>
    <${Main} screen="build" state="ready" labelledby="build-title" attrs=${{ 'data-mode': view.mode, 'data-view': 'talk' }}>
      <${TopBar} title=${cv?.title ?? (edit ? T.editTitle : T.title)} subtitle=${cv?.subtitle ?? (edit ? T.editSubtitle : T.talkSubtitle)} titleTag="h1" titleId="build-title" actions=${chip} />
      <div class="st-chat">
        <div class="st-main__body thread-scroll" ref=${listRef}>
          <div class="thread" data-part="conversation">
            <div class="date-line" data-part="date-line">${fmt(cv?.dateLine ?? (edit ? T.editDateLine : T.dateLine), { day: today })}</div>
            ${turns.map((t, i) => {
              if (t.role === 'you') return html`<div key=${i} class="user-message" data-row="you">${t.text}</div>`
              return html`<div key=${i} class="assistant-message" data-row="agent" data-kind=${t.kind}>
                <${Speaker} />
                ${t.say ? html`<p class="intro-copy" data-part="reply">${t.say}</p>` : null}
                ${t.notice === 'question-not-shown' ? html`<p class="limit-note st-faint" data-part="not-shown">${T.notShown}</p>` : null}
                ${t.kind === 'question' && t.question ? html`<${Question} q=${t.question} open=${i === openQuestion} busy=${working} onAnswer=${a => run('replyBuild', a)} />` : null}
                ${t.kind === 'card' && t.card ? html`<${BuildCard} turn=${t} last=${i === lastCard && i === lastAgent} mode=${view.mode} libraryName=${libraryName}
                  busy=${working} acting=${acting} onDrop=${drop} onConfirm=${confirm} onAskFix=${m => run('replyBuild', m)} />` : null}
              </div>`
            })}
            ${working ? html`<div class="assistant-message" data-part="thinking-row"><${Speaker} /><p class="limit-note" data-part="thinking" role="status">${T.thinking}</p></div>` : null}
            ${trouble && !working ? html`<div class="progress-alert st-notice" role="alert" data-part="trouble" data-code=${trouble}>
              <span>${troubleWords}</span>
              <span class="st-act" data-action="retry"><button type="button" class="btn quiet" onClick=${() => run('retryBuild')}>${T.retry}</button></span>
              ${signIn ? html`<span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${() => navigate('settings')}>${T.goSettings}</button></span>` : null}
            </div>` : null}
            ${view.stopped ? html`<div class="progress-alert st-notice" role="alert" data-part="stopped" data-code=${view.stopped}>
              <span>${T.stopped[view.stopped] ?? T.stopped['bad-format']}</span>
              <span class="st-act" data-action="restart"><button type="button" class="btn quiet" onClick=${restart}>${T.restart}</button></span>
            </div>` : null}
          </div>
        </div>
        ${view.stopped ? null : html`<div class="composer-wrap" data-part="compose" data-busy=${String(working)}>
          ${note ? html`<p class="progress-alert" data-part="chat-note" role="alert">${note}</p>` : null}
          <form class="composer" onSubmit=${e => { e.preventDefault(); send() }}>
            <textarea data-field="message" rows="2" aria-label=${T.inputLabel} placeholder=${placeholder} maxlength=${MESSAGE_MAX}
              value=${text} disabled=${working} onInput=${e => setText(e.currentTarget.value)}
              onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } }}></textarea>
            <div class="composer-tools">
              <span class="chip"><${TIcon} name="spark" /> ${T.speaker.name}</span><small>${T.speaker.newline}</small><span class="spacer"></span>
              <span class="st-act" data-action="send"><button type="submit" class="send-btn" aria-label=${T.send} title=${T.send} disabled=${working || !text.trim()}><${TIcon} name="send" /></button></span>
            </div>
          </form>
          <div class="compose-help" data-part="input-hint">${edit || waiting
            ? fmt(T.editCalls, { searches: BUDGET.changeSearches, reads: BUDGET.changeReads })
            : fmt(T.calls, { searches: BUDGET.searches, reads: BUDGET.reads })}</div>
        </div>`}
      </div>
    <//>
  <//>`
}

export function BuildScreen({ params = {} }) {
  const app = useApp()
  const build = app.build
  const [restartWith, setRestartWith] = useState(null)
  const view = build?.data ?? null
  const onView = (v, again = null) => { build?.set?.(v); if (again) setRestartWith(again) }
  if (build?.status === 'loading' && !view) {
    return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="build" />`} panel=${html`<${RightPanel} detail=${html`<${How} />`} />`}>
      <${Main} screen="build" state="loading" labelledby="build-title"><${TopBar} title=${T.title} titleTag="h1" titleId="build-title" /><//>
    <//>`
  }
  if (view) return html`<${Talk} view=${view} onView=${onView} />`
  const p = restartWith ? { ...params, opener: restartWith.opener, send: undefined } : params
  return html`<${StartPage} key=${restartWith ? 'again' : 'first'} params=${p} onStarted=${v => { setRestartWith(null); build?.set?.(v) }} />`
}
