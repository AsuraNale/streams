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
//   and 「其他」, the 1st one with no options in a new build) — a choice question is a choice card (1.1.2: Question, AnswerCard);
//   a question with no options is answered in the box. Its card (screens/build.js BuildCard): the
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
// [data-row=you|agent][data-kind]; [data-part=question][data-n][data-kind][data-state] with li[data-option=<text>][aria-checked]
// and li[data-other] (1.1.2: the choice card, see Question); [data-part=answer-card];
// article[data-part=build-card][data-can-confirm][data-last] with [data-part=card-points|card-full|card-changes|card-problems],
// 1.1.1 P1 (B19): [data-part=card-unchecked] with [data-unchecked=<url>][data-why], [data-action=ask-fix] (the last card, not
// confirmable: a message asking the agent to fix it, sent as the user's), [data-part=card-links-only][data-n];
// [data-change=<key>]; [data-action=start|answer|send|retry|restart|go-settings|drop|full|confirm].
// 1.1.2 (第 5 件; 赞妮's mock 05): the page has a column of conversations on its left (ConversationList: 新建库, the one in
// progress, every library with its last conversation) — nav[data-part=conversations] with [data-action=conv-new],
// [data-conv=going], [data-conv-library=<id>][data-n][aria-current]; a library opened from it (params.edit, or params.from for one
// of the last version) shows its earlier conversations (section[data-part=earlier] with [data-earlier=<id>][data-open],
// [data-action=earlier-toggle]) above the box, and above the conversation once it goes on ([data-part=handed-over]); a
// library opened while another conversation is in progress: data-view=other with [data-part=other-going],
// [data-action=to-going]. The card's 「每次更新的量」 line: [data-part=card-volume][data-volume].
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { useEvent } from '../lib/use-events.js'
import { dayText, fmt, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { confirmAndOpen } from '../lib/build.js'
import { TIcon } from '../lib/template-icons.js'
import { BrandMark } from '../lib/brand-mark.js'
import { moMs, stillMotion } from '../lib/motion.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, DAY, PUNCT, SEP, WHEN } from '../texts/common.js'
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
function BuildCard({ turn, last, mode, libraryName, busy, acting, onDrop, onConfirm, onAskFix, volume = null }) {
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
  // 1.1.2 (第 4 件): the step the library will update at — the card's proposal, else the one it has (a new library: 设置's)
  const step = Object.hasOwn(T.volumes, card.volume ?? '') ? card.volume : Object.hasOwn(T.volumes, volume ?? '') ? volume : null
  return html`<article class="confirmation st-proposal st-build-card" data-part="build-card" data-can-confirm=${String(can)} data-last=${String(last)} aria-label=${fmt(cv?.cardTitle ?? (edit ? T.editCardTitle : T.cardTitle), { name: card.name ?? '' })}>
    <div class="confirm-top">
      <div class="confirm-title"><${TIcon} name="file" /><div><h2 data-part="title">${fmt(cv?.cardTitle ?? (edit ? T.editCardTitle : T.cardTitle), { name: card.name ?? '' })}</h2><small data-part="from">${cv?.from ?? (edit ? T.editFrom : T.cardFrom)}</small></div></div>
      ${turn.urls ? html`<span class="confirm-number" data-part="urls">${fmt(T.urlsRead, { n: turn.urls })}</span>` : null}
    </div>
    <div class="card-body">
      <dl class="decision-points" data-part="card-points">${rows.map(([label, body], i) => html`<div key=${i}>
        <dt><span class="point-index">${String(i + 1).padStart(2, '0')}</span>${label}</dt><dd>${body || T.empty}</dd>
      </div>`)}${step ? html`<div data-part="card-volume" data-volume=${step}><dt><span class="point-index">${String(rows.length + 1).padStart(2, '0')}</span>${T.volumeRow}</dt><dd>${fmt(T.volumeValue, { v: T.volumes[step] })}</dd></div>` : null}</dl>
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
        ${can ? html`<span class="st-act" data-action="confirm"><button type="button" class="btn primary st-mo-ready" disabled=${busy || acting} onClick=${onConfirm}><${TIcon} name="approve" fallback="check" /> ${cv?.confirm ?? (edit ? T.confirmEdit : T.confirm)}</button></span>` : null}
      </div>
    </div>
  </article>`
}

// ---- a question -------------------------------------------------------------------------------------------------------
// 1.1.2 (维护者 11-25 第 3 件, U8): a choice question is a choice card — one row per option with its number key, a radio dot
// (single) or a check box (multi), 「其他」 last with its box opening under it; ↑ ↓ move, space picks, a number key picks that
// row, Enter answers. Pressing 提交回答 sends at once (the call is not held up); the picked rows are drawn round once
// (st-mo-confirm) while the others leave (st-mo-leave-option), then the card folds to one line and the answer shows on your
// side until the conversation brings your turn. 减少动态效果: no animation, the folded card at once.
// Test hooks: [data-part=question][data-n][data-kind][data-open][data-state=open|sending|answered]; ul[data-part=options]
// [role=radiogroup|group]; li[data-option=<text>][role=radio|checkbox][aria-checked]; li[data-other][aria-checked] with
// input[data-field=other]; [data-action=answer]; [data-part=answered-line]; [data-part=answer-card] (yours, see AnswerCard).

const CHECK_PATH = 'M3.5 8.4 6.6 11.3 12.6 4.8'

function Tick() {
  return html`<svg class="st-q__tick" viewBox="0 0 16 16" aria-hidden="true"><path d=${CHECK_PATH} /></svg>`
}

/** What you answered, as a card on your side (`picked`: the options' words; `other`: what you typed). */
export function AnswerCard({ n, picked = [], other = '', pending = false }) {
  const all = [...picked.map(p => ({ k: `p${p}`, text: p })), ...(other ? [{ k: 'o', text: fmt(T.otherAnswer, { text: other }) }] : [])]
  return html`<div class="user-message st-answer" data-row=${pending ? undefined : 'you'} data-kind="answer" data-part="answer-card" data-pending=${String(pending)}>
    <div class="st-answer__head">${fmt(T.yourChoice, { n })}</div>
    <div class="st-answer__picks">${all.map(a => html`<span key=${a.k} class="st-answer__pick"><${Tick} />${a.text}</span>`)}</div>
  </div>`
}

function Question({ q, open, answered, busy, onAnswer }) {
  const choice = q.kind === 'single' || q.kind === 'multi'
  const multi = q.kind === 'multi'
  const options = choice ? q.options : []
  const rows = options.length + (q.other ? 1 : 0)
  const otherAt = q.other ? options.length : -1
  const [picked, setPicked] = useState([])
  const [other, setOther] = useState('')
  const [focus, setFocus] = useState(0)
  const [focused, setFocused] = useState(false)
  // sending: the rows chosen when 提交回答 was pressed (the animation plays on them); sent: the answer as it went
  const [sending, setSending] = useState(null)
  const [sent, setSent] = useState(null)
  const listRef = useRef(null)
  const otherRef = useRef(null)
  const otherOn = picked.includes(otherAt)
  const ready = picked.some(i => i !== otherAt) || (otherOn && other.trim() !== '')
  const toggle = i => setPicked(p => (multi ? (p.includes(i) ? p.filter(x => x !== i) : [...p, i]) : [i]))
  useEffect(() => { if (otherOn && otherRef.current && !sending) otherRef.current.focus() }, [otherOn])
  const send = () => {
    if (busy || !ready || sending || sent) return
    const answer = { picked: picked.filter(i => i !== otherAt).sort((a, b) => a - b).map(i => options[i]), ...(otherOn && other.trim() ? { other: other.trim() } : {}) }
    // the call goes now; the animation only follows it. A call that failed opens the card again.
    Promise.resolve(onAnswer(answer)).then(ok => { if (ok === false) { setSending(null); setSent(null) } })
    const fold = () => { setSending(null); setSent(answer) }
    if (stillMotion()) { fold(); return }
    setSending(picked)
    setTimeout(fold, Math.max(moMs('--mo-tick', 240), moMs('--mo-in', 200)))
  }
  const onKey = e => {
    if (e.target !== listRef.current || busy || sending) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setFocus(f => (f + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows); return }
    if (e.key === ' ') { e.preventDefault(); toggle(focus); return }
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= rows) { e.preventDefault(); setFocus(Number(e.key) - 1); toggle(Number(e.key) - 1); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!multi && picked.length === 0) { toggle(focus); return }
      send()
    }
  }
  const state = sent || answered ? 'answered' : sending ? 'sending' : 'open'
  const live = choice && open && state !== 'answered'
  const head = html`<div class="st-q__head">
    <div class="st-q__n"><b>${fmt(T.questionN, { n: q.n })}</b>${choice ? html`<span>${multi ? T.multi : T.single}</span>` : null}</div>
    <p class="st-q__text">${q.text}</p>
  </div>`
  if (!choice) return html`<div class="st-q st-q--input" data-part="question" data-n=${q.n} data-kind=${q.kind} data-open=${String(open)} data-state=${answered ? 'answered' : 'open'}>${head}</div>`
  const row = (label, i, extra = null) => {
    const on = picked.includes(i)
    const isOther = i === otherAt
    return html`<li key=${isOther ? '~other' : label} class=${`st-q__opt${on ? ' is-on' : ''}${focused && focus === i ? ' is-focus' : ''}`}
      role=${multi ? 'checkbox' : 'radio'} aria-checked=${String(on)} aria-disabled=${busy ? 'true' : undefined}
      data-option=${isOther ? undefined : label} data-other=${isOther ? '' : undefined}
      onClick=${e => { if (busy || sending || e.target.tagName === 'INPUT') return; setFocus(i); toggle(i); if (!isOther) listRef.current?.focus() }}>
      <span class="st-q__key" aria-hidden="true">${i + 1}</span>
      <span class=${`st-q__box st-q__box--${multi ? 'check' : 'radio'}`} aria-hidden="true">${multi ? html`<${Tick} />` : html`<i></i>`}</span>
      <span class="st-q__label">${label}</span>
      ${extra}
    </li>`
  }
  return html`<div class=${`st-q confirmation${state === 'sending' ? ' st-mo-sending' : ''}`} data-part="question" data-n=${q.n} data-kind=${q.kind} data-open=${String(open)} data-state=${state}>
    ${head}
    ${live ? html`<ul class="st-q__opts" data-part="options" role=${multi ? 'group' : 'radiogroup'} aria-label=${q.text} tabindex="0" ref=${listRef}
        onKeyDown=${onKey} onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)}>
        ${options.map((o, i) => row(o, i))}
        ${q.other ? row(T.other, otherAt, otherOn ? html`<span class="st-q__other"><input data-field="other" ref=${otherRef} placeholder=${T.otherPlaceholder} aria-label=${T.other} maxlength="2000"
          value=${other} disabled=${busy || Boolean(sending)} onInput=${e => setOther(e.currentTarget.value)}
          onKeyDown=${e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send() } else if (e.key === 'Escape') { e.preventDefault(); listRef.current?.focus() } }} /></span>` : null) : null}
      </ul>
      <div class="st-q__foot">
        <span class="st-q__keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> ${T.keys.move}</span>${multi ? html`<span><kbd>${T.keys.spaceKey}</kbd> ${T.keys.space}</span>` : null}<span><kbd>1</kbd>–<kbd>${rows}</kbd> ${T.keys.pick}</span><span><kbd>Enter</kbd> ${T.keys.enter}</span></span>
        <span class="spacer"></span>
        <span class="st-act" data-action="answer"><button type="button" class="btn primary" disabled=${busy || !ready || Boolean(sending)} onClick=${send}>${sending ? T.answering : T.answer}</button></span>
      </div>` : state === 'answered' ? html`<p class="st-q__done" data-part="answered-line"><span class="st-q__ok" aria-hidden="true"><${Tick} /></span>${T.answered}</p>` : null}
  </div>
  ${sent && open ? html`<${AnswerCard} n=${q.n} picked=${sent.picked} other=${sent.other ?? ''} pending=${true} />` : null}`
}

// ---- 1.1.2 (第 5 件): the conversations by library, and a library's earlier ones ---------------------------------------------

const whenOf = iso => (iso ? whenText(iso, WHEN) ?? '' : '')

/** The column on the left of 主 Agent's page; `here`: { kind: 'new' | 'going' | 'library', id? } (marked aria-current). */
function ConversationList({ here }) {
  const { navigate } = useApp()
  const L = T.list
  const list = useLoad(() => call('listConversations'), [])
  useEvent('build-changed', p => { if (p?.phase !== 'progress') list.reload() }, [])
  useEvent('libraries-changed', () => list.reload(), [])
  const d = list.data
  const going = d?.going ?? null
  const goingId = going?.library?.id ?? null
  return html`<nav class="st-convs" aria-label=${L.label} data-part="conversations">
    <span class="st-act" data-action="conv-new"><button type="button" class="btn st-convs__new" aria-current=${here.kind === 'new' ? 'page' : undefined} onClick=${() => navigate('build', {})}><${TIcon} name="plus" fallback="add" /> ${L.new}</button></span>
    ${going ? html`<div class="st-convs__label">${L.going}</div>
      <button type="button" class="st-convs__item" data-conv="going" data-going="true" aria-current=${here.kind === 'going' ? 'page' : undefined}
        onClick=${() => navigate('build', goingId ? { edit: goingId } : {})}><b>${going.library?.name ?? L.goingNew}</b><small>${T.modes[going.mode] ?? ''} · ${fmt(L.goingAsked, { n: going.asked ?? 0 })}</small></button>` : null}
    <div class="st-convs__label">${L.libraries}</div>
    ${list.status === 'error' && !d ? html`<p class="st-convs__none" role="alert">${L.failed}</p>` : null}
    ${(d?.libraries ?? []).map(r => {
      const last = r.conversations.at(-1) ?? null
      const to = r.hasCard === false ? { from: r.library.id } : { edit: r.library.id }
      return html`<button type="button" key=${r.library.id} class="st-convs__item" data-conv-library=${r.library.id} data-n=${r.conversations.length}
        aria-current=${here.kind === 'library' && here.id === r.library.id ? 'page' : undefined} onClick=${() => navigate('build', to)}>
        <b>${r.library.name ?? ''}</b><small>${last ? fmt(L.lastAt, { what: T.modes[last.mode] ?? last.mode, when: whenOf(last.endedAt) }) : L.none}</small></button>`
    })}
  </nav>`
}

/** 主 Agent's page: the column of conversations, then the page itself (its top bar and body). */
function AgentLayout({ here, children }) {
  return html`<div class="st-agent-layout"><${ConversationList} here=${here} /><div class="st-agent-main st-agent-switch" key=${here.kind + (here.id ?? '')}>${children}</div></div>`
}

function earlierTurn(t, i) {
  if (t.role === 'you') return html`<div key=${i} class="st-earlier__turn" data-row="you">${t.text}</div>`
  return html`<div key=${i} class="st-earlier__turn" data-row="agent">
    ${t.say ? html`<p>${t.say}</p>` : null}
    ${t.kind === 'question' && t.question ? html`<p class="muted">${fmt(T.questionN, { n: t.question.n ?? '' })} ${t.question.text}</p>` : null}
    ${t.kind === 'card' ? html`<p class="muted">${T.earlier.card}${t.card?.name ? ` · ${t.card.name}` : ''}</p>` : null}
  </div>`
}

/** One earlier conversation: its line; opened, its turns (given, or read with getConversation). */
function EarlierOne({ c }) {
  const E = T.earlier
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState(Array.isArray(c.turns) ? c.turns : null)
  const [state, setState] = useState(null)
  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (turns) return
    setState('loading')
    try { setTurns((await call('getConversation', c.id))?.turns ?? []); setState(null) } catch { setState('failed') }
  }
  const line = fmt(E.line, { when: whenOf(c.startedAt ?? c.endedAt), what: T.modes[c.mode] ?? c.mode, asked: c.asked ?? 0, cards: c.cards ?? 0, end: T.ends[c.why] ?? c.why ?? '' })
  return html`<div class="st-earlier__item" data-earlier=${c.id} data-open=${String(open)}>
    <span class="st-act" data-action="earlier-toggle"><button type="button" class="st-earlier__line" aria-expanded=${String(open)} onClick=${toggle}><span>${line}</span><small>${open ? E.fold : E.expand}</small></button></span>
    ${open ? html`<div class="st-earlier__turns">${state === 'loading' ? html`<p class="limit-note" role="status">${E.loading}</p>`
      : state === 'failed' ? html`<p class="progress-alert" role="alert">${E.failed}</p>` : (turns ?? []).map(earlierTurn)}</div>` : null}
  </div>`
}

function Earlier({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return html`<section class="st-earlier" data-part="earlier" aria-label=${T.earlier.heading}>
    <div class="st-earlier__head">${T.earlier.heading}</div>
    ${items.map(c => html`<${EarlierOne} key=${c.id} c=${c} />`)}
  </section>`
}

/** A library's earlier conversations as the list has them (summaries; each opened with getConversation). */
function useEarlierOf(libraryId) {
  const list = useLoad(() => (libraryId ? call('listConversations') : null), [libraryId])
  useEvent('build-changed', p => { if (p?.phase === 'ended') list.reload() }, [libraryId])
  return { status: list.status, items: (list.data?.libraries ?? []).find(r => r.library.id === libraryId)?.conversations ?? [] }
}

/** A library opened while another conversation is in progress: its earlier conversations, and the way to the one going. */
function OtherGoing({ libraryId, view }) {
  const { navigate, libraries } = useApp()
  const earlier = useEarlierOf(libraryId)
  const name = (libraries?.data ?? []).find(l => l.id === libraryId)?.name ?? ''
  const what = `${T.modes[view.mode] ?? ''}${view.library?.name ? ` · ${view.library.name}` : ''}`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="chat" />`} panel=${html`<${RightPanel} detail=${html`<${How} />`} />`}>
    <${Main} screen="build" state="ready" labelledby="build-title" attrs=${{ 'data-mode': 'edit', 'data-view': 'other' }}>
      <${AgentLayout} here=${{ kind: 'library', id: libraryId }}>
        <${TopBar} title=${fmt(T.continueHeading, { name })} subtitle=${T.continueSubtitle} titleTag="h1" titleId="build-title" />
        <div class="st-main__body thread-scroll"><section class="new-content">
          <${Earlier} items=${earlier.items} />
          ${earlier.status === 'ready' && earlier.items.length === 0 ? html`<p class="limit-note" data-part="earlier-none">${T.earlier.none}</p>` : null}
          <div class="st-alert" role="note" data-part="other-going"><p>${fmt(T.otherGoing, { what })}</p>
            <div class="row"><span class="st-act" data-action="to-going"><button type="button" class="btn" onClick=${() => navigate('build', view.library?.id ? { edit: view.library.id } : {})}>${T.toGoing}</button></span></div></div>
        </section></div>
      <//>
    <//>
  <//>`
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
  // 1.1.1 P3, P6: Claude Code, Codex, or an API key with the model's key stored
  const noKey = active === 'api' && appState?.data?.activeHasKey === false
  const can = active === 'claude-code' || active === 'codex' || (active === 'api' && !noKey)
  // 1.1.1 B26: an API key connection with no search this time — it says so (building goes on, reading pages only)
  const noSearch = active === 'api' && !noKey && appState?.data?.activeCanSearch === false
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
  // 1.1.2 (第 5 件): a library's earlier conversations above the box
  const earlier = useEarlierOf(target)
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current=${target ? 'chat' : 'build'} />`} panel=${html`<${RightPanel} detail=${html`<${How} />`} />`}>
    <${Main} screen="build" state="ready" labelledby="build-title" attrs=${{ 'data-mode': edit ? 'edit' : from ? 'convert' : 'create', 'data-view': 'start' }}>
      <${AgentLayout} here=${target ? { kind: 'library', id: target } : { kind: 'new' }}>
      <${TopBar} title=${cv?.title ?? (edit ? fmt(T.continueHeading, { name: libraryName ?? '' }) : T.title)} subtitle=${cv?.subtitle ?? (edit ? T.continueSubtitle : T.subtitle)} titleTag="h1" titleId="build-title" actions=${chip} />
      <div class="st-main__body">
        <section class="new-content st-build-start" data-part="build-start">
          ${target ? html`<${Earlier} items=${earlier.items} />` : null}
          ${edit && earlier.status === 'ready' && earlier.items.length === 0 ? html`<p class="limit-note" data-part="earlier-none">${T.earlier.none}</p>` : null}
          <h2>${cv ? fmt(cv.heading, { name: libraryName }) : edit ? fmt(T.editHeading, { name: libraryName }) : T.heading}</h2>
          ${cv ? html`<p class="progress-alert" data-part="from-old">${cv.note}</p>` : null}
          <label class="field"><span class="st-sr">${cv?.label ?? (edit ? T.editLabel : T.label)}</span>
            <textarea data-field="opener" rows="4" maxlength=${OPENER_MAX} placeholder=${edit ? T.continuePlaceholder : T.placeholder} value=${text} disabled=${busy}
              onInput=${e => setText(e.currentTarget.value)}
              onKeyDown=${e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); void start() } }}></textarea></label>
          ${cv || edit ? html`<p class="limit-note st-build-lead">${cv ? cv.subtitle : T.editLead}</p>`
            : html`<ul class="st-build-points" data-part="build-points">${T.leadPoints.map(([b, s]) => html`<li key=${b}><b>${b}</b><span>${s}</span></li>`)}</ul>`}
          ${can ? null : html`<div class="progress-alert" role="alert" data-part="start-why">
            <span>${noKey ? fmt(T.needKey, { api: names.api }) : fmt(T.needClaude, { name: names['claude-code'], codex: names.codex, api: names.api, current: active ? names[active] ?? active : T.chipNone })}</span>
            <span class="st-act" data-action="go-settings"><button type="button" class="btn quiet" onClick=${() => navigate('settings')}>${T.goSettings}</button></span></div>`}
          ${noSearch ? html`<p class="limit-note" data-part="no-search">${T.noSearch}
            <span class="st-act" data-action="search-settings"><button type="button" class="btn quiet" onClick=${() => navigate('settings')}>${T.goSettings}</button></span></p>` : null}
          ${error === 'going' ? html`<p class="progress-alert" role="alert" data-part="going">${T.going}</p>` : null}
          ${error === 'failed' ? html`<p class="progress-alert" role="alert" data-part="start-failed">${T.failedCall}</p>` : null}
          <div class="form-footer">
            <span class="muted st-build-cost" data-part="build-cost">${busy ? T.starting : can ? fmt(active === 'api' ? T.costApi : T.cost, { name: names[active] ?? active }) : ''}</span>
            ${typeof params.back === 'string' && params.back !== 'build' ? html`<${Btn} name="cancel-build" kind="quiet" disabled=${busy} onClick=${() => navigate(params.back)}>${T.cancel}<//>` : null}
            <small class="st-build-key" aria-hidden="true">${T.startKey}</small>
            <span class="st-act" data-action="start"><button type="button" class="btn primary" disabled=${busy || !can || !text.trim()} onClick=${() => start()}>${T.start}</button></span>
          </div>
        </section>
      </div>
      <//>
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
  // 1.1.1 P10 (A8): the turn's progress while it runs (build-changed 'progress' → getBuild().live)
  const [live, setLive] = useState(null)
  useEvent('build-changed', p => {
    if (p?.phase === 'progress') call('getBuild').then(v => setLive(v?.live ?? null), () => {})
    else if (p?.phase === 'done' || p?.phase === 'started') setLive(null)
  }, [])
  const listRef = useRef(null)
  // 1.1.2 (第 4 件): a new library's step (设置's), for the card's line when the card names none
  const defaultVolume = useLoad(() => (view.mode === 'create' ? call('getDefaultVolume') : null), [view.mode])
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
    if (working) return false
    setBusy(true)
    setNote(null)
    try { onView(await call(method, ...args)); return true } catch (err) { setNote(err?.code === 'busy' ? T.thinking : T.failedCall); return false } finally { setBusy(false) }
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
      <${AgentLayout} here=${{ kind: 'going' }}>
      <${TopBar} title=${cv?.title ?? (edit ? fmt(T.continueHeading, { name: libraryName ?? '' }) : T.title)} subtitle=${cv?.subtitle ?? (edit ? T.continueSubtitle : T.talkSubtitle)} titleTag="h1" titleId="build-title" actions=${chip} />
      <div class="st-chat">
        <div class="st-main__body thread-scroll" ref=${listRef}>
          <div class="thread" data-part="conversation">
            ${Array.isArray(view.earlier) && view.earlier.length ? html`<${Earlier} items=${view.earlier} />
              <p class="st-handed" data-part="handed-over">${T.earlier.handedOver}</p>` : null}
            <div class="date-line" data-part="date-line">${fmt(cv?.dateLine ?? (edit ? T.editDateLine : T.dateLine), { day: today })}</div>
            ${turns.map((t, i) => {
              // 1.1.2 (第 3 件): an answer to a choice question, when the turn carries it (answer: { picked, other }, the main
              // process), is the card of what you chose; an older turn without it is its sentence, as before
              if (t.role === 'you') {
                const asked = turns[i - 1]?.role === 'agent' && turns[i - 1]?.kind === 'question' ? turns[i - 1].question : null
                const a = t.answer && typeof t.answer === 'object' && asked ? t.answer : null
                return a ? html`<${AnswerCard} key=${i} n=${asked.n} picked=${Array.isArray(a.picked) ? a.picked.filter(x => typeof x === 'string') : []} other=${typeof a.other === 'string' ? a.other : ''} />`
                  : html`<div key=${i} class="user-message" data-row="you">${t.text}</div>`
              }
              return html`<div key=${i} class="assistant-message" data-row="agent" data-kind=${t.kind}>
                <${Speaker} />
                ${t.say ? html`<p class="intro-copy" data-part="reply">${t.say}</p>` : null}
                ${t.notice === 'question-not-shown' ? html`<p class="limit-note st-faint" data-part="not-shown">${T.notShown}</p>` : null}
                ${t.kind === 'question' && t.question ? html`<${Question} q=${t.question} open=${i === openQuestion} answered=${turns[i + 1]?.role === 'you'} busy=${working} onAnswer=${a => run('replyBuild', a)} />` : null}
                ${t.kind === 'card' && t.card ? html`<${BuildCard} turn=${t} last=${i === lastCard && i === lastAgent} mode=${view.mode} libraryName=${libraryName} volume=${view.mode === 'create' ? defaultVolume.data?.volume ?? null : null}
                  busy=${working} acting=${acting} onDrop=${drop} onConfirm=${confirm} onAskFix=${m => run('replyBuild', m)} />` : null}
              </div>`
            })}
            ${working ? html`<div class="assistant-message" data-part="thinking-row"><${Speaker} /><p class="limit-note" data-part="thinking" role="status"><span class="st-mo-dots" data-mo="build" aria-hidden="true"><i></i><i></i><i></i></span>${T.thinking}</p>
              ${live?.agent ? html`<p class="limit-note" data-part="thinking-live" data-step=${live.step}>${fmt(T.liveAgent, live.agent)}</p>` : null}
              ${live?.check ? html`<p class="limit-note" data-part="thinking-check">${fmt(T.liveCheck, live.check)}</p>` : null}
              <p class="limit-note st-faint" data-part="thinking-usually">${T.usuallyTurn}</p></div>` : null}
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
  // 1.1.2 (第 5 件): a library opened from the list while another conversation is in progress (one at a time, as before)
  const asked = typeof params.edit === 'string' ? params.edit : typeof params.from === 'string' ? params.from : null
  const other = Boolean(view && asked && view.library?.id !== asked)
  if (other && view.status !== 'stopped') return html`<${OtherGoing} libraryId=${asked} view=${view} />`
  // a stopped one is not in progress: the library asked for starts afresh (startBuild ends the stopped one)
  if (view && !other) return html`<${Talk} view=${view} onView=${onView} />`
  const p = restartWith ? { ...params, opener: restartWith.opener, send: undefined } : params
  return html`<${StartPage} key=${restartWith ? 'again' : 'first'} params=${p} onStarted=${v => { setRestartWith(null); build?.set?.(v) }} />`
}
