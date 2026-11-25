// 来源与要求 — redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-1 / R4b-2 / R4b-3; design 03-页面稿 P14, P15, P21 and
// 07-模板版 「来源与要求」「高级设置」「移除该库」; F45–F55, N08; 维护者 11-11 第 8、10、14、17、18 题), 1.1 (W6a, W7a, W7b). The 来源与要求
// tab of a library's page (screens/library-frame.js), on the template's parts (new-content, eyebrow, section-label, search-field,
// file-row, status-chip, document-link, after-card, phase-row, form-footer, limit-note, progress-alert, the dialog); the app's
// layer (styles/template-app.css part 9) only sizes and places them. Two views of the one route 'sources':
//
// 来源与要求 (params.view absent):
//   A library with a card (1.1 W6a, A5): 建库卡 (its paragraph and seven lines; 「建库卡全文」 folds out the other parts; 「和主
//              Agent 改卡」 → the build conversation, params.edit), 来源 (the card's sources: address or search word, state,
//              「原文」; a new one typed in waits for 确认 — B3: nothing is written before).
//   A library made by the last version (no card, A6; 1.1 W7b): read only — the notice 「这座库是上一版建的」 with 「重新查一遍来源」
//              (→ the build conversation, params.from: W7a), then its 追踪要求 as it was written and its sources as they are
//              (name, kind · address, the last fetch's state and what to do). Nothing of it is edited here any more: v1.0's
//              levels, its sources' 测试抓取 / 暂停 / 修改地址 / 删除, its topics and its 单次运行上限 are gone with the scoring
//              pipeline.
//   定时       one line 「每天 [时刻] 自动运行」 + 保存 (setLibrarySchedule), and a line under it: the next run, 需保持流息运行, a
//              missed run made up once.
//   then 「高级设置：变更记录 · 库文件夹 →」 (document-link).
//
// 高级设置 (params.view === 'advanced') — 「← 返回来源与要求」, the title, a line, two folds (the template's phase-row, open):
//   01 变更记录   getChangeLog: a table 时间 · 变更内容 · 操作来源 (手动修改 / 初始设置 …), newest first; 首次设置's record folded in as
//                初始设置 rows. Only what was recorded: an old library shows fewer rows, never made-up ones.
//   02 库文件夹   its path, 在资源管理器中显示 (revealLibrary), 重建索引 (rebuildIndex), 移除该库 (P21: the template dialog — 仅取消登记 …,
//                文件夹及其中的文件不会被删除, the path, 取消 · 移除 → removeLibrary(id): only the registration goes; not one file of the
//                folder is touched — then 库架).
// Words: texts/sources.js SOURCES / ADVANCED; FETCH_STATES / FETCH_HINTS / SOURCE_KINDS of texts/common.js.
// Test hooks: main[data-screen="sources"][data-state][data-view=main|advanced]; [data-part=card|card-summary|card-lines|card-full|
// card-sources|source-pending|source-note|old-library|recheck-why|old-brief|old-sources|run|run-note|this-library|changes-fold|
// folder-fold|changes]; input[data-field=card-source|schedule-on|schedule-time]; [data-card-row=<name>][data-state][data-original];
// [data-row=<name>][data-state][data-paused][data-consecutive] with [data-fetch-word], [data-hint=<code>]; [data-change-row]
// [data-kind][data-field][data-by]; [data-library-path]; dialog[data-dialog=remove-library]; [data-action=card-full|change-card|
// confirm-source|drop-source|recheck-sources|save-run|go-advanced|back-sources|reveal-library|rebuild|remove-library|confirm-remove|
// cancel-remove].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { CONNECTIONS, ERRORS, FETCH_HINTS, FETCH_STATES, NEXT_WHEN, PUNCT, SCHEDULE, SEP, SOURCE_KINDS, SOURCE_STATES, WHEN } from '../texts/common.js'
import { scheduleWhen } from '../lib/schedule-words.js'
import { ADVANCED as A, SOURCES as T } from '../texts/sources.js'
import { SETTINGS } from '../texts/settings.js'
import { LibraryFrame } from './library-frame.js'
import { Btn, TDialog } from './t-dialog.js'
import { CardSuggestions, gapsOf } from './run-steps.js'

const FIVE = ['ok', 'empty', 'gap', 'failed', 'blocked']
const kindWord = k => (Object.hasOwn(SOURCE_KINDS, k) ? SOURCE_KINDS[k] : String(k ?? ''))
const stateWord = s => (Object.hasOwn(FETCH_STATES, s) ? FETCH_STATES[s] : Object.hasOwn(SOURCE_STATES, s) ? SOURCE_STATES[s] : String(s ?? ''))
const hintWords = h => (h && h !== 'none' && Object.hasOwn(FETCH_HINTS, h) ? FETCH_HINTS[h] : null)
const bare = u => String(u ?? '').replace(/^https?:\/\//i, '')

/** A source's state as the row shows it: paused, never fetched, or one of the five. */
export function rowState(s) {
  if (s.paused) return 'paused'
  if (typeof s.status !== 'string' || s.status === '') return 'never'
  return s.status
}

/** The state chip's words: 「正常 · 5 条」, 「地址无效 · 连续 4 次运行」, 「已暂停」 … (redesign R5b precheck fix 11: never an HTTP code —
 * the page is not given one (O9), and the words that would say it are gone, so a code coming back is not shown either) */
function stateLine(s) {
  const state = rowState(s)
  const word = stateWord(state)
  if (state === 'ok') return fmt(T.row.count, { state: word, n: s.count ?? 0 })
  if (['failed', 'gap', 'blocked'].includes(state)) {
    return fmt(T.row.streakNoHttp, { state: word, n: s.consecutive ?? 1 })
  }
  return word
}

// ---- a library made by the last version: what it had, read only (1.1 W7b) -----------------------------------------------

/** Its 追踪要求 as it was written (getCardView's brief), read only. */
function OldBriefPart({ brief }) {
  const text = typeof brief === 'string' ? brief.trim() : ''
  return html`<section class="st-src-part" data-part="old-brief" aria-labelledby="src-old-brief-h">
    <div class="section-label"><span id="src-old-brief-h">${T.brief.heading}</span></div>
    ${text ? html`<p class="intro-copy st-src-old-brief">${text}</p>` : html`<p class="limit-note">${T.brief.none}</p>`}
  </section>`
}

/** One of its sources: 来源 · 状态与处理建议 (the last fetch), read only. */
function OldSourceLine({ s }) {
  const state = rowState(s)
  const address = s.kind === 'rss' ? bare(s.url) : s.query ?? ''
  const hint = state === 'paused' || state === 'never' ? null : hintWords(s.hint)
  return html`<div class="file-row st-src-row st-src-row--old" role="row" data-row=${s.name} data-state=${state} data-paused=${String(Boolean(s.paused))} data-consecutive=${s.consecutive ?? ''}>
    <span class="file-icon"><${TIcon} name="book" /></span>
    <span class="file-text st-src-cell">${s.name}<small>${fmt(T.row.address, { kind: kindWord(s.kind), address })}</small></span>
    <span class="st-src-cell st-src-state">
      <span class="status-chip" data-fetch-word>${FIVE.includes(state) && state !== 'ok' && state !== 'empty' ? html`<span class="dot"></span> ` : null}${stateLine(s)}</span>
      ${hint ? html`<small data-hint=${s.hint}>${hint}</small>` : null}
      ${s.lastOkAt ? html`<small data-part="last-ok">${fmt(T.row.lastOk, { when: whenText(s.lastOkAt, WHEN) ?? String(s.lastOkAt).slice(0, 10) })}</small>` : null}
    </span>
  </div>`
}

/** Its sources as they are (getSources), read only. */
function OldSourcesPart({ view }) {
  const sources = Array.isArray(view?.sources) ? view.sources : []
  return html`<section class="st-src-part" data-part="old-sources" aria-labelledby="src-old-sources-h">
    <div class="section-label"><span id="src-old-sources-h">${fmt(T.sourcesHeading, { n: sources.length })}</span></div>
    ${sources.length ? html`<div class="st-src-table" role="table" aria-labelledby="src-old-sources-h">
      <div class="st-src-row st-src-head st-src-row--old" role="row"><span></span><span>${T.table.source}</span><span>${T.table.state}</span></div>
      ${sources.map(s => html`<${OldSourceLine} key=${s.name} s=${s} />`)}
    </div>` : html`<p class="limit-note" data-part="sources-none">${T.none}</p>`}
  </section>`
}

// ---- 定时 ----------------------------------------------------------------------------------------------------------------

// 1.1.1 P11a (A10): how often — every day (as before), weekdays, days of the week, a day of the month — and, when the schedule is
// not what the card's 「节奏」 says (a library brought up from 1.1.0 runs every day whatever its card says), one line and
// 「按节奏设」; nothing changes without the user. Test hooks: [data-field=schedule-every|schedule-day|schedule-time|schedule-on],
// [data-weekday=0..6][aria-pressed], [data-part=run-mismatch], [data-action=to-rhythm].
const EVERY = ['day', 'weekdays', 'week', 'month']
const oftenOf = (every, days, day) => (every === 'week' ? { every, days: [...days].sort((a, b) => a - b) } : every === 'month' ? { every, day: Number(day) } : every === 'weekdays' ? { every } : {})

function RunPart({ libraryId, onCard = null }) {
  const sched = useLoad(() => (libraryId ? call('getLibrarySchedule', libraryId) : null), [libraryId])
  useEvent('settings-changed', p => { if (!p || p.libraryId === undefined || p.libraryId === libraryId) sched.reload() })
  const [on, setOn] = useState(true)
  const [time, setTime] = useState('')
  const [every, setEvery] = useState('day')
  const [days, setDays] = useState([])
  const [day, setDay] = useState('1')
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const d = sched.data
  // what the user typed and has not saved yet is theirs: a re-read that lands meanwhile (settings-changed — another window) does
  // not put the saved values back over it; 保存 (or another library) ends the draft
  const draft = useRef(false)
  useEffect(() => { draft.current = false }, [libraryId])
  useEffect(() => {
    if (d && !draft.current) { setOn(d.enabled); setTime(d.time); setEvery(d.every ?? 'day'); setDays(d.days ?? [new Date().getDay()]); setDay(String(d.day ?? Math.min(28, new Date().getDate()))) }
  }, [d?.enabled, d?.time, d?.every, JSON.stringify(d?.days ?? null), d?.day])
  const edit = set => v => { draft.current = true; set(v) }
  const toggleDay = n => { draft.current = true; setDays(list => (list.includes(n) ? list.filter(x => x !== n) : [...list, n])) }
  const write = async (s, doneText) => {
    setBusy(true)
    setNote(null)
    try {
      const r = await call('setLibrarySchedule', libraryId, s)
      sched.mutate(() => r)
      draft.current = false
      setNote({ kind: 'saved', text: doneText })
    } catch (err) {
      setNote({ kind: 'bad', text: err?.code === 'bad_arguments' ? T.run.timeBad : T.failed })
    } finally { setBusy(false) }
  }
  const save = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { setNote({ kind: 'bad', text: T.run.timeBad }); return }
    if (every === 'week' && days.length === 0) { setNote({ kind: 'bad', text: T.run.weekdayNone }); return }
    if (every === 'month' && !(/^\d{1,2}$/.test(day) && Number(day) >= 1 && Number(day) <= 28)) { setNote({ kind: 'bad', text: T.run.monthDayBad }); return }
    await write({ enabled: on, time, ...oftenOf(every, days, day) }, T.run.saved)
  }
  // 「按节奏设」: the card's rhythm as the schedule, at the time and on/off the library has now
  const rhythm = d?.rhythm ?? null
  const toRhythm = () => write({ enabled: d.enabled, time: d.time, ...oftenOf(rhythm.every, rhythm.days ?? [], rhythm.day ?? 1) }, T.run.toRhythmDone)
  const ready = Boolean(d)
  const off = !ready || busy || !on
  return html`<section class="st-src-part" data-part="run" aria-labelledby="src-run-h">
    <div class="section-label"><span id="src-run-h">${T.run.heading}</span></div>
    ${sched.status === 'error' && !d ? html`<p class="progress-alert" role="alert">${T.run.failed}</p>` : null}
    <div class="st-nl-schedule st-src-run" data-schedule=${d ? (d.enabled ? 'on' : 'off') : 'unknown'} data-every=${d ? (d.every ?? 'day') : ''}>
      <label class="st-nl-check"><input type="checkbox" data-field="schedule-on" checked=${on} disabled=${!ready || busy} onChange=${e => edit(setOn)(e.currentTarget.checked)} /> ${T.run.heading}</label>
      <span class="field st-nl-small"><select data-field="schedule-every" aria-label=${T.run.often} value=${every} disabled=${off} onChange=${e => edit(setEvery)(e.currentTarget.value)}>
        ${EVERY.map(k => html`<option key=${k} value=${k}>${SCHEDULE.every[k]}</option>`)}
      </select></span>
      ${every === 'week' ? html`<span class="filters st-src-weekdays" role="group" aria-label=${T.run.weekdayLabel}>${[1, 2, 3, 4, 5, 6, 0].map(n => html`<button type="button" key=${n} class=${`filter${days.includes(n) ? ' active' : ''}`} data-weekday=${n} aria-pressed=${String(days.includes(n))} disabled=${off} onClick=${() => toggleDay(n)}>${SCHEDULE.weekdays[n]}</button>`)}</span>` : null}
      ${every === 'month' ? html`<span class="field st-nl-small"><input data-field="schedule-day" aria-label=${T.run.monthDayLabel} value=${day} maxlength="2" disabled=${off} onInput=${e => edit(setDay)(e.currentTarget.value.trim())} /></span>` : null}
      <span class="field st-nl-small"><input data-field="schedule-time" aria-label=${T.run.timeLabel} value=${time} maxlength="5" disabled=${off} onInput=${e => edit(setTime)(e.currentTarget.value.trim())} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} /></span>
      <span>${T.run.at}</span>
      <span class="st-src-run-save"><${Btn} name="save-run" disabled=${!ready || busy} onClick=${save}>${T.run.save}<//></span>
    </div>
    ${rhythm && !rhythm.matches ? html`<div class="st-alert st-src-mismatch" role="note" data-part="run-mismatch">
      <p>${fmt(T.run.mismatch, { rhythm: rhythm.text.length > 40 ? `${[...rhythm.text].slice(0, 40).join('')}…` : rhythm.text, want: scheduleWhen(rhythm), now: scheduleWhen(d) })}</p>
      <div class="row">
        <span class="st-act" data-action="to-rhythm"><button type="button" class="btn" disabled=${busy} onClick=${toRhythm}>${T.run.toRhythm}</button></span>
        ${onCard ? html`<span class="st-act" data-action="rhythm-to-card"><button type="button" class="btn quiet" disabled=${busy} onClick=${() => onCard(fmt(T.run.rhythmAsk, { now: scheduleWhen(d) }))}>${T.run.toCard}</button></span>` : null}
      </div>
    </div>` : null}
    ${note ? html`<p class=${note.kind === 'saved' ? 'limit-note' : 'progress-alert'} role=${note.kind === 'saved' ? 'status' : 'alert'} data-part="run-note" data-kind=${note.kind}>${note.text}</p>` : null}
    <p class="limit-note" data-next-run=${d?.nextRunAt ?? ''}>${d ? (d.nextRunAt ? fmt(T.run.next, { when: nextText(d.nextRunAt, NEXT_WHEN) ?? d.nextRunAt }) : T.run.off) : ''}${T.run.rule}</p>
  </section>`
}

// ---- 每次更新的量 ------------------------------------------------------------------------------------------------------------

// 1.1.2 (第 4 件; 赞妮's mock 04): three steps, what each costs, and — when the last update came near its limit or left sources
// unread for it — one line under them with its numbers (getLibraryVolume().near); nothing at all when it did not. A step is
// saved at once (setLibraryVolume: the user's change, recorded as theirs). Test hooks: section[data-part=volume] with
// [data-volume=<step>][aria-checked], [data-part=volume-near][data-reads][data-limit][data-unread], [data-part=volume-note].
function VolumePart({ libraryId }) {
  const V = T.volume
  const view = useLoad(() => (libraryId ? call('getLibraryVolume', libraryId) : null), [libraryId])
  useEvent('library-changed', () => view.reload())
  useEvent('round-progress', p => { if (p?.done) view.reload() })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const d = view.data
  const pick = async v => {
    if (!d || busy || v === d.volume) return
    setBusy(true)
    setNote(null)
    try { const r = await call('setLibraryVolume', libraryId, v); view.mutate(() => r); setNote({ kind: 'saved', text: V.saved }) } catch { setNote({ kind: 'bad', text: V.failed }) } finally { setBusy(false) }
  }
  const near = d?.near ?? null
  const standardN = d ? Math.round((d.budget?.newLinks ?? 20) / ({ standard: 1, more: 2, most: 3 }[d.volume] ?? 1)) : 20
  return html`<section class="st-src-part" data-part="volume" aria-labelledby="src-volume-h">
    <div class="section-label"><span id="src-volume-h">${V.heading}</span></div>
    ${view.status === 'error' && !d ? html`<p class="progress-alert" role="alert">${V.loadFailed}</p>` : null}
    <p class="limit-note" data-part="volume-cost">${V.cost}</p>
    <div class="st-seg" role="radiogroup" aria-labelledby="src-volume-h">
      ${(d?.volumes ?? ['standard', 'more', 'most']).map(v => html`<button type="button" key=${v} role="radio" class=${`st-seg__opt${d?.volume === v ? ' is-on' : ''}`} aria-checked=${String(d?.volume === v)} data-volume=${v} disabled=${!d || busy} onClick=${() => pick(v)}>
        <b>${V.names[v]}</b><small>${fmt(V.hints[v], { n: standardN })}</small></button>`)}
    </div>
    ${near ? html`<p class="st-alert st-mo-banner" role="note" data-part="volume-near" data-reads=${near.reads} data-limit=${near.limit} data-unread=${near.notRead}>
      ${near.notRead > 0 ? fmt(V.near, { reads: near.reads, limit: near.limit, n: near.notRead }) : fmt(V.nearAll, { reads: near.reads, limit: near.limit })}${d?.volume !== 'most' ? ` ${V.nearNext}` : ''}</p>` : null}
    ${note ? html`<p class=${note.kind === 'saved' ? 'limit-note' : 'progress-alert'} role=${note.kind === 'saved' ? 'status' : 'alert'} data-part="volume-note" data-kind=${note.kind}>${note.text}</p>` : null}
  </section>`
}

// ---- 高级设置 ------------------------------------------------------------------------------------------------------------

/** One fold of 高级设置 (the template's phase-row, open at first). */
function Fold({ index, part, title, small, children }) {
  return html`<details class="phase-row st-src-fold" open data-part=${part}>
    <summary class="phase-heading"><span class="phase-index">${index}</span><span class="phase-label">${title}<small>${small}</small></span><${TIcon} name="down" /></summary>
    <div class="phase-details">${children}</div>
  </details>`
}

const names = list => list.join(A.log.fields.join)
const byName = list => new Map((Array.isArray(list) ? list : []).map(x => [x?.name, x]))
const schedWords = v => (v && v.enabled ? fmt(A.log.fields.scheduleOn, { when: scheduleWhen(v).toLowerCase(), time: v.time }) : A.log.fields.scheduleOff)
const clip = (s, n = 60) => { const a = [...String(s ?? '')]; return a.length > n ? `${a.slice(0, n).join('')}…` : a.join('') }

/** What a change was, in a sentence of the table: the field's before and after as words (never the raw JSON). */
export function changeWords(row) {
  const F = A.log.fields
  if (row.kind === 'setup') {
    const step = Object.hasOwn(SETTINGS.setupSteps, row.step) ? SETTINGS.setupSteps[row.step] : row.step
    const by = Object.hasOwn(SETTINGS.setupBy, row.setupBy) ? SETTINGS.setupBy[row.setupBy] : String(row.setupBy ?? '')
    return fmt(A.log.setup, { step, by })
  }
  const b = row.before
  const a = row.after
  switch (row.field) {
    case 'name': return b ? fmt(F.name, { before: b, after: a ?? '' }) : fmt(F.nameNew, { after: a ?? '' })
    case 'brief': return a ? fmt(F.brief, { after: clip(a) }) : F.briefNone
    case 'schedule': return b ? fmt(F.schedule, { before: schedWords(b), after: schedWords(a) }) : fmt(F.scheduleNew, { after: schedWords(a) })
    // 1.1.2 (第 4 件)
    case 'volume': return fmt(F.volume, { before: T.volume.names[b] ?? String(b ?? ''), after: T.volume.names[a] ?? String(a ?? '') })
    case 'sources': {
      const before = byName(b)
      const after = byName(a)
      if (!b) return fmt(F.sourcesSet, { n: after.size })
      const parts = []
      const added = [...after.keys()].filter(k => !before.has(k))
      const removed = [...before.keys()].filter(k => !after.has(k))
      const kept = [...after.keys()].filter(k => before.has(k))
      const paused = kept.filter(k => !before.get(k)?.paused && after.get(k)?.paused)
      const resumed = kept.filter(k => before.get(k)?.paused && !after.get(k)?.paused)
      const edited = kept.filter(k => !paused.includes(k) && !resumed.includes(k) && JSON.stringify(before.get(k)) !== JSON.stringify(after.get(k)))
      if (added.length) parts.push(fmt(F.sourcesAdded, { names: names(added) }))
      if (removed.length) parts.push(fmt(F.sourcesRemoved, { names: names(removed) }))
      if (paused.length) parts.push(fmt(F.sourcesPaused, { names: names(paused) }))
      if (resumed.length) parts.push(fmt(F.sourcesResumed, { names: names(resumed) }))
      if (edited.length) parts.push(fmt(F.sourcesChanged, { names: names(edited) }))
      return parts.length ? parts.join(F.sep) : fmt(F.other, { field: A.log.fieldNames.sources })
    }
    case 'topics': {
      const before = byName(b)
      const after = byName(a)
      if (!b) return fmt(F.topicsSet, { n: after.size })
      const parts = []
      const added = [...after.keys()].filter(k => !before.has(k))
      const removed = [...before.keys()].filter(k => !after.has(k))
      const words = [...after.keys()].filter(k => before.has(k) && JSON.stringify(before.get(k)?.keywords) !== JSON.stringify(after.get(k)?.keywords))
      if (added.length) parts.push(fmt(F.topicsAdded, { names: names(added) }))
      if (removed.length) parts.push(fmt(F.topicsRemoved, { names: names(removed) }))
      if (words.length) parts.push(fmt(F.topicsKeywords, { names: names(words) }))
      return parts.length ? parts.join(F.sep) : fmt(F.other, { field: A.log.fieldNames.topics })
    }
    default: return fmt(F.other, { field: Object.hasOwn(A.log.fieldNames, row.field) ? A.log.fieldNames[row.field] : String(row.field ?? '') })
  }
}
function ChangeLog() {
  const log = useLoad(() => call('getChangeLog'), [])
  useEvent('library-changed', () => log.reload())
  useEvent('settings-changed', () => log.reload())
  const rows = log.data?.rows ?? []
  if (log.status === 'error' && !log.data) return html`<p class="progress-alert" role="alert" data-part="changes" data-state="error">${A.log.failed}</p>`
  return html`<div data-part="changes" data-state=${log.data ? 'ready' : 'loading'} data-count=${rows.length}>
    ${rows.length ? html`<table class="st-log">
      <thead><tr><th scope="col">${A.log.time}</th><th scope="col">${A.log.what}</th><th scope="col">${A.log.by}</th></tr></thead>
      <tbody>${rows.map((r, i) => html`<tr key=${i} data-change-row data-kind=${r.kind} data-field=${r.field ?? r.step ?? ''} data-by=${r.by}>
        <td data-part="when">${whenText(r.at, WHEN) ?? ''}</td>
        <td data-part="what">${changeWords(r)}</td>
        <td data-part="by">${A.log.bys[r.by] ?? r.by}</td>
      </tr>`)}</tbody>
    </table>` : log.data ? html`<p class="limit-note">${A.log.none}</p>` : null}
    ${log.data?.skipped ? html`<p class="limit-note">${fmt(A.log.skipped, { n: log.data.skipped })}</p>` : null}
  </div>`
}

function FolderPart({ library, onRemove }) {
  const L = A.library
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [rebuilt, setRebuilt] = useState(null)
  const reveal = async () => {
    setNote(null)
    try { await call('revealLibrary') } catch { setNote(L.revealFailed) }
  }
  const rebuild = async () => {
    setBusy(true)
    setNote(null)
    setRebuilt(null)
    try { setRebuilt(await call('rebuildIndex')) } catch { setNote(L.rebuildFailed) } finally { setBusy(false) }
  }
  return html`<div data-part="this-library">
    <div class="form-footer st-src-folder">
      <${Btn} name="reveal-library" disabled=${!library} onClick=${reveal}><${TIcon} name="external" /> ${L.reveal}<//>
      <${Btn} name="rebuild" busy=${busy} disabled=${!library} onClick=${rebuild}>${busy ? L.rebuilding : L.rebuild}<//>
      <span class="st-src-folder-gap"></span>
      <${Btn} name="remove-library" kind="quiet" disabled=${!library?.libraryId} onClick=${onRemove}>${L.remove}<//>
    </div>
    ${rebuilt ? html`<p class="limit-note" role="status" data-rebuilt=${rebuilt.count}>${fmt(L.rebuilt, { count: rebuilt.count, tidy: rebuilt.pending?.length ?? 0 })}</p>` : null}
    ${note ? html`<p class="progress-alert" role="alert">${note}</p>` : null}
    <p class="limit-note">${L.removeHint}</p>
  </div>`
}

function AdvancedView({ library, onRemove }) {
  const { navigate } = useApp()
  return html`<div class="new-content st-src st-src-advanced">
    <div class="after-card"><button type="button" data-action="back-sources" onClick=${() => navigate('sources')}><${TIcon} name="back" /> ${A.back}</button></div>
    <h2 id="sources-title">${A.heading}</h2>
    <p>${A.lead}</p>
    <${Fold} index="01" part="changes-fold" title=${A.changes} small=${A.changesHint}><${ChangeLog} /><//>
    <${Fold} index="02" part="folder-fold" title=${A.folder} small=${html`<span class="st-path" data-library-path=${library?.path ?? ''}>${library?.path ?? ''}</span>`}><${FolderPart} library=${library} onRemove=${onRemove} /><//>
  </div>`
}

// ---- dialogs -------------------------------------------------------------------------------------------------------------

function ConfirmDialog({ name, title, onConfirm, onClose, confirm, cancel, closeLabel, children }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const go = async () => {
    setBusy(true)
    setError(false)
    try { await onConfirm() } catch { setError(true); setBusy(false) }
  }
  return html`<${TDialog} name=${name} title=${title} closeLabel=${closeLabel} onClose=${onClose}
    footer=${html`<${Btn} name="cancel-remove" kind="quiet" disabled=${busy} onClick=${onClose}>${cancel}<//><${Btn} name="confirm-remove" kind="primary" disabled=${busy} onClick=${go}>${confirm}<//>`}>
    <div class="readable">${children}</div>
    ${error ? html`<p class="progress-alert" role="alert">${T.failed}</p>` : null}
  <//>`
}

/**
 * 移除该库 (P21): only the registration goes (removeLibrary); not one file of the folder is touched. 1.1.1 P11a (A11): the
 * same dialog from 库架's 「更多」. onDone after it went; an error stays in the dialog.
 */
export function RemoveLibraryDialog({ id, name, path, onDone, onClose }) {
  return html`<${ConfirmDialog} name="remove-library" title=${fmt(A.removeDialog.title, { name })} closeLabel=${A.removeDialog.close}
    confirm=${A.removeDialog.confirm} cancel=${A.removeDialog.cancel} onClose=${onClose}
    onConfirm=${async () => { await call('removeLibrary', id); onDone() }}>
    <p data-part="remove-text">${A.removeDialog.text}</p>
    <p><b data-part="remove-kept">${A.removeDialog.kept}</b>${A.removeDialog.restore}</p>
    <p class="st-path" data-part="remove-path">${path}</p>
  <//>`
}

// ---- 1.1 W6a: a library with a card (A5), and one built by the last version (A6) ----------------------------------------------------
const pad = n => String(n).padStart(2, '0')
const LINES = ['purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard']
const listOf = v => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() !== '' ? [v] : [])

/** The card's definition (a paragraph and its seven lines), and its other parts folded under 「建库卡全文」. */
// 1.1.2 (U3): a line of 「每次怎么挑」 that sets how many items each update takes (「每次控制在 3 到 8 条」, 「每次最多 5 条」 …)
const COUNT_LIMIT = /(每次|每轮|一次)[^，。；]{0,8}?(\d+\s*(到|至|-|—|~|～)\s*\d+|最多\s*\d+|不超过\s*\d+|至少\s*\d+)\s*条|\b(\d+\s*(to|-|–)\s*\d+|at most \d+|up to \d+|no more than \d+)\s+items?\b/i
export function countLimitOf(card) {
  const hit = listOf(card?.pick).find(x => COUNT_LIMIT.test(String(x)))
  return hit ? (hit.match(COUNT_LIMIT)?.[0] ?? null) : null
}

function CardPart({ card, history, onChange }) {
  const C = T.card
  const [open, setOpen] = useState(false)
  const d = card.definition ?? {}
  return html`<section class="st-src-part" data-part="card" aria-labelledby="src-card-h">
    <div class="section-label"><span id="src-card-h">${C.heading}</span>${history ? html`<small class="muted" data-part="card-version">${history}</small>` : null}</div>
    <p class="intro-copy" data-part="card-summary">${d.summary ?? ''}</p>
    ${countLimitOf(card) ? html`<p class="st-alert" role="note" data-part="card-count-limit">${fmt(T.card.countLimit, { text: countLimitOf(card) })}</p>` : null}
    <dl class="decision-points" data-part="card-lines">${LINES.map((k, i) => html`<div key=${k} data-line=${k}><dt><span class="point-index">${pad(i + 1)}</span>${C.lines[k]}</dt><dd>${d[k] ?? ''}</dd></div>`)}</dl>
    ${open ? html`<div class="st-src-card-full" data-part="card-full">
      ${Array.isArray(card.decide) && card.decide.length ? html`<div class="section-label"><span>${C.parts.decide}</span></div><ol>${card.decide.map((x, i) => html`<li key=${i}>${x.what}${x.default ? `${PUNCT.open}${x.default}${PUNCT.close}` : ''}</li>`)}</ol>` : null}
      ${['collect', 'skip', 'pick', 'write'].map(k => html`<div key=${k} data-card-part=${k}><div class="section-label"><span>${C.parts[k]}</span></div><ul>${listOf(card[k]).map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>`)}
      <div data-card-part="unreadable"><div class="section-label"><span>${C.parts.unreadable}</span></div><ul>${(card.unreadable ?? []).map((x, i) => html`<li key=${i}>${x.name}${SEP}${x.reason}</li>`)}</ul></div>
      <div data-card-part="samples"><div class="section-label"><span>${C.parts.samples}</span></div><ul>${(card.samples ?? []).map((x, i) => html`<li key=${i}>${x.title}${x.date ? `${SEP}${x.date}` : ''}</li>`)}</ul></div>
    </div>` : null}
    <div class="form-footer st-src-footer">
      ${open ? null : html`<span class="muted st-src-card-note">${C.restNote}</span>`}
      <${Btn} name="card-full" kind="quiet" onClick=${() => setOpen(o => !o)}>${open ? C.fold : C.full}<//>
      <${Btn} name="change-card" kind="primary" onClick=${onChange}>${C.change}<//>
    </div>
  </section>`
}

// a reader's reason as one of the states' words (core read/source-state.mjs: dead is 地址失效 here, as on the card's rows)
const STATE_OF_REASON = Object.freeze({ dead: 'dead', blocked: 'blocked', check: 'check', login: 'login', failed: 'failed' })

/** The card's sources: address or search word, state, 「原文」; a new one typed in, then 确认 (B3: nothing written before). */
function CardSourcesPart({ rows, onAdded }) {
  const S = T.cardSources
  const [text, setText] = useState('')
  const [pending, setPending] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const propose = async () => {
    const t = text.trim()
    if (!t) return
    setBusy(true); setNote(null)
    try { setPending(await call('proposeCardSource', t)) } catch { setNote(S.badInput) } finally { setBusy(false) }
  }
  const settle = async yes => {
    if (!pending) return
    setBusy(true)
    try {
      await call('settleCardSource', pending.id, yes)
      setPending(null)
      if (yes) { setText(''); onAdded() }
    } catch (err) { setNote(err?.code === 'bad_arguments' ? S.exists : S.failed); setPending(null) } finally { setBusy(false) }
  }
  const what = s => (s.url ? s.url : fmt(S.searchWord, { q: s.query }))
  return html`<section class="st-src-part" data-part="card-sources" aria-labelledby="src-card-sources-h">
    <div class="section-label"><span id="src-card-sources-h">${fmt(S.heading, { n: rows.filter(r => !r.unreadable).length })}</span></div>
    <label class="search-field"><${TIcon} name="plus" />
      <input data-field="card-source" aria-label=${S.placeholder} placeholder=${S.placeholder} value=${text} disabled=${busy || Boolean(pending)}
        onInput=${e => setText(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); propose() } }} /></label>
    ${pending ? html`<div class="progress-alert st-src-pending" data-part="source-pending" role="status">
      <span>${fmt(S.confirmLine, { what: what(pending.source) })}</span>
      <div class="row"><${Btn} name="drop-source" kind="quiet" disabled=${busy} onClick=${() => settle(false)}>${S.drop}<//><${Btn} name="confirm-source" kind="primary" disabled=${busy} onClick=${() => settle(true)}>${S.confirm}<//></div>
    </div>` : null}
    ${note ? html`<p class="limit-note" role="alert" data-part="source-note">${note}</p>` : null}
    <div class="st-src-table" role="table" aria-labelledby="src-card-sources-h">
      <div class="st-src-row st-src-head st-src-row--card" role="row"><span></span><span>${S.head.source}</span><span>${S.head.state}</span><span>${S.head.original}</span></div>
      ${rows.map((r, i) => html`<div key=${i} class="file-row st-src-row st-src-row--card" role="row" data-card-row=${r.name} data-state=${r.state} data-original=${r.original}>
        <span class="file-icon"><${TIcon} name=${r.query ? 'search' : 'globe'} fallback="file" /></span>
        <span class="file-text st-src-cell">${r.name}<small>${r.url ?? fmt(S.searchWord, { q: r.query })}</small></span>
        <span class="st-src-cell st-src-state"><span class="status-chip">${S.states[r.state] ?? r.state}</span>${r.unreadable ? html`<small>${S.unreadable}${r.reason ? `${SEP}${r.reason}` : ''}</small>` : null}${r.unreadable && r.checked ? html`<small data-part="source-checked" data-ok=${String(r.checked.ok)}>${r.checked.ok ? S.checkedOk : fmt(S.checked, { why: S.states[STATE_OF_REASON[r.checked.reason] ?? 'failed'] })}</small>` : null}</span>
        <span class="st-src-cell"><span class="status-chip" data-original-word=${r.original}>${S.originals[r.original] ?? r.original}</span></span>
      </div>`)}
    </div>
  </section>`
}

/** A library with no card: built by the last version — what still works, and the way on (A6). */
function OldNotice({ connection, hasKey, onRecheck }) {
  const O = T.old
  // 1.1.1 P6 (A6): an API key with the model's key can check the sources again too
  const can = connection === 'claude-code' || connection === 'codex' || (connection === 'api' && hasKey !== false)
  return html`<section class="st-src-part progress-alert st-src-old" data-part="old-library" data-can=${String(can)} role="note">
    <div class="section-label"><span>${O.heading}</span></div>
    <p class="limit-note">${O.text}</p>
    <div class="row"><${Btn} name="recheck-sources" kind="primary" disabled=${!can} onClick=${onRecheck}>${O.action}<//>
      ${can ? null : html`<small class="muted" data-part="recheck-why">${fmt(O.needsClaude, { cc: CONNECTIONS.names['claude-code'], cx: CONNECTIONS.names.codex, api: CONNECTIONS.names.api })}</small>`}</div>
  </section>`
}

export function SourcesScreen({ params = {} }) {
  const { appState, navigate, libraries } = useApp()
  const library = appState?.data?.library ?? null
  const libraryId = library?.libraryId ?? null
  const advanced = params.view === 'advanced'
  // 1.1 W6a: the library's card and its sources (A5), or the notice of a library built by the last version (A6), whose sources
  // (getSources) are listed read only
  const cardView = useLoad(() => call('getCardView'), [libraryId])
  const cv = cardView.data
  const old = cv?.old === true
  const view = useLoad(() => (old ? call('getSources') : null), [libraryId, old])
  useEvent('library-changed', () => { cardView.reload(); if (old) view.reload() })
  const hasCard = Boolean(cv?.card)
  // 1.1.2 (U7): the last update's 「改卡建议」, under the card too (getHome: the current library's last run record)
  const home = useLoad(() => (hasCard ? call('getHome') : null), [libraryId, hasCard])
  useEvent('round-progress', p => { if (p?.done && hasCard) home.reload() })
  const [dialog, setDialog] = useState(null)
  const close = () => setDialog(null)
  const state = advanced ? (library ? 'ready' : appState?.status ?? 'loading') : cv && (!old || view.data) ? 'ready' : cardView.status === 'error' || view.status === 'error' ? 'error' : 'loading'
  // redesign R6d (found by the v2 draft's UC3 step 4 picture, retaken in R6d's total acceptance): 来源与要求 and 高级设置 are one
  // scrolling body, so 高级设置 opened from the link at the bottom of 来源与要求 kept that scroll and showed its own middle (which
  // part of it depended on how long 来源与要求 happened to be). A change of view starts at the top; the scroll event this makes is
  // remembered by the frame like the user's own, so the library's remembered place is the top too.
  const body = useRef(null)
  const shownView = useRef(advanced)
  useEffect(() => {
    if (shownView.current === advanced) return
    shownView.current = advanced
    if (body.current) body.current.scrollTop = 0
  }, [advanced])
  return html`<${LibraryFrame} tab="sources" state=${state} labelledby="sources-title" section=${params.section}>
      <div class="st-main__body thread-scroll st-src-body" ref=${body} data-view=${advanced ? 'advanced' : 'main'}>
        ${advanced ? html`<${AdvancedView} library=${library} onRemove=${() => setDialog({ kind: 'remove-library' })} />` : html`<div class="new-content st-src">
          <h2 id="sources-title">${T.heading}</h2>
          <p data-lead>${hasCard ? T.cardLead : old ? T.old.lead : T.lead}</p>
          ${cardView.status === 'error' && !cv ? html`<div class="progress-alert" role="alert">${cardView.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}
            <${Btn} name="retry-sources" onClick=${() => cardView.reload()}>${ERRORS.retry}<//></div>` : null}
          ${old ? html`<${OldNotice} connection=${appState?.data?.activeConnection ?? null} hasKey=${appState?.data?.activeHasKey ?? null} onRecheck=${() => navigate('build', { from: libraryId, brief: cv?.brief ?? '' })} />
            <${OldBriefPart} brief=${cv?.brief ?? null} />
            ${view.status === 'error' && !view.data ? html`<p class="progress-alert" role="alert">${T.loadFailed}</p>` : null}
            ${view.data ? html`<${OldSourcesPart} view=${view.data} />` : null}` : null}
          ${hasCard ? html`<${CardPart} card=${cv.card} onChange=${() => navigate('build', { edit: libraryId })} />
            <${CardSuggestions} gaps=${home.data?.lastRound?.kind === 'update' ? gapsOf(home.data.lastRound) : []} onToCard=${t => navigate('build', { edit: libraryId, opener: t })} />
            <${CardSourcesPart} rows=${cv.rows ?? []} onAdded=${() => cardView.reload()} />` : null}
          <${RunPart} libraryId=${libraryId} onCard=${hasCard ? t => navigate('build', { edit: libraryId, opener: t }) : null} />
          ${hasCard ? html`<${VolumePart} libraryId=${libraryId} />` : null}
          <button type="button" class="document-link" data-action="go-advanced" onClick=${() => navigate('sources', { view: 'advanced' })}>
            <${TIcon} name="settings" /><span>${T.advancedLink}</span><${TIcon} name="arrow" />
          </button>
        </div>`}
      </div>
    ${dialog?.kind === 'remove-library' ? html`<${RemoveLibraryDialog} id=${libraryId} name=${library?.name ?? ''} path=${library?.path ?? ''} onClose=${close}
      onDone=${() => { close(); libraries?.reload?.(); appState.reload(); navigate('shelf') }} />` : null}
  <//>`
}
