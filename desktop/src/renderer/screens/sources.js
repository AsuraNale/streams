// 来源与要求 — redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-1 / R4b-2 / R4b-3; design 03-页面稿 P14, P15, P21 and
// 07-模板版 「来源与要求」「高级设置」「移除该库」; F45–F55, N01, N08; 维护者 11-11 第 8、10、14、17、18 题). The 来源与要求 tab of a library's
// page (screens/library-frame.js), on the template's parts (new-content, eyebrow, field, section-label, filters / filter,
// search-field, file-row, status-chip, document-link, after-card, phase-row, form-footer, limit-note, progress-alert, the dialog);
// the app's layer (styles/template-app.css part 9) only sizes and places them. Two views of the one route 'sources':
//
// 来源与要求 (params.view absent) — four parts, a screen and a bit:
//   要求       库名称 (setLibraryMeta: the registry and streams.json `name`, N08), 追踪要求 (a text box always open: setBrief), 严格程度
//              宽松 · 标准 · 严格 (getStrictness / setStrictness: the R4a core functions; two thresholds that are no level → 「自定义」,
//              shown and not pressable) with the line 「标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过」; one 保存 for the three — each that
//              changed is written and recorded as the user's (changes.jsonl by 'you': 高级设置's 变更记录).
//   来源 · n 个 a source is added in place, no dialog: typed into the search-field, Enter → guessSource (the kind, a name) → trySource
//              (one fetch, nothing written) → one row (screens/new-library.js SourceRow, the same component as 新建库's form):
//              「已识别为 RSS · 地址」, the state and the latest title or V3's what-to-do, then 添加 (addSource: only once the try reached
//              the source) · 取消. The table: 来源 (name, kind · address) · 状态与处理建议 (the five states in FETCH_STATES' words with the
//              count or the runs in a row, V3's FETCH_HINTS, 上次成功抓取) · 主题; each row's 「⋯」 folds 测试抓取 (trySource: a line under the
//              row, nothing written) · 暂停 / 恢复 (setSourcePaused) · 修改地址 (the template dialog: updateSource) · 删除 (the template
//              dialog: removeSource).
//   主题 · n 个 one row of tags 「名字 · n 篇」; a click opens one: its keywords 「（固定，系统不会自动修改）」, 编辑关键词 (updateTopic), 删除主题
//              (the template dialog: removeTopic); a new topic needs only its name (addTopic with no keywords; they can come later).
//   定时与上限 one line 「每天 [时刻] 自动运行 · 单次运行最多 [n] 次模型调用」 + 保存 (setLibrarySchedule, setRoundCap), and a line under
//              it: the next run, 需保持流息运行, a missed run made up once, the cap stops a run.
//   then 「高级设置：评分环节与提示词 · 变更记录 · 库文件夹 →」 (document-link). No 「谁定的」 beside any part (v2 package B's WhoLine is
//   gone: the history is 高级设置's 变更记录); no 「贴一个链接进待看」 (R2: 待看's own 添加链接).
//
// 高级设置 (params.view === 'advanced') — 「← 返回来源与要求」, the title, a line, three folds (the template's phase-row, open):
//   01 评分环节   screens/pipeline.js GatesSection (the seven nodes, 提示词, 通过阈值, 材料, 校验规则, 单条测试, the last run's numbers,
//                recent reasons) — the rules unchanged: fixed nodes cannot be removed, the scoring steps get no tool, a built-in rule
//                cannot be removed.
//   02 变更记录   getChangeLog: a table 时间 · 变更内容 · 操作来源 (手动修改 / 主 Agent 提议 · 已确认 / 初始设置), newest first; 首次设置's
//                record folded in as 初始设置 rows. Only what was recorded: an old library shows fewer rows, never made-up ones.
//   03 库文件夹   its path, 在资源管理器中显示 (revealLibrary), 重建索引 (rebuildIndex), 移除该库 (P21: the template dialog — 仅取消登记 …,
//                文件夹及其中的文件不会被删除, 如需恢复…, the path, 取消 · 移除 → removeLibrary(id): only the registration goes; not
//                one file of the folder is touched — then 库架).
// Words: texts/sources.js SOURCES / ADVANCED; FETCH_STATES / FETCH_HINTS / SOURCE_KINDS of texts/common.js.
// Test hooks: main[data-screen="sources"][data-state][data-view=main|advanced]; [data-part=brief|strictness|level-note|brief-note|
// sources|adding|add-error|topics|topic-detail|topic-error|run|run-note|changes|this-library|gates-fold|changes-fold|folder-fold];
// input[data-field=library-name|source|topic-name|keywords|schedule-on|schedule-time|cap], textarea[data-field="brief"];
// [data-level=<loose|standard|strict|custom>][aria-pressed]; [data-row=<name>][data-state][data-paused][data-consecutive] with
// [data-fetch-word], [data-hint=<code>], [data-tried=<name>][data-state], [data-action="row-more"] and, open, [data-part="row-menu"]
// with [data-action=try|pause|edit-address|remove]; [data-topic-row=<name>][data-kept][aria-pressed], [data-keywords];
// [data-change-row][data-kind][data-field][data-by]; [data-library-path]; dialog[data-dialog=edit-source|remove-source|remove-topic|
// remove-library]; [data-action=save-brief|add-source|cancel-add|edit-keywords|save-keywords|cancel-keywords|remove-topic|
// save-run|go-advanced|back-sources|reveal-library|rebuild|remove-library|confirm-edit-source|cancel-edit-source|confirm-remove|
// cancel-remove].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { ERRORS, FETCH_HINTS, FETCH_STATES, NEXT_WHEN, NODE_NAMES, PUNCT, SEP, SOURCE_KINDS, SOURCE_STATES, WHEN } from '../texts/common.js'
import { PIPELINE } from '../texts/pipeline.js'
import { ADVANCED as A, SOURCES as T } from '../texts/sources.js'
import { SETTINGS } from '../texts/settings.js'
import { LibraryFrame } from './library-frame.js'
import { GatesSection } from './pipeline.js'
import { SourceRow, freeName, whereOf } from './new-library.js'
import { Btn, TDialog } from './t-dialog.js'

const LEVELS = ['loose', 'standard', 'strict']
const BRIEF_MAX = 2000
const NAME_MAX = 100
// a try that reached the source (a gap or a refusal cannot be added: fix it first)
const ADDABLE = ['ok', 'empty', 'failed']
const FIVE = ['ok', 'empty', 'gap', 'failed', 'blocked']
const kindWord = k => (Object.hasOwn(SOURCE_KINDS, k) ? SOURCE_KINDS[k] : String(k ?? ''))
const stateWord = s => (Object.hasOwn(FETCH_STATES, s) ? FETCH_STATES[s] : Object.hasOwn(SOURCE_STATES, s) ? SOURCE_STATES[s] : String(s ?? ''))
const hintWords = h => (h && h !== 'none' && Object.hasOwn(FETCH_HINTS, h) ? FETCH_HINTS[h] : null)
const bare = u => String(u ?? '').replace(/^https?:\/\//i, '')
const keywordList = text => String(text ?? '').split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean)
const chars = s => [...String(s ?? '').trim()].length
/** The part of a source the configuration holds (what trySource takes), without the state the view adds. */
const CONFIG_KEYS = ['name', 'kind', 'url', 'query', 'topic', 'min_points', 'max_results', 'paused']
const configOf = s => Object.fromEntries(CONFIG_KEYS.filter(k => s[k] !== undefined && s[k] !== null).map(k => [k, s[k]]))

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

/** A name a source could have, from its address or words (the user changes it at will): letters, digits and dashes. */
export function suggestName(kind, target) {
  let base = String(target ?? '')
  if (kind === 'rss') { try { base = new URL(base).hostname.replace(/^www\./, '') } catch { /* not an address yet */ } }
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  return kind === 'rss' || !slug ? slug : `${kind}-${slug}`.slice(0, 40).replace(/-+$/, '')
}

// ---- 要求 ----------------------------------------------------------------------------------------------------------------

function BriefPart({ library, onChanged }) {
  const { libraries, appState } = useApp()
  const brief = useLoad(() => call('getBrief'), [])
  const strict = useLoad(() => call('getStrictness'), [])
  useEvent('library-changed', () => { brief.reload(); strict.reload() })
  const [name, setName] = useState(library?.name ?? '')
  const [text, setText] = useState('')
  const [level, setLevel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const savedBrief = brief.data ? brief.data.brief ?? '' : null
  const savedLevel = strict.data?.level ?? null
  useEffect(() => { setName(library?.name ?? '') }, [library?.name])
  useEffect(() => { if (savedBrief !== null) setText(savedBrief) }, [savedBrief])
  useEffect(() => { if (savedLevel) setLevel(savedLevel) }, [savedLevel])
  const levels = strict.data?.levels ?? null
  const shown = level ?? savedLevel
  const numbers = shown && shown !== 'custom' && levels ? levels[shown] : strict.data?.thresholds ?? null
  const save = async () => {
    const changes = {
      name: name.trim() !== (library?.name ?? ''),
      brief: savedBrief !== null && text.trim() !== savedBrief.trim(),
      level: Boolean(level) && level !== 'custom' && level !== savedLevel,
    }
    if (!changes.name && !changes.brief && !changes.level) { setNote({ kind: 'saved', text: T.brief.unchanged }); return }
    if (changes.name && (chars(name) < 1 || chars(name) > NAME_MAX)) { setNote({ kind: 'error', text: T.brief.nameBad }); return }
    if (changes.brief && (chars(text) < 1 || chars(text) > BRIEF_MAX)) { setNote({ kind: 'error', text: T.brief.bad }); return }
    setBusy(true)
    setNote(null)
    try {
      if (changes.name) await call('setLibraryMeta', library.libraryId, { name: name.trim() })
      if (changes.brief) await call('setBrief', text.trim())
      if (changes.level) await call('setStrictness', level)
      setNote({ kind: 'saved', text: T.brief.saved })
      brief.reload()
      strict.reload()
      if (changes.name) { libraries?.reload?.(); appState?.reload?.() }
      onChanged?.()
    } catch (err) {
      setNote({ kind: 'error', text: err?.code === 'bad_arguments' ? (changes.name ? T.brief.nameBad : T.brief.bad) : T.brief.failed })
    } finally { setBusy(false) }
  }
  const ready = Boolean(brief.data && strict.data)
  return html`<section class="st-src-part" data-part="brief" data-state=${ready ? 'ready' : brief.status === 'error' || strict.status === 'error' ? 'error' : 'loading'} aria-labelledby="src-brief-h">
    <div class="section-label"><span id="src-brief-h">${T.brief.heading}</span></div>
    <label class="field"><span>${T.brief.name}</span><input data-field="library-name" value=${name} maxlength=${NAME_MAX} disabled=${!library?.libraryId} onInput=${e => setName(e.currentTarget.value)} /></label>
    <label class="field"><span>${T.brief.heading}</span><textarea data-field="brief" rows="4" maxlength=${BRIEF_MAX} placeholder=${T.brief.placeholder} value=${text} disabled=${!brief.data} onInput=${e => setText(e.currentTarget.value)}></textarea></label>
    ${brief.status === 'error' && !brief.data ? html`<p class="progress-alert" role="alert">${T.loadFailed}</p>` : null}
    <div class="section-label"><span>${T.brief.strictness}</span>${numbers && shown ? html`<small class="muted" data-part="level-note" data-level=${shown}>${fmt(T.brief.levelNote, { level: T.brief.levels[shown], relevance: numbers.relevance, substance: numbers.substance })}</small>` : null}</div>
    <div class="filters st-src-levels" role="radiogroup" aria-label=${T.brief.strictness} data-part="strictness" data-level=${savedLevel ?? ''}>
      ${LEVELS.map(l => html`<button type="button" key=${l} role="radio" class=${`filter${l === shown ? ' active' : ''}`} data-level=${l} aria-checked=${String(l === shown)} aria-pressed=${String(l === shown)} disabled=${!ready} onClick=${() => setLevel(l)}>${T.brief.levels[l]}</button>`)}
      ${savedLevel === 'custom' ? html`<button type="button" role="radio" class=${`filter${shown === 'custom' ? ' active' : ''}`} data-level="custom" aria-checked=${String(shown === 'custom')} aria-pressed=${String(shown === 'custom')} onClick=${() => setLevel('custom')}>${T.brief.levels.custom}</button>` : null}
    </div>
    ${savedLevel === 'custom' ? html`<p class="limit-note" data-part="custom-hint">${T.brief.customHint}</p>` : null}
    <div class="form-footer st-src-footer">
      ${note ? html`<small role=${note.kind === 'saved' ? 'status' : 'alert'} data-part="brief-note" data-kind=${note.kind}>${note.text}</small>` : null}
      <${Btn} name="save-brief" kind="primary" disabled=${busy || !ready} onClick=${save}>${busy ? T.brief.saving : T.brief.save}<//>
    </div>
  </section>`
}

// ---- 来源 ----------------------------------------------------------------------------------------------------------------

function TriedLine({ name, tried }) {
  if (!tried) return null
  if (tried.status === 'trying') return html`<small class="st-src-tried" data-tried=${name} data-state="trying" role="status">${T.row.trying}</small>`
  if (tried.status === 'error') return html`<small class="st-src-tried" data-tried=${name} data-state="error" role="alert">${T.tried.failed}</small>`
  const r = tried.result ?? {}
  const latest = Array.isArray(r.sample) && r.sample[0] ? r.sample[0] : null
  const head = ['ok', 'empty'].includes(r.status) ? fmt(T.tried.ok, { state: stateWord(r.status), n: r.count ?? 0 }) : fmt(T.tried.message, { state: stateWord(r.status), message: hintWords(r.hint) ?? '' })
  const tail = latest ? (latest.date ? fmt(T.tried.latest, { title: latest.title, date: String(latest.date).slice(0, 10) }) : fmt(T.tried.latestNoDate, { title: latest.title })) : null
  return html`<small class="st-src-tried" data-tried=${name} data-state=${r.status ?? ''} role="status">${head}${tail ? html`<br />${tail}` : null}</small>`
}

/** One source of the table: 来源 · 状态与处理建议 · 主题, and its 「⋯」 with the four actions. */
function SourceLine({ s, tried, busy, open, onMore, onTry, onPause, onEdit, onRemove }) {
  const state = rowState(s)
  const address = s.kind === 'rss' ? bare(s.url) : s.query ?? ''
  const hint = state === 'paused' || state === 'never' ? null : hintWords(s.hint)
  const box = useRef(null)
  // a click outside the open menu, or Esc, folds it
  useEffect(() => {
    if (!open) return undefined
    const away = e => { if (box.current && !box.current.contains(e.target)) onMore(false) }
    const esc = e => { if (e.key === 'Escape') onMore(false) }
    document.addEventListener('mousedown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', esc, true) }
  }, [open])
  const item = (name, label, fn) => html`<span class="st-act" data-action=${name}><button type="button" role="menuitem" class="btn quiet" disabled=${busy} onClick=${() => { onMore(false); fn() }}>${label}</button></span>`
  return html`<div class="file-row st-src-row" data-row=${s.name} data-state=${state} data-paused=${String(Boolean(s.paused))} data-consecutive=${s.consecutive ?? ''}>
    <span class="file-icon"><${TIcon} name="book" /></span>
    <span class="file-text st-src-cell">${s.name}<small>${s.kind === 'hn' && s.min_points ? fmt(T.row.minPoints, { kind: kindWord(s.kind), address, n: s.min_points }) : fmt(T.row.address, { kind: kindWord(s.kind), address })}</small></span>
    <span class="st-src-cell st-src-state">
      <span class="status-chip" data-fetch-word>${FIVE.includes(state) && state !== 'ok' && state !== 'empty' ? html`<span class="dot"></span> ` : null}${stateLine(s)}</span>
      ${hint ? html`<small data-hint=${s.hint}>${hint}</small>` : null}
      ${s.lastOkAt ? html`<small data-part="last-ok">${fmt(T.row.lastOk, { when: whenText(s.lastOkAt, WHEN) ?? String(s.lastOkAt).slice(0, 10) })}</small>` : null}
      <${TriedLine} name=${s.name} tried=${tried} />
    </span>
    <span class="st-src-cell st-src-topic">${s.topic ? html`<span class="filter">${s.topic}</span>` : html`<small>${T.row.noTopic}</small>`}</span>
    <span class="st-src-more" ref=${box}>
      <span class="st-act" data-action="row-more"><button type="button" class="icon-btn" aria-haspopup="menu" aria-expanded=${String(open)} aria-label=${fmt(T.table.more, { name: s.name })} title=${fmt(T.table.more, { name: s.name })} onClick=${() => onMore(!open)}>⋯</button></span>
      ${open ? html`<div class="st-src-menu" role="menu" data-part="row-menu">
        ${item('try', T.row.try, onTry)}
        ${item('pause', s.paused ? T.row.resume : T.row.pause, onPause)}
        ${item('edit-address', s.kind === 'rss' ? T.row.editAddress : T.row.editQuery, onEdit)}
        ${item('remove', T.row.remove, onRemove)}
      </div>` : null}
    </span>
  </div>`
}

function SourcesPart({ view, busy, act, onDialog }) {
  const sources = Array.isArray(view?.sources) ? view.sources : []
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(null)
  const [addError, setAddError] = useState(null)
  const [tried, setTried] = useState({})
  const [menu, setMenu] = useState(null)
  const guess = async () => {
    const text = input.trim()
    if (!text) return
    setAddError(null)
    let g
    try { g = await call('guessSource', text) } catch { setAddError(T.add.badInput); return }
    if (sources.some(s => s.kind === g.kind && whereOf(s) === whereOf(g))) { setAddError(T.add.duplicate); return }
    const source = { ...g, name: freeName(typeof g.name === 'string' && g.name ? g.name : suggestName(g.kind, whereOf(g)), sources) }
    setAdding({ source, from: 'typed', state: 'trying', result: null })
    let next
    try { next = { state: 'done', result: await call('trySource', source) } } catch { next = { state: 'failed', result: null } }
    setAdding(a => (a && a.source.name === source.name ? { ...a, ...next } : a))
  }
  const reached = adding?.state === 'done' && ADDABLE.includes(adding.result?.status)
  const add = async () => {
    if (!adding || !reached) return
    const ok = await act(() => call('addSource', adding.source), err => setAddError(err?.code === 'bad_arguments' ? T.add.badSource : T.failed))
    if (ok) { setAdding(null); setInput('') }
  }
  const tryOne = async s => {
    setTried(m => ({ ...m, [s.name]: { status: 'trying' } }))
    try { const r = await call('trySource', configOf(s)); setTried(m => ({ ...m, [s.name]: { status: 'done', result: r } })) } catch { setTried(m => ({ ...m, [s.name]: { status: 'error' } })) }
  }
  return html`<section class="st-src-part" data-part="sources" aria-labelledby="src-sources-h">
    <div class="section-label"><span id="src-sources-h">${fmt(T.sourcesHeading, { n: sources.length })}</span></div>
    <label class="search-field"><${TIcon} name="plus" /><input data-field="source" aria-label=${T.add.label} placeholder=${T.add.placeholder} value=${input} disabled=${busy}
      onInput=${e => { setInput(e.currentTarget.value); setAddError(null) }} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void guess() } }} /></label>
    ${addError ? html`<p class="limit-note" role="alert" data-part="add-error">${addError}</p>` : null}
    ${adding ? html`<div class="st-src-adding">
      <${SourceRow} row=${adding} busy=${busy} part="adding" lead=${fmt(T.add.recognized, { kind: kindWord(adding.source.kind) })}
        actions=${html`<${Btn} name="add-source" kind="primary" disabled=${busy || !reached} onClick=${add}>${T.add.confirm}<//><${Btn} name="cancel-add" kind="quiet" disabled=${busy} onClick=${() => { setAdding(null); setAddError(null) }}>${T.add.cancel}<//>`} />
      ${adding.state === 'done' && !reached ? html`<p class="limit-note" data-part="cannot-add">${T.add.cannotAdd}</p>` : null}
    </div>` : null}
    ${sources.length ? html`<div class="st-src-table" role="table" aria-labelledby="src-sources-h">
      <div class="st-src-row st-src-head" role="row"><span></span><span>${T.table.source}</span><span>${T.table.state}</span><span>${T.table.topic}</span><span></span></div>
      ${sources.map(s => html`<${SourceLine} key=${s.name} s=${s} tried=${tried[s.name]} busy=${busy} open=${menu === s.name} onMore=${o => setMenu(o ? s.name : null)}
        onTry=${() => tryOne(s)}
        onPause=${() => act(() => call('setSourcePaused', s.name, !s.paused))}
        onEdit=${() => onDialog({ kind: 'edit-source', source: s })}
        onRemove=${() => onDialog({ kind: 'remove-source', source: s })} />`)}
    </div>` : html`<p class="limit-note" data-part="sources-none">${T.none}</p>`}
  </section>`
}

// ---- 主题 ----------------------------------------------------------------------------------------------------------------

function TopicsPart({ view, busy, reload, onDialog }) {
  const topics = Array.isArray(view?.topics) ? view.topics : []
  const [open, setOpen] = useState(null)
  const [editing, setEditing] = useState(false)
  const [words, setWords] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const t = topics.find(x => x.name === open) ?? null
  const kept = x => x.kept ?? x.keptCount ?? x.count ?? 0
  const add = async () => {
    const n = name.trim()
    if (!n) return
    setError(null)
    try { await call('addTopic', { name: n, keywords: [] }); setName(''); reload() } catch { setError(T.topics.bad) }
  }
  const saveWords = async () => {
    setError(null)
    try { await call('updateTopic', t.name, { keywords: keywordList(words) }); setEditing(false); reload() } catch { setError(T.topics.bad) }
  }
  const keywords = Array.isArray(t?.keywords) ? t.keywords : []
  return html`<section class="st-src-part" data-part="topics" aria-labelledby="src-topics-h">
    <div class="section-label"><span id="src-topics-h">${fmt(T.topics.heading, { n: topics.length })}</span></div>
    <div class="filters st-src-topics">
      ${topics.map(x => html`<button type="button" key=${x.name} class=${`filter${x.name === open ? ' active' : ''}`} data-topic-row=${x.name} data-kept=${kept(x)} aria-pressed=${String(x.name === open)}
        onClick=${() => { setOpen(o => (o === x.name ? null : x.name)); setEditing(false); setError(null) }}>${fmt(T.topics.chip, { name: x.name, n: kept(x) })}</button>`)}
      <input class="st-nl-topic-input" data-field="topic-name" aria-label=${T.topics.addLabel} placeholder=${T.topics.addPlaceholder} value=${name} maxlength="100" disabled=${busy}
        onInput=${e => setName(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
    </div>
    ${topics.length ? null : html`<p class="limit-note">${T.topics.none}</p>`}
    ${t ? html`<div class="st-src-topic-detail" data-part="topic-detail" data-topic=${t.name}>
      <span class="st-src-kw-label">${fmt(T.topics.keywordsOf, { name: t.name })}</span>
      ${editing ? html`<label class="search-field st-src-kw-edit"><input data-field="keywords" aria-label=${fmt(T.topics.keywordsLabel, { name: t.name })} placeholder=${T.topics.keywordsHint} value=${words}
          onInput=${e => setWords(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void saveWords() } }} /></label>
        <${Btn} name="save-keywords" kind="primary" disabled=${busy} onClick=${saveWords}>${T.topics.save}<//>
        <${Btn} name="cancel-keywords" kind="quiet" onClick=${() => setEditing(false)}>${T.topics.cancel}<//>`
      : html`<span class="filters st-src-kws" data-keywords=${keywords.join('、')}>${keywords.length ? keywords.map(k => html`<span key=${k} class="filter">${k}</span>`) : html`<small class="muted">${T.topics.noKeywords}</small>`}</span>
        <${Btn} name="edit-keywords" disabled=${busy} onClick=${() => { setWords(keywords.join(PUNCT.comma)); setEditing(true) }}>${T.topics.editKeywords}<//>
        <${Btn} name="remove-topic" kind="quiet" disabled=${busy} onClick=${() => onDialog({ kind: 'remove-topic', topic: t })}>${T.topics.remove}<//>`}
    </div>` : null}
    ${error ? html`<p class="limit-note" role="alert" data-part="topic-error">${error}</p>` : null}
  </section>`
}

// ---- 定时与上限 ----------------------------------------------------------------------------------------------------------

function RunPart({ libraryId }) {
  const sched = useLoad(() => (libraryId ? call('getLibrarySchedule', libraryId) : null), [libraryId])
  const run = useLoad(() => call('getPipelineSettings'), [])
  useEvent('settings-changed', p => { if (!p || p.libraryId === undefined || p.libraryId === libraryId) sched.reload() })
  useEvent('library-changed', () => run.reload())
  const [on, setOn] = useState(true)
  const [time, setTime] = useState('')
  const [cap, setCap] = useState('')
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const d = sched.data
  // what the user typed and has not saved yet is theirs: a re-read that lands meanwhile (settings-changed, library-changed — a
  // round ending, another window) does not put the saved values back over it; 保存 (or another library) ends the draft
  const draft = useRef(false)
  useEffect(() => { draft.current = false }, [libraryId])
  useEffect(() => { if (d && !draft.current) { setOn(d.enabled); setTime(d.time) } }, [d?.enabled, d?.time])
  useEffect(() => { if (run.data && !draft.current) setCap(String(run.data.cap ?? '')) }, [run.data?.cap])
  const edit = set => v => { draft.current = true; set(v) }
  const save = async () => {
    const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    const n = Number(cap)
    const capOk = /^\d+$/.test(cap.trim()) && Number.isInteger(n) && n > 0
    if (!timeOk) { setNote({ kind: 'bad', text: T.run.timeBad }); return }
    if (!capOk) { setNote({ kind: 'bad', text: T.run.capBad }); return }
    setBusy(true)
    setNote(null)
    try {
      if (d && (on !== d.enabled || time !== d.time)) { const r = await call('setLibrarySchedule', libraryId, { enabled: on, time }); sched.mutate(() => r) }
      if (run.data && n !== run.data.cap) { await call('setRoundCap', n); run.reload() }
      draft.current = false
      setNote({ kind: 'saved', text: T.run.saved })
    } catch (err) {
      setNote({ kind: 'bad', text: err?.code === 'bad_arguments' ? T.run.timeBad : T.failed })
    } finally { setBusy(false) }
  }
  const ready = Boolean(d && run.data)
  return html`<section class="st-src-part" data-part="run" aria-labelledby="src-run-h">
    <div class="section-label"><span id="src-run-h">${T.run.heading}</span></div>
    ${sched.status === 'error' && !d ? html`<p class="progress-alert" role="alert">${T.run.failed}</p>` : null}
    <div class="st-nl-schedule st-src-run" data-schedule=${d ? (d.enabled ? 'on' : 'off') : 'unknown'}>
      <label class="st-nl-check"><input type="checkbox" data-field="schedule-on" checked=${on} disabled=${!ready || busy} onChange=${e => edit(setOn)(e.currentTarget.checked)} /> ${T.run.daily}</label>
      <span class="field st-nl-small"><input data-field="schedule-time" aria-label=${T.run.timeLabel} value=${time} maxlength="5" disabled=${!ready || busy || !on} onInput=${e => edit(setTime)(e.currentTarget.value.trim())} /></span>
      <span>${T.run.at}</span>
      <span class="field st-nl-small"><input type="number" min="1" max="10000" data-field="cap" aria-label=${T.run.capLabel} value=${cap} disabled=${!ready || busy} onInput=${e => edit(setCap)(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} /></span>
      <span>${T.run.capAfter}</span>
      <span class="st-src-run-save"><${Btn} name="save-run" disabled=${!ready || busy} onClick=${save}>${T.run.save}<//></span>
    </div>
    ${note ? html`<p class=${note.kind === 'saved' ? 'limit-note' : 'progress-alert'} role=${note.kind === 'saved' ? 'status' : 'alert'} data-part="run-note" data-kind=${note.kind}>${note.text}</p>` : null}
    <p class="limit-note" data-next-run=${d?.nextRunAt ?? ''}>${d ? (d.nextRunAt ? fmt(T.run.next, { when: nextText(d.nextRunAt, NEXT_WHEN) ?? d.nextRunAt }) : T.run.off) : ''}${T.run.rule}</p>
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
const schedWords = v => (v && v.enabled ? fmt(A.log.fields.scheduleOn, { time: v.time }) : A.log.fields.scheduleOff)
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
    case 'cap': return b !== null && b !== undefined ? fmt(F.cap, { before: b, after: a }) : fmt(F.capNew, { after: a })
    case 'schedule': return b ? fmt(F.schedule, { before: schedWords(b), after: schedWords(a) }) : fmt(F.scheduleNew, { after: schedWords(a) })
    case 'thresholds': return b ? fmt(F.thresholds, { r0: b.relevance, r1: a?.relevance, s0: b.substance, s1: a?.substance }) : fmt(F.thresholdsNew, { r1: a?.relevance, s1: a?.substance })
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
    case 'prompts': {
      const before = new Map((Array.isArray(b) ? b : []).map(x => [x?.id, x]))
      const changed = (Array.isArray(a) ? a : []).filter(x => JSON.stringify(before.get(x?.id)) !== JSON.stringify(x)).map(x => x.id)
      const pretty = changed.map(id => (Object.hasOwn(PIPELINE_NAMES, id) ? PIPELINE_NAMES[id] : id))
      return fmt(F.prompts, { names: names(pretty.length ? pretty : [A.log.fieldNames.prompts]) })
    }
    default: return fmt(F.other, { field: Object.hasOwn(A.log.fieldNames, row.field) ? A.log.fieldNames[row.field] : String(row.field ?? '') })
  }
}
// the model steps by name in 变更记录 (the same names 评分环节 shows)
const PIPELINE_NAMES = Object.freeze({ ...PIPELINE.names, ...NODE_NAMES })

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
      <${Btn} name="rebuild" disabled=${busy || !library} onClick=${rebuild}>${busy ? L.rebuilding : L.rebuild}<//>
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
    <span class="eyebrow">${A.eyebrow}</span>
    <h2 id="sources-title">${A.heading}</h2>
    <p>${A.lead}</p>
    <${Fold} index="01" part="gates-fold" title=${A.gates} small=${A.gatesHint}><${GatesSection} /><//>
    <${Fold} index="02" part="changes-fold" title=${A.changes} small=${A.changesHint}><${ChangeLog} /><//>
    <${Fold} index="03" part="folder-fold" title=${A.folder} small=${html`<span class="st-path" data-library-path=${library?.path ?? ''}>${library?.path ?? ''}</span>`}><${FolderPart} library=${library} onRemove=${onRemove} /><//>
  </div>`
}

// ---- dialogs -------------------------------------------------------------------------------------------------------------

function EditSourceDialog({ source, onClose, onSaved }) {
  const rss = source.kind === 'rss'
  const [value, setValue] = useState(rss ? source.url ?? '' : source.query ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const save = async () => {
    if (!value.trim()) { setError(T.editDialog.bad); return }
    setBusy(true)
    setError(null)
    try { await call('updateSource', source.name, rss ? { url: value.trim() } : { query: value.trim() }); onSaved() } catch { setError(T.editDialog.bad); setBusy(false) }
  }
  return html`<${TDialog} name="edit-source" title=${fmt(T.editDialog.title, { name: source.name })} closeLabel=${T.editDialog.close} onClose=${onClose}
    footer=${html`<${Btn} name="cancel-edit-source" kind="quiet" disabled=${busy} onClick=${onClose}>${T.editDialog.cancel}<//><${Btn} name="confirm-edit-source" kind="primary" disabled=${busy} onClick=${save}>${T.editDialog.confirm}<//>`}>
    <label class="field"><span>${rss ? T.editDialog.urlLabel : T.editDialog.queryLabel}</span>
      <input data-field="address" value=${value} data-dialog-initial onInput=${e => setValue(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} /></label>
    ${error ? html`<p class="progress-alert" role="alert">${error}</p>` : null}
  <//>`
}

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

// ---- the screen ----------------------------------------------------------------------------------------------------------

// ---- 1.1 W6a: a library with a card (A5), and one built by the last version (A6) ----------------------------------------------------
const pad = n => String(n).padStart(2, '0')
const LINES = ['purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard']
const listOf = v => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() !== '' ? [v] : [])

/** The card's definition (a paragraph and its seven lines), and its other parts folded under 「建库卡全文」. */
function CardPart({ card, history, onChange }) {
  const C = T.card
  const [open, setOpen] = useState(false)
  const d = card.definition ?? {}
  return html`<section class="st-src-part" data-part="card" aria-labelledby="src-card-h">
    <div class="section-label"><span id="src-card-h">${C.heading}</span>${history ? html`<small class="muted" data-part="card-version">${history}</small>` : null}</div>
    <p class="intro-copy" data-part="card-summary">${d.summary ?? ''}</p>
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
        <span class="st-src-cell st-src-state"><span class="status-chip">${S.states[r.state] ?? r.state}</span>${r.unreadable ? html`<small>${S.unreadable}${r.reason ? `${SEP}${r.reason}` : ''}</small>` : null}</span>
        <span class="st-src-cell"><span class="status-chip" data-original-word=${r.original}>${S.originals[r.original] ?? r.original}</span></span>
      </div>`)}
    </div>
  </section>`
}

/** A library with no card: built by the last version — what still works, and the way on (A6). */
function OldNotice({ connection, onRecheck }) {
  const O = T.old
  const can = connection === 'claude-code'
  return html`<section class="st-src-part progress-alert st-src-old" data-part="old-library" data-can=${String(can)} role="note">
    <div class="section-label"><span>${O.heading}</span></div>
    <p class="limit-note">${O.text}</p>
    <div class="row"><${Btn} name="recheck-sources" kind="primary" disabled=${!can} onClick=${onRecheck}>${O.action}<//>
      ${can ? null : html`<small class="muted" data-part="recheck-why">${O.needsClaude}</small>`}</div>
  </section>`
}

export function SourcesScreen({ params = {} }) {
  const { appState, navigate, libraries } = useApp()
  const library = appState?.data?.library ?? null
  const libraryId = library?.libraryId ?? null
  const advanced = params.view === 'advanced'
  const view = useLoad(() => call('getSources'), [])
  // 1.1 W6a: the library's card and its sources (A5), or the notice of a library built by the last version (A6)
  const cardView = useLoad(() => call('getCardView'), [libraryId])
  useEvent('library-changed', () => { view.reload(); cardView.reload() })
  const cv = cardView.data
  const hasCard = Boolean(cv?.card)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null)
  const d = view.data
  /** A change through the bridge: the page reads the sources again after it, whatever it answered. */
  const act = async (fn, onError) => {
    setBusy(true)
    setError(null)
    try { await fn(); return true } catch (err) { if (onError) onError(err); else setError(T.failed); return false } finally { setBusy(false); view.reload() }
  }
  const close = () => setDialog(null)
  // redesign R5b (R5b-1): a 系统检测's 修改地址 opens this page with params.editAddress (the source's name) — that row's 修改地址
  // dialog opens once the sources are read (the change itself is updateSource's, as from the row's own menu). Precheck fix 2:
  // opened, the parameter leaves the route (the same page, the dialog stays) — the route this library remembers (app.js) has no
  // editAddress, so coming back to this library later does not open the dialog again
  const asked = useRef(null)
  useEffect(() => {
    const name = typeof params.editAddress === 'string' ? params.editAddress : null
    if (!name || asked.current === name || !d) return
    asked.current = name
    const source = (Array.isArray(d.sources) ? d.sources : []).find(s => s.name === name)
    if (source) setDialog({ kind: 'edit-source', source })
    const { editAddress: _done, ...rest } = params
    navigate('sources', rest)
  }, [d, params.editAddress])
  const state = advanced ? (library ? 'ready' : appState?.status ?? 'loading') : d ? 'ready' : view.status
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
          <span class="eyebrow">${T.eyebrow}</span>
          <h2 id="sources-title">${T.heading}</h2>
          <p data-lead>${hasCard ? T.cardLead : cv?.old ? T.old.lead : T.lead}</p>
          ${view.status === 'error' && !d ? html`<div class="progress-alert" role="alert">${view.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}
            <${Btn} name="retry-sources" onClick=${() => view.reload()}>${ERRORS.retry}<//></div>` : null}
          ${error ? html`<p class="progress-alert" role="alert">${error}</p>` : null}
          ${cv?.old ? html`<${OldNotice} connection=${appState?.data?.activeConnection ?? null} onRecheck=${() => navigate('build', { from: libraryId, brief: cv?.brief ?? '' })} />` : null}
          ${hasCard ? html`<${CardPart} card=${cv.card} onChange=${() => navigate('build', { edit: libraryId })} />
            <${CardSourcesPart} rows=${cv.rows ?? []} onAdded=${() => cardView.reload()} />` : html`<${BriefPart} library=${library} />
          ${d ? html`<${SourcesPart} view=${d} busy=${busy} act=${act} onDialog=${setDialog} />
            <${TopicsPart} view=${d} busy=${busy} reload=${() => view.reload()} onDialog=${setDialog} />` : null}`}
          <${RunPart} libraryId=${libraryId} />
          <button type="button" class="document-link" data-action="go-advanced" onClick=${() => navigate('sources', { view: 'advanced' })}>
            <${TIcon} name="settings" /><span>${T.advancedLink}</span><${TIcon} name="arrow" />
          </button>
        </div>`}
      </div>
    ${dialog?.kind === 'edit-source' ? html`<${EditSourceDialog} source=${dialog.source} onClose=${close} onSaved=${() => { close(); view.reload() }} />` : null}
    ${dialog?.kind === 'remove-source' ? html`<${ConfirmDialog} name="remove-source" title=${fmt(T.removeDialog.title, { name: dialog.source.name })} closeLabel=${T.editDialog.close}
      confirm=${T.removeDialog.confirm} cancel=${T.removeDialog.cancel} onClose=${close}
      onConfirm=${async () => { await call('removeSource', dialog.source.name); close(); view.reload() }}><p>${T.removeDialog.text}</p><//>` : null}
    ${dialog?.kind === 'remove-topic' ? html`<${ConfirmDialog} name="remove-topic" title=${fmt(T.removeTopicDialog.title, { name: dialog.topic.name })} closeLabel=${T.editDialog.close}
      confirm=${T.removeTopicDialog.confirm} cancel=${T.removeTopicDialog.cancel} onClose=${close}
      onConfirm=${async () => { await call('removeTopic', dialog.topic.name); close(); view.reload() }}><p>${T.removeTopicDialog.text}</p><//>` : null}
    ${dialog?.kind === 'remove-library' ? html`<${ConfirmDialog} name="remove-library" title=${fmt(A.removeDialog.title, { name: library?.name ?? '' })} closeLabel=${A.removeDialog.close}
      confirm=${A.removeDialog.confirm} cancel=${A.removeDialog.cancel} onClose=${close}
      onConfirm=${async () => { await call('removeLibrary', libraryId); close(); libraries?.reload?.(); appState.reload(); navigate('shelf') }}>
      <p data-part="remove-text">${A.removeDialog.text}</p>
      <p><b data-part="remove-kept">${A.removeDialog.kept}</b>${A.removeDialog.restore}</p>
      <p class="st-path" data-part="remove-path">${library?.path ?? ''}</p>
    <//>` : null}
  <//>`
}
