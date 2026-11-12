// 新建库 (redesign R4a, contract R4a-3 / R4a-4; design 03-页面稿 P04, 07-模板版 新建库; F56, F57, F45–F49, N01; 维护者 11-11 第 5 题「一页
// 表单，留起步包和只建不跑」, 第 8 题): the route 'new-library' (app.js newLibrary(): the sidebar's 「新建库」, the shelf, 首次打开's
// 「手动创建」); params.back = the screen 「取消」 goes back to. One page in the usual frame (the sidebar and the right panel stay;
// its 详情 is 「流息怎样工作」) — v1.0's four-step wizard and its starter-pack step are gone.
// The work-header (新建库 · a line · the current connection's chip), then a new-content form, top to bottom:
//   the switch 由主 Agent 生成 · 手动填写 (filters; the first goes to 主 Agent) · 库名称 · 追踪要求 (required: the two create
//   buttons stay off while it is empty, and the main process refuses an empty one too) · 严格程度 three filters (宽松（收录更多）·
//   标准 · 严格（仅收录高度相关）, 标准 chosen; the label's note says the two numbers of the chosen one) · 来源: one search-field —
//   Enter: guessSource (what kind it is, its name) then trySource (one fetch, nothing written) and one row (file-row): the name,
//   「RSS · address」, the state (texts/common.js FETCH_STATES; 正常 with how many items) and under it the latest title or what to
//   do (FETCH_HINTS: the V3 sentence, never the fetcher's own message), 移除 · then 「或 使用预设来源包：…（n 个主题 · n 个来源），添加
//   后可逐个移除」 (document-link; the packs are the core's starter packs: its sources become rows not fetched yet, each with
//   测试抓取 and 移除, its topics become topics) · 主题（选填） (filters with ✕ + an input, Enter adds) · 存储位置 (the folder 创建
//   would use, newLibraryFolder: <root>\<name>, or the one 更改… chose with chooseLibraryFolder; its state in a line — a folder of
//   .md files is opened as a library, nothing of the user's moved or changed, F57) · 定时: 每天 [time] 自动运行 · 单次运行最多 [n] 次
//   模型调用 (the app's schedule and the pipeline's cap to start with: the same a main agent's card gets, O15).
// The form-footer: 取消 · 「创建后立即开始首次运行，预计 n–m 次模型调用」 (estimateNewLibrary from what the rows found) · 仅创建 ·
// 创建并运行 — createNewLibrary(form, run). 创建并运行 queues the first run (建库后的第一轮, the queue's rules); 仅创建 queues nothing.
// Either way the new library is the current one and the app goes to its 待看.
// Words: texts/first-run.js NEW_LIBRARY (and HOW_IT_WORKS); FETCH_STATES / FETCH_HINTS / SOURCE_KINDS of texts/common.js.
// Test hooks: main[data-screen="new-library"][data-state]; [data-field=name|brief|source|topic|time|cap|daily];
// [data-part=brief-required|strictness|level-note|sources|source-error|pack-line|topics|location|folder-state|estimate|create-error];
// [data-level=<id>][aria-pressed]; [data-source=<name>][data-fetch-state=<state>|trying|untried|failed][data-from=typed|pack];
// [data-topic=<name>]; [data-action=mode-agent|add-pack|remove-source|try-source|remove-topic|change-folder|cancel-new|
// create-only|create-run].
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { TIcon } from '../lib/template-icons.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, FETCH_HINTS, FETCH_STATES, SOURCE_KINDS } from '../texts/common.js'
import { FIRST_RUN, NEW_LIBRARY as T } from '../texts/first-run.js'
import { RightPanel } from './right-panel.js'
import { HowItWorks } from './first-run.js'

const LEVELS = ['loose', 'standard', 'strict']
// what to do about a state that is not 正常 (V3's sentence; 没新内容's is 「不需要你做什么。」)
const hintWords = h => (h && Object.hasOwn(FETCH_HINTS, h) ? FETCH_HINTS[h] : null)
const whereOf = s => s.url ?? s.query ?? ''

/** A name for a typed source that no row has yet (the guess's, then -2, -3 …). */
function freeName(base, rows) {
  const taken = new Set(rows.map(r => r.source.name))
  if (!taken.has(base)) return base
  const stem = base.slice(0, 36)
  for (let i = 2; i < 1000; i++) if (!taken.has(`${stem}-${i}`)) return `${stem}-${i}`
  return base
}

/** One source row: its name, kind and address, the state of its test fetch and what to do, 移除. */
function SourceRow({ row, busy, onRemove, onTry }) {
  const s = row.source
  const r = row.result
  const kind = Object.hasOwn(SOURCE_KINDS, s.kind) ? SOURCE_KINDS[s.kind] : s.kind
  let chip
  let sub = null
  if (row.state === 'trying') chip = html`<span class="status-chip">${T.trying}</span>`
  else if (row.state === 'untried') chip = html`<span class="status-chip">${T.untried}</span>`
  else if (row.state === 'failed') { chip = html`<span class="status-chip"><span class="dot"></span> ${T.untried}</span>`; sub = T.tryFailed }
  else {
    const word = FETCH_STATES[r.status] ?? r.status
    chip = html`<span class="status-chip">${r.status === 'ok' ? null : html`<span class="dot"></span> `}${r.status === 'ok' ? fmt(T.okCount, { state: word, n: r.count ?? 0 }) : word}</span>`
    sub = r.status === 'ok' ? (r.sample?.[0]?.title ? fmt(T.latest, { title: r.sample[0].title }) : null) : hintWords(r.hint)
  }
  const state = row.state === 'done' ? r.status : row.state
  return html`<div class="file-row st-nl-source" data-source=${s.name} data-fetch-state=${state} data-from=${row.from}>
    <span class="file-icon"><${TIcon} name="book" /></span>
    <span class="file-text">${s.name}<small>${fmt(T.sourceLine, { kind, where: whereOf(s) })}${sub ? html`<br /><span data-part="source-hint">${sub}</span>` : null}</small></span>
    ${chip}
    ${row.state === 'untried' || row.state === 'failed' ? html`<span class="st-act" data-action="try-source"><button type="button" class="btn quiet" disabled=${busy} onClick=${onTry}>${T.tryOne}</button></span>` : null}
    <span class="st-act" data-action="remove-source"><button type="button" class="btn quiet" aria-label=${fmt(T.removeLabel, { name: s.name })} onClick=${onRemove}>${T.remove}</button></span>
  </div>`
}

/**
 * 新建库. `onDone(screen)` (app.js, optional) when the library is made; else the page goes to its 待看 itself.
 * @param {{params?: {back?: string}, onDone?: (screen: string) => void}} p
 */
export function NewLibraryScreen({ params = {}, onDone }) {
  const { navigate, appState, libraries } = useApp()
  const [defaults, setDefaults] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [level, setLevel] = useState('standard')
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState(null)
  const [rows, setRows] = useState([])
  const [packId, setPackId] = useState(null)
  const [topics, setTopics] = useState([])
  const [topicInput, setTopicInput] = useState('')
  const [daily, setDaily] = useState(true)
  const [time, setTime] = useState('08:30')
  const [cap, setCap] = useState('120')
  const [folder, setFolder] = useState(null)
  const [estimate, setEstimate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    call('getNewLibraryDefaults').then(d => {
      if (!live) return
      setDefaults(d)
      setLevel(d.strictness)
      setDaily(d.schedule.enabled)
      setTime(d.schedule.time)
      setCap(String(d.cap))
    }, () => { if (live) setLoadFailed(true) })
    return () => { live = false }
  }, [])
  // the folder 创建 would use follows the name (unless 更改… chose one)
  useEffect(() => {
    if (!defaults) return undefined
    const t = setTimeout(() => { call('newLibraryFolder', name.trim()).then(setFolder, () => setFolder(null)) }, 150)
    return () => clearTimeout(t)
  }, [defaults, name])
  const capNumber = /^\d{1,5}$/.test(cap.trim()) ? Number(cap.trim()) : null
  const items = rows.reduce((n, r) => n + (r.state === 'done' && r.result?.status === 'ok' ? r.result.count ?? 0 : 0), 0)
  useEffect(() => {
    if (!defaults || !capNumber) return
    call('estimateNewLibrary', items, capNumber).then(setEstimate, () => setEstimate(null))
  }, [defaults, items, capNumber])

  const tryRow = async source => {
    setRows(list => list.map(r => (r.source.name === source.name ? { ...r, state: 'trying' } : r)))
    let next
    try { next = { state: 'done', result: await call('trySource', source) } } catch { next = { state: 'failed', result: null } }
    setRows(list => list.map(r => (r.source.name === source.name ? { ...r, ...next } : r)))
  }
  const addTyped = async () => {
    const text = input.trim()
    if (!text) return
    setInputError(null)
    let guess
    try { guess = await call('guessSource', text) } catch { setInputError(T.badInput); return }
    if (rows.some(r => r.source.kind === guess.kind && whereOf(r.source) === whereOf(guess))) { setInputError(T.duplicate); return }
    const source = { ...guess, name: freeName(guess.name, rows) }
    setRows(list => [...list, { source, from: 'typed', state: 'trying', result: null }])
    setInput('')
    await tryRow(source)
  }
  const pack = defaults?.packs?.[0] ?? null
  const addPack = () => {
    if (!pack) return
    setPackId(pack.id)
    setRows(list => [...list, ...pack.sources.filter(s => !list.some(r => r.source.name === s.name)).map(s => ({ source: { ...s }, from: 'pack', state: 'untried', result: null }))])
    setTopics(list => [...list, ...pack.topics.filter(t => !list.includes(t))])
  }
  const removeRow = n => setRows(list => list.filter(r => r.source.name !== n))
  const addTopic = () => {
    const t = topicInput.trim()
    if (!t || t.length > 100) return
    if (!topics.some(x => x.toLowerCase() === t.toLowerCase())) setTopics(list => [...list, t])
    setTopicInput('')
  }
  // a topic a source names cannot go while that source is in the list (the core refuses a source of an unknown topic)
  const topicInUse = t => rows.some(r => r.source.topic === t)
  const changeFolder = async () => {
    try {
      const r = await call('chooseLibraryFolder')
      if (r) setFolder(await call('newLibraryFolder', name.trim()))
    } catch { setError(T.folderFailed) }
  }
  const cancel = () => navigate(typeof params.back === 'string' && params.back !== 'new-library' ? params.back : 'shelf')
  const finish = () => {
    appState?.reload?.()
    libraries?.reload?.()
    if (typeof onDone === 'function') onDone('inbox')
    else navigate('inbox')
  }

  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const briefEmpty = brief.trim() === ''
  const nameEmpty = name.trim() === ''
  const folderOk = folder && folder.state !== 'other'
  const ready = Boolean(defaults) && !busy && !briefEmpty && !nameEmpty && Boolean(capNumber) && Boolean(folderOk) && !rows.some(r => r.state === 'trying') && timeOk
  const create = async run => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await call('createNewLibrary', {
        name: name.trim(), brief: brief.trim(), strictness: level, topics, sources: rows.map(r => r.source), packId,
        schedule: { enabled: daily, time }, cap: capNumber, run,
      })
      finish()
    } catch (err) {
      setError(err?.code === 'open_failed' ? T.folderFailed : T.failed)
      setBusy(false)
    }
  }

  const levels = defaults?.levels ?? null
  const kind = appState?.data?.activeConnection ?? null
  const chip = html`<span class="status-chip" data-part="head-connection">${kind && Object.hasOwn(CONNECTIONS.names, kind) ? fmt(FIRST_RUN.headChip, { name: CONNECTIONS.names[kind] }) : FIRST_RUN.headChipNone}</span>`
  const untried = rows.some(r => r.state === 'untried' || r.state === 'failed')
  const state = defaults ? 'ready' : loadFailed ? 'error' : 'loading'
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="new-library" />`} panel=${html`<${RightPanel} detail=${html`<${HowItWorks} which="new" />`} />`}>
    <${Main} screen="new-library" state=${state} labelledby="nl-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h1" titleId="nl-title" actions=${chip} />
      <div class="center">
        <div class="thread-scroll st-first-body">
          <form class="new-content st-first st-nl" data-part="new-library" onSubmit=${e => e.preventDefault()}>
            <span class="eyebrow">${T.eyebrow}</span>
            <h2>${T.heading}</h2>
            <div class="filters" role="group" aria-label=${T.title}>
              <button type="button" class="filter" data-action="mode-agent" onClick=${() => navigate('chat')}>${T.modes.agent}</button>
              <button type="button" class="filter active" data-action="mode-manual" aria-pressed="true">${T.modes.manual}</button>
            </div>
            ${loadFailed ? html`<div class="progress-alert" role="alert">${T.failed}</div>` : null}
            <label class="field"><span>${T.name}</span><input data-field="name" placeholder=${T.namePlaceholder} value=${name} maxlength="100" onInput=${e => setName(e.currentTarget.value)} /></label>
            <label class="field"><span>${T.brief}</span><textarea data-field="brief" placeholder=${T.briefPlaceholder} value=${brief} maxlength="2000" onInput=${e => setBrief(e.currentTarget.value)}></textarea></label>
            ${briefEmpty ? html`<p class="limit-note" data-part="brief-required">${T.briefRequired}</p>` : null}

            <div class="section-label"><span>${T.strictness}</span>${levels ? html`<small class="muted" data-part="level-note">${fmt(T.levelNote, { level: T.levelNames[level], relevance: levels[level].relevance, substance: levels[level].substance })}</small>` : null}</div>
            <div class="filters" role="radiogroup" aria-label=${T.strictness} data-part="strictness">
              ${LEVELS.map(l => html`<button type="button" key=${l} role="radio" class=${`filter${l === level ? ' active' : ''}`} data-level=${l} aria-checked=${String(l === level)} aria-pressed=${String(l === level)} onClick=${() => setLevel(l)}>${T.levels[l]}</button>`)}
            </div>

            <div class="section-label"><span>${T.sources}</span></div>
            <label class="search-field"><${TIcon} name="plus" /><input data-field="source" aria-label=${T.sourceLabel} placeholder=${T.sourcePlaceholder} value=${input}
              onInput=${e => { setInput(e.currentTarget.value); setInputError(null) }} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void addTyped() } }} /></label>
            ${inputError ? html`<p class="limit-note" role="alert" data-part="source-error">${inputError}</p>` : null}
            <div class="st-first-rows" data-part="sources" data-count=${rows.length}>
              ${rows.map(r => html`<${SourceRow} key=${r.source.name} row=${r} busy=${busy} onRemove=${() => removeRow(r.source.name)} onTry=${() => tryRow(r.source)} />`)}
            </div>
            ${pack ? html`<button type="button" class="document-link" data-part="pack-line" data-action="add-pack" data-pack=${pack.id} disabled=${packId === pack.id} onClick=${addPack}>
              <${TIcon} name="book" /><span>${fmt(T.pack, { name: pack.name })}</span><small>${fmt(T.packCounts, { topics: pack.topics.length, sources: pack.sources.length })}</small><${TIcon} name="arrow" />
            </button>` : null}
            ${packId ? html`<p class="limit-note" role="status" data-part="pack-added">${fmt(T.packAdded, { name: pack?.name ?? '' })}</p>` : null}

            <div class="section-label"><span>${T.topics}</span></div>
            <div class="filters st-nl-topics" data-part="topics">
              ${topics.map(t => html`<span key=${t} class="filter active" data-topic=${t}>${t}${topicInUse(t) ? null : html`<button type="button" class="st-edit__x" data-action="remove-topic" aria-label=${fmt(T.removeTopic, { name: t })} onClick=${() => setTopics(list => list.filter(x => x !== t))}>✕</button>`}</span>`)}
              <input class="st-nl-topic-input" data-field="topic" aria-label=${T.topicPlaceholder} placeholder=${T.topicPlaceholder} value=${topicInput} maxlength="100"
                onInput=${e => setTopicInput(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); addTopic() } }} />
            </div>

            <div class="section-label"><span>${T.location}</span></div>
            <div class="file-row st-nl-location" data-part="location" data-path=${folder?.path ?? ''} data-chosen=${String(Boolean(folder?.chosen))}>
              <span class="file-icon"><${TIcon} name="files" fallback="file" /></span>
              <span class="file-text">${folder?.path ?? defaults?.root ?? ''}<small data-part="folder-state" data-state=${folder?.state ?? ''}>${folder ? fmt(T.folderStates[folder.state] ?? '', { n: folder.mdCount ?? 0 }) : ''}</small></span>
              <span class="st-act" data-action="change-folder"><button type="button" class="btn" disabled=${busy} onClick=${changeFolder}>${T.change}</button></span>
            </div>
            <p class="limit-note">${T.locationNote}</p>

            <div class="section-label"><span>${T.schedule}</span></div>
            <div class="st-nl-schedule" data-part="schedule">
              <label class="st-nl-check"><input type="checkbox" data-field="daily" checked=${daily} onChange=${e => setDaily(e.currentTarget.checked)} /> ${T.daily}</label>
              <span class="field st-nl-small"><input data-field="time" aria-label=${T.timeLabel} value=${time} maxlength="5" onInput=${e => setTime(e.currentTarget.value.trim())} /></span>
              <span>${T.runAt}</span>
              <span class="field st-nl-small"><input type="number" min="1" max="10000" data-field="cap" aria-label=${T.capLabel} value=${cap} onInput=${e => setCap(e.currentTarget.value)} /></span>
              <span>${T.capAfter}</span>
            </div>

            ${error ? html`<div class="progress-alert" role="alert" data-part="create-error">${error}</div>` : null}
            <div class="form-footer st-nl-footer">
              <span class="st-act" data-action="cancel-new"><button type="button" class="btn quiet" disabled=${busy} onClick=${cancel}>${T.cancel}</button></span>
              <small data-part="estimate" data-lo=${estimate?.expectedCalls?.[0] ?? ''} data-hi=${estimate?.expectedCalls?.[1] ?? ''}>${estimate ? fmt(T.estimate, { lo: estimate.expectedCalls[0], hi: estimate.expectedCalls[1] }) : ''}${estimate && untried ? T.estimateUntried : ''}</small>
              <span class="st-act" data-action="create-only"><button type="button" class="btn" disabled=${!ready} onClick=${() => create(false)}>${busy ? T.creating : T.createOnly}</button></span>
              <span class="st-act" data-action="create-run"><button type="button" class="btn primary" disabled=${!ready} onClick=${() => create(true)}>${T.createRun} <${TIcon} name="arrow" /></button></span>
            </div>
          </form>
        </div>
      </div>
    <//>
  <//>`
}
