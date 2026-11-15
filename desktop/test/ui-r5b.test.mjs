// Redesign R5b (docs/checks/2026-11-12-r5b/contract.md 「测」) on the running app — the one 提议 (screens/proposal.js), the 主 Agent
// page (screens/chat.js), the right panel's 待确认 (screens/right-panel.js), 重新评分 in 未通过筛选 (screens/inbox.js) and the
// page's words for what went wrong (O9). Four worlds, each of its own (test/support/seed.mjs worldSession: the pinned Electron, a
// world under the system's temporary folder, every connection the core's stand-in, the main agent on a script, every feed on
// this machine): each test makes the data it reads, so it runs alone too (--test-name-pattern, scripts/mutation-check.mjs r5b-*).
// The 系统检测 are the core's own rules over records written before the start (core suggestFor / recordSuggestions) or made by the
// app on the way (a 放弃 written → rule ⑤).
// Each check first shows the input that makes it fail (the control beside it), and the r5b-* mutants break a copy of the page
// for each reverse the contract names.
// redesign R6b-1: the comments / test names / expected words here name the fetch states with 05 第三节's words (无更新 · 地址无效 ·
// 访问被拒; they said the v1 words) — the page's dictionaries changed; what is checked did not.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { PROPOSALS } from '../src/renderer/texts/proposals.js'
import { AGENT } from '../src/renderer/texts/agent.js'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { RUN } from '../src/renderer/texts/run.js'
import { TODAY } from '../src/renderer/texts/today.js'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { fmt } from '../src/renderer/lib/format.js'
import { STRICTNESS as PAGE_STRICTNESS } from '../src/renderer/lib/strictness.js'
import { SHELF, seedLibrary, seedShelf, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const C = PROPOSALS.card
const A = PROPOSALS.actions
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')
const jsonl = p => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
const hoursAgo = h => new Date(Date.now() - h * 3_600_000).toISOString()

// ---- what no card may say -----------------------------------------------------------------------------------------------
// 05 统一用词 「不再用」 (the multi-character ones as they are; the one-character ones and 稍后 where they are a word of their own:
// quoted as a button — 05 itself writes 「稍后在设置中连接」 in prose), and the button words the 动作表 replaced (交给主 Agent · 不要 · 知道了 · 暂不需要 · 暂不处理 · 改一下)
const NOT_USED = [
  /跑一轮|这一轮|上一轮|每轮|试跑|打分|过关|没过|关卡|改一下|加上|去掉|删掉|提议卡|建议卡|不用管|再等等|谁定的|你改的|改动记录|写给 AI 的话|交给主 Agent|暂不需要|知道了/,
  /「(开始|不要|建库|建|改|调|加|贴|卡|关|稍后)」/,
]
const OLD_BUTTONS = ['不要', '交给主 Agent', '知道了', '暂不需要', '暂不处理', '改一下', '建库']
const DECIMAL = /\d\.\d/
const KIND_NAMES = /\b(create_library|add_source|remove_source|pause_source|edit_topics|edit_brief|edit_thresholds|edit_schedule|edit_cap|run_round|source-failing|no-output|ai-instruction|topic-overlap|dismiss-reason)\b/
const JSONISH = /[{}]|"\w+"\s*:/
const RAW = /HTTP \d{3}|\b40[34]\b|ECONNREFUSED|ENOTFOUND|socket hang up|check the address|Not Found|Forbidden|permission denied|EACCES|E_WEIRD/i
/** Everything a card's words must not have, as found (empty: clean). */
function forbidden(text) {
  const out = []
  for (const re of NOT_USED) if (re.test(text)) out.push(`05: ${re.exec(text)[0]}`)
  for (const [name, re] of [['decimal', DECIMAL], ['kind', KIND_NAMES], ['json', JSONISH], ['raw', RAW]]) if (re.test(text)) out.push(`${name}: ${re.exec(text)[0]}`)
  return out
}

test('controls: the scan finds what it is for, and passes the words that contain them', () => {
  assert.deepEqual(forbidden('相关度 ≥ 0.5').length, 1)
  assert.ok(forbidden('交给主 Agent').length && forbidden('「不要」').length && forbidden('edit_cap').length && forbidden('{n} 项').length && forbidden('HTTP 404: check the address').length)
  assert.deepEqual(forbidden('稍后处理 · 修改 · 创建 · 添加 · 交由主 Agent 分析 · 忽略 · 已生效 · 今天 12:03 · 1–4 次'), [])
})

test('R5b-5 precheck fix 11: 来源与要求 has no words for an HTTP code and does not read one (a code coming back would not be shown)', () => {
  const src = join(REPO_DIR, 'desktop', 'src', 'renderer')
  for (const f of ['texts/sources.js', 'texts-en/sources.js']) assert.equal(/\{http\}|HTTP \{/.test(readFileSync(join(src, f), 'utf8')), false, f)
  const page = readFileSync(join(src, 'screens', 'sources.js'), 'utf8')
  assert.equal(/\b[a-z]\w*\.http\b/.test(page), false, 'screens/sources.js reads no .http')
  assert.ok(/\b[a-z]\w*\.http\b/.test('return s.http ? a : b') && /\{http\}/.test("streak: '{state} · HTTP {http}'"), 'control: the scans find it')
})

/** The words of a card drawn in the page: what each part says and its buttons, in order. */
const READ_CARD = `(el) => ({
  title: (el.querySelector('[data-part="title"], [data-part="sentence"]')?.textContent ?? '').trim(),
  from: (el.querySelector('[data-part="from"]')?.textContent ?? '').trim(),
  library: (el.querySelector('[data-part="library"]')?.textContent ?? '').trim(),
  line: (el.querySelector('[data-part="evidence"]')?.textContent ?? '').trim(),
  status: el.querySelector('[data-part="status"]')?.textContent ?? null,
  failure: el.querySelector('[data-part="failure"]')?.textContent ?? null,
  calls: el.querySelector('[data-part="calls-model"]')?.textContent ?? null,
  buttons: [...el.querySelectorAll('[data-action] button')].map(b => [b.closest('[data-action]').dataset.action, b.textContent.trim(), b.className]),
  text: el.textContent,
})`

// =========================================================================================================================
describe('R5b-1 the one card: ten 主 Agent 提议 and ①–⑤ drawn; its states; the page\'s words for what went wrong', () => {
  const W = {}
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'decide' } },
    env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
    prepare: async world => {
      W.shelf = await seedShelf(world)
      const [seeded, ev, fashion] = W.shelf.dirs
      // ① a source failing three runs (暂时失败 ×2, 访问被拒 ×1, the fetcher's raw text and the HTTP code in the log)
      for (const [i, status] of ['failed', 'failed', 'blocked'].entries()) core.appendFetchLog(seeded, { ts: hoursAgo(6 - i), round: `r${i}`, source: 'mcp-news', kind: 'rss', status, count: 0, new: 0, hint: 'retry-next-round', message: status === 'blocked' ? 'HTTP 403 Forbidden' : 'connect ECONNREFUSED 127.0.0.1:9', ...(status === 'blocked' ? { http: 403 } : {}) })
      // ③ words aimed at AI in one of letta-blog's articles
      core.recordAiInstruction(seeded, { at: hoursAgo(3), source: 'letta-blog', itemId: 'https://example.test/x/1', by: 'rule', phrases: ['忽略之前的所有指令'] })
      // ⑤ the last three 放弃 all 营销内容
      for (const i of [1, 2, 3]) {
        const url = `https://example.test/promo/${i}`
        core.appendEvent(seeded, { ts: hoursAgo(4 - i), ev: 'seen', url, source: 'letta-blog', title: `促销 ${i}` })
        core.appendEvent(seeded, { ts: hoursAgo(4 - i), ev: 'dismissed', url, quick: 'marketing', reason: '营销内容' })
      }
      core.recordSuggestions(seeded, core.suggestFor(seeded))
      // ① 地址无效 twice in a row (a 404: its code and its raw text in the log only)
      core.addSource(ev, { name: 'ev-feed', kind: 'rss', url: 'http://127.0.0.1:9/ev.xml', topic: '整车销量' })
      for (const i of [1, 2]) core.appendFetchLog(ev, { ts: hoursAgo(3 - i), round: `g${i}`, source: 'ev-feed', kind: 'rss', status: 'gap', count: 0, new: 0, hint: 'fix-address-or-remove', http: 404, message: 'HTTP 404: check the address' })
      // ② 时尚: three runs without anything new (seedShelf); ④ its topics the same as 电动车's
      core.addTopic(fashion, { name: '整车销量', keywords: ['月销', '交付'] })
      core.addTopic(fashion, { name: '电池', keywords: ['装机量'] })
      const others = (me) => W.shelf.ids.map((id, i) => ({ libraryId: id, dir: W.shelf.dirs[i] })).filter(o => o.dir !== me)
      core.recordSuggestions(ev, core.suggestFor(ev, { otherLibraries: others(ev) }))
      core.recordSuggestions(fashion, core.suggestFor(fashion, { otherLibraries: others(fashion) }))
    },
  })
  const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
  const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])

  test('R5b-1 ten 主 Agent 提议, full and compact: 动作 + 对象, the line where it is from, 拒绝 · 提出修改 · 确认 (创建), no number of a threshold, no kind name, no raw error', async () => {
    const lib = W.shelf.ids[0]
    const S = n => ({ count: n.length, names: n, paused: [] })
    const base = { status: 'pending', libraryId: lib, why: 'w', createdAt: hoursAgo(1), by: 'agent' }
    const cards = [
      { id: 'p-create', kind: 'create_library', libraryId: null, params: { name: '新能源电池', brief: 'b' }, after: { name: '新能源电池', folder: 'C:\\libs\\新能源电池', brief: '追踪新能源电池。', topics: [{ name: '电池', keywords: ['装机量'] }], sources: S(['battery-weekly', 'battery-forum']), thresholds: { relevance: 0.7, substance: 0.6 }, schedule: { enabled: true, time: '08:30' }, cap: 120 },
        trial: [{ name: 'battery-weekly', status: 'ok', count: 4, include: true }, { name: 'battery-forum', status: 'blocked', count: 0, include: false, http: 403, message: 'HTTP 403 Forbidden' }] },
      { id: 'p-add', kind: 'add_source', params: { libraryId: lib, source: { name: 'agent-evals' } }, before: { sources: S(['a']) }, after: { sources: S(['a', 'agent-evals']) }, trial: { status: 'gap', count: 0, include: false, http: 404, message: 'HTTP 404: check the address' } },
      { id: 'p-remove', kind: 'remove_source', params: { libraryId: lib, name: 'a' }, before: { sources: S(['a', 'b']) }, after: { sources: S(['b']) } },
      { id: 'p-pause', kind: 'pause_source', params: { libraryId: lib, name: 'b', paused: true }, before: { sources: S(['a', 'b']) }, after: { sources: { count: 2, names: ['a', 'b'], paused: ['b'] } } },
      { id: 'p-topics', kind: 'edit_topics', params: { libraryId: lib, ops: [] }, before: { topics: [{ name: '评测', keywords: ['benchmark'] }] }, after: { topics: [{ name: '评测', keywords: ['benchmark', '公告'] }] } },
      { id: 'p-brief', kind: 'edit_brief', params: { libraryId: lib, brief: 'x' }, before: { brief: '旧的追踪要求' }, after: { brief: '新的追踪要求' } },
      { id: 'p-thresholds', kind: 'edit_thresholds', params: { libraryId: lib, relevance: 0.5, substance: 0.6 }, before: { thresholds: { relevance: 0.7, substance: 0.6 } }, after: { thresholds: { relevance: 0.5, substance: 0.6 } } },
      { id: 'p-schedule', kind: 'edit_schedule', params: { libraryId: lib, enabled: true, time: '09:00' }, before: { schedule: { enabled: false, time: '08:00' } }, after: { schedule: { enabled: true, time: '09:00' } } },
      { id: 'p-cap', kind: 'edit_cap', params: { libraryId: lib, cap: 30 }, before: { cap: 120 }, after: { cap: 30 } },
      { id: 'p-run', kind: 'run_round', params: { libraryId: lib }, before: { lastRoundAt: null, cap: 120 }, after: { queued: true, cap: 120 } },
    ].map(c => ({ ...base, ...c }))
    const drawn = await s.page.evaluate(async ([list, reader, name]) => {
      const read = eval(reader) // eslint-disable-line no-eval
      const { html, render } = await import('./lib/html.js')
      const { Proposal, agentItem } = await import('./screens/proposal.js')
      const box = document.createElement('div')
      document.body.append(box)
      const out = {}
      for (const c of list) {
        const item = agentItem(c, name)
        out[c.id] = {}
        for (const size of ['full', 'compact']) {
          render(html`<${Proposal} item=${item} size=${size} />`, box)
          await new Promise(r => setTimeout(r, 0))
          out[c.id][size] = read(box.firstElementChild)
          render(null, box)
        }
      }
      box.remove()
      return out
    }, [cards, READ_CARD, SHELF.names[0]])
    const titles = {
      'p-create': fmt(C.titles.create_library, { name: '新能源电池' }), 'p-add': fmt(C.titles.add_source, { name: 'agent-evals' }), 'p-remove': fmt(C.titles.remove_source, { name: 'a' }),
      'p-pause': fmt(C.titles.pause_source, { name: 'b' }), 'p-topics': C.titles.edit_topics, 'p-brief': C.titles.edit_brief, 'p-thresholds': C.titles.edit_thresholds,
      'p-schedule': C.titles.edit_schedule, 'p-cap': C.titles.edit_cap, 'p-run': C.titles.run_round,
    }
    for (const c of cards) {
      const { full, compact } = drawn[c.id]
      assert.equal(full.title, titles[c.id], c.id)
      assert.equal(compact.title, titles[c.id], c.id)
      assert.equal(full.from, C.sub, c.id)
      assert.equal(full.library, c.kind === 'create_library' ? '新能源电池' : SHELF.names[0], c.id)
      assert.equal(compact.from, fmt(C.eyebrow, { from: PROPOSALS.from.agent, library: c.kind === 'create_library' ? '新能源电池' : SHELF.names[0] }), c.id)
      const confirm = c.kind === 'create_library' ? A.create : A.confirm
      for (const [size, card] of [['full', full], ['compact', compact]]) {
        // the quiet one on the left, the main one on the right (the template's footer)
        assert.deepEqual(card.buttons.map(b => [b[0], b[1]]), [['decline', A.decline], ['revise', A.revise], ['confirm', confirm]], `${c.id} ${size}`)
        assert.ok(/\bquiet\b/.test(card.buttons[0][2]) && /\bprimary\b/.test(card.buttons[2][2]), `${c.id} ${size}: ${card.buttons.map(b => b[2])}`)
        assert.deepEqual(forbidden(card.text), [], `${c.id} ${size}: ${card.text}`)
        for (const b of card.buttons) assert.ok(!OLD_BUTTONS.includes(b[1]), b[1])
      }
    }
    // 严格程度 is the level's name and one sentence (R4a's three levels; a pair that is none of them: 自定义 and where it stands —
    // redesign R5b precheck fix 1: no longer 「已在「高级设置」中手动修改」, which no one did; the test below has the cases)
    const between = fmt(C.customLevel, { where: fmt(C.customWhere.between, { lo: C.levelNames.standard, hi: C.levelNames.strict }) })
    assert.ok(drawn['p-create'].full.text.includes(between), drawn['p-create'].full.text)
    assert.ok(drawn['p-thresholds'].full.text.includes(between) && drawn['p-thresholds'].full.text.includes(C.levels.standard))
    assert.ok(drawn['p-thresholds'].compact.line.includes(PROPOSALS.card.levelNames.standard))
    // the new library's points and its foot; a source not added says so
    for (const w of [C.points.brief, C.points.strictness, C.points.topicsSources, C.points.scheduleCap, fmt(C.folder, { path: 'C:\\libs\\新能源电池' }), C.recorded, C.unticked]) assert.ok(drawn['p-create'].full.text.includes(w), w)
    for (const id of ['p-brief', 'p-cap']) for (const w of [C.points.before, C.points.after]) assert.ok(drawn[id].full.text.includes(w), `${id} ${w}`)
    assert.ok(drawn['p-cap'].compact.line === fmt(C.changedSummary, { after: fmt(C.capLine, { n: 30 }) }), drawn['p-cap'].compact.line)
    // control: the page's table of the three levels is the core's
    assert.deepEqual(JSON.parse(JSON.stringify(PAGE_STRICTNESS)), JSON.parse(JSON.stringify(core.STRICTNESS)))
  })

  test('R5b-1 自定义 on a proposal (precheck fix 1): where the pair stands against the three levels, by both thresholds, never a number; 自定义 → 自定义 that reads the same says which requirement changed', async () => {
    const lib = W.shelf.ids[0]
    const T = (relevance, substance) => ({ relevance, substance })
    const base = { status: 'pending', libraryId: lib, why: 'w', createdAt: hoursAgo(1), by: 'agent' }
    const edit = (id, before, after) => ({ ...base, id, kind: 'edit_thresholds', params: { libraryId: lib, ...after }, before: { thresholds: before }, after: { thresholds: after } })
    const cards = [
      { ...base, id: 'c-create', kind: 'create_library', libraryId: null, params: { name: '甲', brief: 'b' }, after: { name: '甲', brief: 'b', topics: [], sources: { count: 0, names: [], paused: [] }, thresholds: T(0.7, 0.6), schedule: { enabled: false }, cap: 30 }, trial: [] },
      edit('c-same', T(0.55, 0.65), T(0.65, 0.65)),
      edit('c-both', T(0.55, 0.65), T(0.6, 0.62)),
      edit('c-above', T(0.5, 0.6), T(0.8, 0.75)),
      edit('c-below', T(0.5, 0.6), T(0.3, 0.45)),
      edit('c-apart', T(0.5, 0.6), T(0.3, 0.8)),
      edit('c-level', T(0.55, 0.65), T(0.7, 0.7)),
    ]
    const drawn = await s.page.evaluate(async list => {
      const { html, render } = await import('./lib/html.js')
      const { Proposal, agentItem } = await import('./screens/proposal.js')
      const box = document.createElement('div')
      document.body.append(box)
      const out = {}
      for (const c of list) {
        const item = agentItem(c, '库')
        render(html`<${Proposal} item=${item} size="full" />`, box)
        await new Promise(r => setTimeout(r, 0))
        const part = p => box.querySelector(`[data-part="${p}"]`)?.textContent.trim() ?? null
        out[c.id] = { strictness: part('thresholds'), before: part('before'), after: part('after'), text: box.textContent }
        render(html`<${Proposal} item=${item} size="compact" />`, box)
        await new Promise(r => setTimeout(r, 0))
        out[c.id].line = box.querySelector('[data-part="evidence"]').textContent.trim()
        out[c.id].compactText = box.textContent
        render(null, box)
      }
      box.remove()
      return out
    }, cards)
    const N = C.levelNames
    const custom = where => fmt(C.customLevel, { where })
    const between = custom(fmt(C.customWhere.between, { lo: N.standard, hi: N.strict }))
    // a new library of 0.7 / 0.6: between 标准 and 严格 (not 「手动修改」: the library did not exist yet)
    assert.equal(drawn['c-create'].strictness, between)
    // 0.55 / 0.65 → 0.65 / 0.65: both between 标准 and 严格 — the same words, so the line after says what changed
    assert.equal(drawn['c-same'].before, between)
    assert.equal(drawn['c-same'].after, `${between}${C.delta.sep}${fmt(C.delta.line, { parts: fmt(C.delta.stricter, { name: C.delta.names.relevance }) })}`)
    assert.ok(drawn['c-same'].line.endsWith(fmt(C.delta.line, { parts: fmt(C.delta.stricter, { name: C.delta.names.relevance }) })), drawn['c-same'].line)
    assert.equal(drawn['c-both'].after, `${between}${C.delta.sep}${fmt(C.delta.line, { parts: [fmt(C.delta.stricter, { name: C.delta.names.relevance }), fmt(C.delta.looser, { name: C.delta.names.substance })].join(C.delta.join) })}`)
    assert.equal(drawn['c-above'].after, custom(fmt(C.customWhere.above, { level: N.strict })))
    assert.equal(drawn['c-below'].after, custom(fmt(C.customWhere.below, { level: N.loose })))
    assert.equal(drawn['c-apart'].after, custom(C.customWhere.apart))
    // control: words that differ need no second line; a level is its own sentence
    assert.equal(drawn['c-above'].before, C.levels.standard)
    assert.equal(drawn['c-level'].after, C.levels.strict)
    assert.equal(drawn['c-level'].before, between)
    for (const [id, d] of Object.entries(drawn)) {
      for (const t of [d.text, d.compactText]) {
        assert.deepEqual(forbidden(t), [], `${id}: ${t}`)
        assert.equal(/手动修改|高级设置/.test(t), false, `${id}: no one edited it by hand (${t})`)
      }
    }
    assert.ok(forbidden('自定义（相关度 ≥ 0.55）').length > 0 && /手动修改/.test('通过阈值已在「高级设置」中手动修改'), 'control: the scans find a number and the old sentence')
  })

  test('R5b-1 ①–⑤ in 待确认 (the bridge\'s listToConfirm): title, 「系统检测 · <库名>」, the 动作表\'s buttons — 忽略 on the left, the main one on the right — and the line of the two that call the main agent', async () => {
    const v = (await bridge('listToConfirm')).data
    const system = v.items.filter(i => i.from === 'system')
    const kinds = system.map(i => (i.kind === 'source-failing' && i.evidence.state === 'gap' ? 'gap' : i.kind)).sort()
    assert.deepEqual([...new Set(kinds)].sort(), ['ai-instruction', 'dismiss-reason', 'gap', 'no-output', 'source-failing', 'topic-overlap'], 'control: the core found ① (both cases) ② ③ ④ ⑤')
    await until(n => document.querySelectorAll('[data-pane="decide"] [data-decide][data-from="system"]').length === n, system.length)
    const drawn = await s.page.evaluate(([ids, reader]) => { const read = eval(reader); return Object.fromEntries(ids.map(id => [id, read(document.querySelector(`[data-decide="${id}"]`))])) }, [system.map(i => i.id), READ_CARD]) // eslint-disable-line no-eval
    const want = {
      'source-failing': ['dismiss', 'forward', 'edit-address', 'pause-source'],
      gap: ['dismiss', 'forward', 'pause-source', 'edit-address'],
      'no-output': ['dismiss', 'forward', 'set-strictness'],
      'ai-instruction': ['dismiss', 'forward', 'pause-source'],
      'topic-overlap': ['dismiss', 'forward'],
      'dismiss-reason': ['dismiss', 'draft-proposal'],
    }
    const label = { dismiss: A.dismiss, forward: A.forward, 'edit-address': A.editAddress, 'pause-source': A.pauseSource, 'set-strictness': fmt(A.setStrictness, { level: C.levelNames.standard }), 'draft-proposal': A.draftProposal }
    for (const i of system) {
      const d = drawn[i.id]
      const k = i.kind === 'source-failing' && i.evidence.state === 'gap' ? 'gap' : i.kind
      assert.equal(d.from, fmt(C.eyebrow, { from: PROPOSALS.from.system, library: i.libraryName }), i.id)
      assert.deepEqual(d.buttons.map(b => b[0]), want[k], i.id)
      assert.deepEqual(d.buttons.map(b => b[1]), want[k].map(a => label[a]), i.id)
      assert.ok(/\bquiet\b/.test(d.buttons[0][2]) && /\bprimary\b/.test(d.buttons.at(-1)[2]), `${i.id}: ${d.buttons.map(b => b[2])}`)
      assert.equal(d.buttons.at(-1)[0], i.actions[0].id, 'the main one of the 动作表 is the one on the right')
      // the two that call the main agent say so, with the calls of one message
      const models = i.actions.filter(a => a.callsModel)
      assert.equal(d.calls, models.length ? models.map(a => fmt(PROPOSALS.callsModelOf, { action: label[a.id], ...core.TURN_CALLS })).join(' ') : null, i.id)
      assert.deepEqual(forbidden(d.text), [], `${i.id}: ${d.text}`)
      for (const b of d.buttons) assert.ok(!OLD_BUTTONS.includes(b[1]), b[1])
    }
    const by = k => system.find(i => (i.kind === 'source-failing' && i.evidence.state === 'gap' ? 'gap' : i.kind) === k)
    assert.equal(drawn[by('source-failing').id].title, fmt(PROPOSALS.kinds['source-failing'], { subject: 'mcp-news', n: by('source-failing').evidence.rounds }))
    assert.equal(drawn[by('gap').id].title, fmt(PROPOSALS.kinds['source-failing-gap'], { subject: 'ev-feed', n: 2 }))
    assert.equal(drawn[by('no-output').id].title, fmt(PROPOSALS.kinds['no-output'], { n: 3 }))
    assert.equal(drawn[by('ai-instruction').id].title, fmt(PROPOSALS.kinds['ai-instruction'], { subject: 'letta-blog' }))
    assert.ok(drawn[by('ai-instruction').id].line.includes('忽略之前的所有指令'), 'the sentence it found (P16)')
    assert.equal(drawn[by('topic-overlap').id].title, fmt(PROPOSALS.kinds['topic-overlap'], { other: by('topic-overlap').otherLibraryName, pct: 100 }))
    assert.equal(drawn[by('dismiss-reason').id].title, fmt(PROPOSALS.kinds['dismiss-reason'], { n: 3, reason: INBOX.bar.quick.marketing }))
  })

  test('R5b-1 the states: a decided 主 Agent 提议 is one line — 已生效 · <时间> · 已拒绝 · 已提出修改 · 设置已变更，该提议已失效 · 未能执行 with its kind of failure and what to do; no buttons', async () => {
    const card = { id: 'p-s', kind: 'edit_cap', libraryId: W.shelf.ids[0], params: { cap: 9 }, why: 'w', before: { cap: 10 }, after: { cap: 9 }, createdAt: hoursAgo(2), decidedAt: hoursAgo(1), by: 'agent' }
    const variants = [
      { status: 'confirmed' }, { status: 'declined' }, { status: 'revise', reviseText: 'x' }, { status: 'stale', reason: 'changed' }, { status: 'stale', reason: 'library-gone' },
      { status: 'failed', failure: { step: 'cap', done: [], rolledBack: true, category: 'error', advice: 'failureError', message: 'EACCES: permission denied, open C:\\x\\streams.json' } },
      { status: 'failed', failure: { step: 'cap', done: [], rolledBack: false, category: 'error', advice: 'failureError' } },
      { status: 'failed', failure: { step: 'cap', done: [], rolledBack: true, category: 'refused', advice: 'failureRefused' } },
      { status: 'pending' },
    ]
    const drawn = await s.page.evaluate(async ([c, list, reader]) => {
      const read = eval(reader) // eslint-disable-line no-eval
      const { html, render } = await import('./lib/html.js')
      const { Proposal, agentItem, stateText } = await import('./screens/proposal.js')
      const box = document.createElement('div')
      document.body.append(box)
      const out = []
      for (const v of list) {
        render(html`<${Proposal} item=${agentItem({ ...c, ...v })} size="full" />`, box)
        await new Promise(r => setTimeout(r, 0))
        out.push({ ...read(box.firstElementChild), tag: box.firstElementChild.className })
        render(null, box)
      }
      box.remove()
      const system = ['dismissed', 'accepted', 'expired'].map(st => stateText({ from: 'system', status: st }))
      return { out, system }
    }, [card, variants, READ_CARD])
    const S = PROPOSALS.states
    const [confirmed, declined, revise, stale, gone, failed, notBack, refused, pending] = drawn.out
    assert.ok(confirmed.status.startsWith(S.confirmed.split('{')[0]) && /\d{2}:\d{2}$/.test(confirmed.status), confirmed.status)
    assert.equal(declined.status, S.declined)
    assert.equal(revise.status, S.revise)
    assert.equal(stale.status, S.stale)
    assert.equal(gone.status, S.staleGone)
    assert.equal(failed.status, S.failed)
    assert.equal(failed.failure, PROPOSALS.advice.failureError)
    assert.equal(notBack.failure, PROPOSALS.advice.failureNotRolledBack, 'not all undone: the advice does not say 已撤回')
    assert.equal(refused.failure, PROPOSALS.advice.failureRefused)
    for (const d of drawn.out.slice(0, -1)) {
      assert.deepEqual(d.buttons, [], `decided: no button (${d.status})`)
      assert.ok(/\bafter-card\b/.test(d.tag), 'one line (the template\'s after-card)')
      assert.deepEqual(forbidden(d.text), [], d.text)
    }
    assert.equal(pending.buttons.length, 3, 'control: a pending one has its three buttons')
    assert.deepEqual(drawn.system, [S.dismissed, S.accepted, S.expired])
  })

  test('R5b-5 O9: 问题卡, 运行漏斗 and 资料库\'s file rules say a code they do not know in words; a source\'s 404 tried through the bridge — no code on the page, the raw text in 复制诊断信息', async () => {
    const said = await s.page.evaluate(async () => {
      const { problemWords } = await import('./screens/problem-card.js')
      const { stopWhat } = await import('./screens/run-funnel.js')
      const { pendingWords } = await import('./screens/library.js')
      return {
        problem: [problemWords({ code: 'connection', kind: 'claude-code', connectionCode: 'E_WEIRD_CONNECT', caughtKept: 2 }).text, problemWords({ code: 'E_WEIRD_PROBLEM', kind: 'claude-code', caughtKept: 1 }).text],
        funnel: [stopWhat({ why: 'connection', code: 'connection', connectionCode: 'E_WEIRD_CONNECT' }), stopWhat({ why: 'self-check', code: 'E_WEIRD_PROBLEM' })],
        library: [pendingWords('E_WEIRD_RULE'), pendingWords('no-frontmatter')],
      }
    })
    for (const t of [...said.problem, ...said.funnel, said.library[0]]) assert.ok(!/E_WEIRD|\(|（\s*）/.test(t.replace(/（详细信息见「复制诊断信息」）/, '')), t)
    assert.ok(said.problem[0].length > 0 && said.funnel[0].length > 0 && said.library[0].length > 0)
    assert.notEqual(said.library[1], said.library[0], 'control: a known rule has its own words')
    // a source that answers 404, tried: the page gets a state and a hint, never the code or the text; 复制诊断信息 has them
    const srv = createServer((req, res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not Found') })
    await new Promise(r => srv.listen(0, '127.0.0.1', r))
    try {
      const url = `http://127.0.0.1:${srv.address().port}/gone.xml`
      const r = (await bridge('trySource', { name: 'gone', kind: 'rss', url })).data
      assert.equal(r.status, 'gap')
      assert.equal(JSON.stringify(r).includes('404'), false, JSON.stringify(r))
      assert.equal(/Not Found/.test(JSON.stringify(r)), false)
    } finally { await new Promise(r => srv.close(r)) }
    await bridge('copyDiagnostics')
    const clip = readFileSync(join(s.world.appData, 'logs', 'clipboard.txt'), 'utf8')
    assert.ok(/404/.test(clip) && /gone/.test(clip), 'the raw error is in the diagnostics')
    // the calls of one message of the main agent, as the page says them (05 规则 8): usually 1 + the core's rounds of lookups,
    // at most the core's TURN_CALLS.max (precheck fix 3: retries, a session opened again, the summary — core/test/r5b.test.mjs)
    const calls = await s.page.evaluate(async () => (await import('./screens/proposal.js')).AGENT_CALLS)
    assert.deepEqual({ ...calls }, { ...core.TURN_CALLS })
    assert.deepEqual({ ...calls }, { lo: 1, hi: 1 + core.MAX_LOOKUP_ROUNDS, max: 18 })
  })

  test('R5b-5 O9 drawn (precheck fix 5): 问题卡, 运行漏斗 and 资料库\'s file card drawn in the page with English errors, a 404 and codes it does not know — the page\'s text has no code, no raw text', async () => {
    const raw = { message: 'Error: connect ECONNREFUSED 127.0.0.1:443', detail: 'HTTP 404 Not Found: check the address', http: 404 }
    const problems = [
      { code: 'connection', kind: 'claude-code', connectionCode: 'E_WEIRD_CONNECT', caughtKept: 2, ...raw },
      { code: 'connection', kind: 'api', connectionCode: 'http-404', caughtKept: 1, ...raw },
      { code: 'E_WEIRD_PROBLEM', kind: 'codex', caughtKept: 1, ...raw },
      // control: a code with words of its own
      { code: 'connection', kind: 'claude-code', connectionCode: 'login-expired', caughtKept: 2 },
    ]
    const at = hoursAgo(1)
    const funnel = stop => ({ funnel: { id: 'r1', startedAt: at, complete: false, sources: 2, stop: { ...stop, ...raw },
      cells: [{ id: 'fetched', n: 3 }, { id: 'new', n: 2 }, { id: 'gate:relevance', stop: true }, { id: 'gate:substance' }, { id: 'inbox' }],
      calls: { total: 1, parts: [{ id: 'self-check', n: 1 }] } }, outcome: null })
    const runs = [
      funnel({ why: 'E_WEIRD_WHY', code: 'E_WEIRD_PROBLEM', connectionCode: 'http-404' }),
      funnel({ why: 'connection', code: 'connection', connectionCode: 'E_WEIRD_CONNECT' }),
      funnel({ why: 'self-check', code: 'E_WEIRD_PROBLEM' }),
      // control: a reason with words of its own
      funnel({ why: 'cap', code: null }),
    ]
    const files = [{ file: 'odd.md', path: 'notes/odd.md', codes: ['E_WEIRD_RULE', 'http-404'], proposedHeader: null, nameOk: true, bodyHash: 'x' }]
    const drawn = await s.page.evaluate(async ([ps, rs, fs]) => {
      const { html, render } = await import('./lib/html.js')
      const { ProblemCard } = await import('./screens/problem-card.js')
      const { RunFunnel } = await import('./screens/run-funnel.js')
      const { HeaderCard } = await import('./screens/library.js')
      const box = document.createElement('div')
      document.body.append(box)
      const read = async node => { render(node, box); await new Promise(r => setTimeout(r, 0)); const t = box.textContent; render(null, box); return t }
      const noop = () => {}
      const out = { problem: [], funnel: [], library: [] }
      for (const p of ps) out.problem.push(await read(html`<${ProblemCard} problem=${p} busy=${false} onRetry=${noop} onChange=${noop} onRedetect=${noop} />`))
      for (const r of rs) out.funnel.push(await read(html`<${RunFunnel} lastRun=${r} outcome=${true} />`))
      for (const f of fs) out.library.push(await read(html`<${HeaderCard} item=${f} busy=${false} onApply=${noop} onSkip=${noop} />`))
      box.remove()
      return out
    }, [problems, runs, files])
    const CODE = /E_WEIRD|http-404|ECONNREFUSED|Not Found|check the address|\b404\b|\(\s*[\w-]+\s*\)|（\s*[\w-]+\s*）/
    const all = [...drawn.problem.slice(0, 3), ...drawn.funnel.slice(0, 3), ...drawn.library]
    for (const t of all) {
      assert.ok(t.trim().length > 0, 'control: something drawn')
      assert.equal(CODE.test(t), false, `a code or raw text on the page: ${CODE.exec(t)?.[0]} in 「${t}」`)
      assert.deepEqual(forbidden(t).filter(x => x.startsWith('raw')), [], t)
    }
    // precheck fix 10: the sentence this package wrote for a connection problem the page has no words for is in 05's words
    for (const t of drawn.problem.slice(0, 3)) {
      assert.ok(t.includes(fmt(TODAY.problem.connection.other, { name: '', n: 1 }).split('，').at(-1)) || t.includes(fmt(TODAY.problem.connection.other, { name: '', n: 2 }).split('，').at(-1)), t)
      assert.equal(/这一轮|打分|没丢/.test(t), false, `05 不再用: ${t}`)
    }
    // the unknown reason of a stop is said in the page's words, not as itself
    assert.ok(drawn.funnel[0].includes(fmt(RUN.stopWhy.other, { what: RUN.what.other })), drawn.funnel[0])
    // controls: known codes have their own words; the scan finds a code put back
    assert.ok(drawn.problem[3].includes(fmt(TODAY.problem.connection['login-expired'], { name: CONNECTIONS.names['claude-code'], n: 2 })), drawn.problem[3])
    assert.ok(drawn.funnel[3].includes(RUN.stopWhy.cap), drawn.funnel[3])
    assert.ok(CODE.test('连接出现问题（E_WEIRD_CONNECT）') && CODE.test('出现错误（http-404）') && CODE.test('stopped (aborted-x)'), 'control: the scan finds a code in brackets')
  })
})

// =========================================================================================================================
// the main agent's answers, one per call; every answer the same shape, so a test run alone (its first call) gets what it needs
const createAnswer = (feed, name) => ({ reply: '已生成建库提议。点击「创建」后由流息创建该库。', proposals: [{ kind: 'create_library', why: '用户要追踪电池', params: {
  name, brief: '追踪新能源电池：装机量、价格、技术路线。', topics: [{ name: '电池', keywords: ['装机量'] }],
  sources: [{ name: 'battery-weekly', kind: 'rss', url: feed, topic: '电池' }], schedule: { enabled: true, time: '08:30' } } }] })

/** A feed on this machine: /feed?n=<items>. */
async function feedServer() {
  const srv = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    const n = Number(u.searchParams.get('n') ?? 3)
    const base = `http://127.0.0.1:${srv.address().port}`
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
    res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>f</title>${Array.from({ length: n }, (_, i) => `<item><title>battery item ${i + 1}</title><link>${base}/i/${i + 1}</link><pubDate>${new Date(Date.now() - (i + 1) * 3_600_000).toUTCString()}</pubDate><description>d</description></item>`).join('')}</channel></rss>`)
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  return { url: n => `http://127.0.0.1:${srv.address().port}/feed?n=${n}`, close: () => new Promise(r => { srv.closeAllConnections(); srv.close(r) }) }
}

describe('R5b-2 the 主 Agent page (P03): the template\'s conversation, no 「等你定的事」, 「n 项待确认」 = the list, 创建 → the new library\'s 待看', () => {
  const W = {}
  const s = worldSession({
    kind: 'seeded', waitFor: 'chat', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'files' } },
    prepare: async world => {
      W.shelf = await seedShelf(world)
      W.feed = await feedServer()
      W.script = join(world.root, 'agent-script.json')
      writeFileSync(W.script, JSON.stringify([createAnswer(W.feed.url(4), '新能源电池甲'), createAnswer(W.feed.url(4), '新能源电池乙'), createAnswer(W.feed.url(4), '新能源电池丙')]))
      // a 系统检测 waits too (时尚's three runs without output): it is in the right panel, never in the conversation
      core.recordSuggestions(W.shelf.dirs[2], core.suggestFor(W.shelf.dirs[2]))
      return () => W.feed.close()
    },
    env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: W.script, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'chat' }),
  })
  const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
  const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
  const toChat = async () => {
    if (await s.page.evaluate(() => document.querySelector('main[data-screen="chat"][data-state="ready"]') === null)) {
      await s.page.click('[data-nav="chat"]')
      await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]') !== null)
    }
  }
  const say = async text => {
    const n = await s.page.evaluate(() => document.querySelectorAll('[data-part="conversation"] [data-row="agent"]').length)
    await s.page.fill('textarea[data-field="message"]', text)
    await s.page.click('[data-action="send"] button')
    await until(m => document.querySelectorAll('[data-part="conversation"] [data-row="agent"]').length > m && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false', n)
  }

  test('R5b-2 the page: thread · user-message · assistant-message (speaker 主 Agent · 管理全部库) with the full card · composer · date-line; no 「等你定的事」, no 系统检测 in the conversation; the right panel on 待确认; 「n 项待确认」 = the list', async () => {
    await toChat()
    await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab === 'decide')
    assert.equal(JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8')).panel.tab, 'decide', 'P03: the page opens the right panel on 待确认 (it started on 文件)')
    await say('帮我建个库，追踪新能源电池。')
    await until(() => document.querySelector('[data-part="conversation"] .assistant-message [data-proposal][data-kind="create_library"][data-status="pending"]') !== null)
    const page = await s.page.evaluate(() => {
      const main = document.querySelector('main[data-screen="chat"]')
      return {
        parts: ['.work-header h1', '.thread', '.thread .date-line', '.thread .user-message', '.thread .assistant-message .speaker', '.thread .assistant-message .confirmation .decision-points', '.composer-wrap .composer textarea', '.composer-wrap .compose-help'].map(q => [q, main.querySelector(q) !== null]),
        speaker: main.querySelector('.assistant-message[data-row="agent"] .speaker')?.textContent.trim(),
        h1: main.querySelector('.work-header h1').textContent, sub: main.querySelector('.work-header .header-meta').textContent,
        placeholder: main.querySelector('textarea[data-field="message"]').placeholder, hint: main.querySelector('[data-part="input-hint"]').textContent,
        text: main.textContent, waiting: main.querySelector('[data-part="waiting"], [data-part="waiting-items"]'),
        system: main.querySelectorAll('[data-from="system"], [data-suggestion]').length,
      }
    })
    for (const [q, there] of page.parts) assert.ok(there, `the template's part ${q}`)
    assert.equal(page.speaker.replace(/\s+/g, ' '), `${AGENT.name} ${AGENT.role}`)
    assert.deepEqual([page.h1, page.sub], [AGENT.chat.title, AGENT.chat.subtitle])
    assert.equal(page.placeholder, AGENT.chat.placeholder)
    assert.equal(page.hint, fmt(AGENT.chat.calls, core.TURN_CALLS), 'the calls of one message, the core\'s count: the usual and the most (precheck fix 3)')
    assert.ok(page.hint.includes('1–4') && page.hint.includes('18'), page.hint)
    assert.equal(page.waiting, null)
    assert.equal(page.text.includes('等你定的事'), false, 'F15: no 「等你定的事」 above the conversation')
    assert.equal(page.system, 0, 'no 系统检测 in the conversation')
    // the head's number is the list's: the bridge's, the tab's, the pane's
    const n = (await bridge('listToConfirm')).data.count
    assert.ok(n >= 2, `control: a proposal and a 系统检测 wait (${n})`)
    await until(m => document.querySelector('[data-part="to-confirm-chip"]')?.dataset.count === String(m) && document.querySelector('[data-panel-badge="decide"]')?.textContent === String(m)
      && document.querySelectorAll('[data-pane="decide"] [data-decide]').length === m, n)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="to-confirm-chip"]').textContent.trim()), fmt(PROPOSALS.chip, { n }))
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-pane="decide"] [data-from="system"]').length) >= 1, true, 'control: the 系统检测 is in the right panel')
    // the chip opens 待确认
    await s.page.click('[data-panel-tab="files"]')
    await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab === 'files')
    await s.page.click('[data-part="to-confirm-chip"]')
    await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab === 'decide')
    // the sidebar's 主 Agent carries no number (F10)
    assert.equal(/\d/.test(await s.page.evaluate(() => document.querySelector('[data-nav="chat"]').textContent)), false)
  })

  test('R5b-2 创建 on a new library\'s card: the library is made and registered, its first run queued, and the page is its 待看 (02 第 39 行)', async () => {
    await toChat()
    await say('再建一个库，追踪新能源电池。')
    const card = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="conversation"] [data-proposal][data-kind="create_library"][data-status="pending"]')].at(-1)?.dataset.proposal)
    assert.ok(card, 'control: a pending new library\'s card in the conversation')
    const before = (await bridge('listLibraries')).data.length
    await s.page.click(`[data-part="conversation"] [data-proposal="${card}"] [data-action="confirm"] button`)
    const end = Date.now() + 60_000
    let got = null
    while (got?.status !== 'confirmed') {
      if (Date.now() > end) throw new Error(`the card is ${got?.status}`)
      await new Promise(r => setTimeout(r, 200))
      got = (await bridge('listProposals', null)).data.find(x => x.id === card)
    }
    assert.ok(got.result?.libraryId, JSON.stringify(got.result))
    assert.notEqual(got.result.queued, false, 'its first run queued (the core\'s rule, as before)')
    await until(id => document.querySelector(`.lib-page[data-library="${id}"] main[data-screen="inbox"]`) !== null, got.result.libraryId)
    assert.equal((await bridge('listLibraries')).data.length, before + 1)
    assert.equal(JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8')).active, got.result.libraryId, 'the new library is the current one')
  })

  test('no page errors (主 Agent)', () => {
    assert.deepEqual(s.errors, [])
  })
})

// =========================================================================================================================
describe('R5b-3 the right panel\'s 待确认 (P16, O5): one list of every library, each once, done in place; its number follows the events without a reload', () => {
  const W = {}
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'decide' } },
    prepare: async world => {
      W.shelf = await seedShelf(world)
      const [seeded, ev, fashion] = W.shelf.dirs
      W.ids = W.shelf.ids
      // ① in 电动车 (not the current library): a source failing three runs; ① 地址无效 in 时尚; ② 时尚's three runs (seedShelf)
      core.addSource(ev, { name: 'ev-feed', kind: 'rss', url: 'http://127.0.0.1:9/ev.xml', topic: '整车销量' })
      for (const i of [1, 2, 3]) core.appendFetchLog(ev, { ts: hoursAgo(5 - i), round: `f${i}`, source: 'ev-feed', kind: 'rss', status: 'failed', count: 0, new: 0, hint: 'retry-next-round', message: 'connect ECONNREFUSED' })
      core.recordSuggestions(ev, core.suggestFor(ev))
      core.addTopic(fashion, { name: '财报', keywords: ['营收'] })
      core.addSource(fashion, { name: 'hk-filings', kind: 'rss', url: 'http://127.0.0.1:9/hk.xml', topic: '财报' })
      for (const i of [1, 2]) core.appendFetchLog(fashion, { ts: hoursAgo(4 - i), round: `g${i}`, source: 'hk-filings', kind: 'rss', status: 'gap', count: 0, new: 0, hint: 'fix-address-or-remove', http: 404, message: 'HTTP 404: check the address' })
      core.recordSuggestions(fashion, core.suggestFor(fashion))
      // ① in the current library too (mcp-news, dead in the seed)
      for (const i of [1, 2, 3]) core.appendFetchLog(seeded, { ts: hoursAgo(5 - i), round: `s${i}`, source: 'mcp-news', kind: 'rss', status: 'failed', count: 0, new: 0, hint: 'retry-next-round', message: 'connect ECONNREFUSED' })
      core.recordSuggestions(seeded, core.suggestFor(seeded))
      // two 主 Agent 提议 waiting at start, of two libraries (the development hook)
      W.cards = join(world.root, 'cards.json')
      writeFileSync(W.cards, JSON.stringify([
        { kind: 'edit_brief', params: { libraryId: W.ids[0], brief: '只追 agent 记忆的评测。' }, why: '测试' },
        { kind: 'edit_cap', params: { libraryId: W.ids[1], cap: 33 }, why: '测试' },
      ]))
      // the main agent: each answer two proposals of the current library
      W.script = join(world.root, 'agent-script.json')
      const two = { reply: '已生成两项提议。', proposals: [
        { kind: 'edit_cap', why: '上限', params: { libraryId: W.ids[0], cap: 44 } },
        { kind: 'edit_schedule', why: '定时', params: { libraryId: W.ids[0], enabled: true, time: '07:30' } },
      ] }
      writeFileSync(W.script, JSON.stringify([two, two, two]))
    },
    env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_PROPOSALS: W.cards, STREAMS_DEV_AGENT_SCRIPT: W.script }),
  })
  const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
  const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
  const list = async () => (await bridge('listToConfirm')).data
  const openRow = async id => { await s.page.click(`[data-library-row="${id}"]`); await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-state="ready"]`) !== null, id) }
  const onDecide = async () => {
    if (await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab !== 'decide')) await s.page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelector('[data-pane="decide"]') !== null)
  }
  /** The tab's number, the pane's, the list's cards, the bridge's — when they agree. */
  const agreeOn = n => until(m => {
    const badge = document.querySelector('[data-panel-badge="decide"]')?.textContent ?? '0'
    return badge === String(m) && document.querySelector('[data-pane="decide"]')?.dataset.count === String(m) && document.querySelectorAll('[data-pane="decide"] [data-decide]').length === m
  }, n)

  test('R5b-3 one list: every library\'s 主 Agent 提议 and 系统检测, each once in the whole window (none again below on a library\'s page); the head and the number = the list; the sidebar\'s 主 Agent has no number', async () => {
    await openRow(W.ids[0])
    await onDecide()
    const v = await list()
    const libs = new Set(v.items.map(i => i.libraryId))
    assert.ok(v.items.some(i => i.from === 'agent') && v.items.some(i => i.from === 'system') && libs.size >= 3, `control: both kinds, three libraries (${JSON.stringify(v.items.map(i => [i.from, i.libraryId]))})`)
    await agreeOn(v.count)
    const once = await s.page.evaluate(items => items.map(i => [i.id, document.querySelectorAll(`[data-decide="${i.id}"]`).length,
      i.from === 'system' ? document.querySelectorAll(`[data-suggestion="${i.key}"][data-library="${i.libraryId}"]`).length : document.querySelectorAll(`[data-proposal-id="${i.proposalId}"]`).length]), v.items)
    for (const [id, a, b] of once) assert.deepEqual([a, b], [1, 1], `${id} once`)
    // precheck fix 4: no second list anywhere, whatever its markup — each proposal's title is in the whole window's text as often
    // as there are titles that hold it (once, unless another title contains it)
    const titles = await s.page.evaluate(() => {
      const list = [...document.querySelectorAll('[data-pane="decide"] [data-decide] [data-part="sentence"]')].map(e => e.textContent.trim())
      const text = document.body.textContent
      return list.map(t => ({ title: t, found: text.split(t).length - 1, want: list.filter(u => u.includes(t)).length }))
    })
    assert.equal(titles.length, v.count, 'control: every card\'s title read')
    for (const t of titles) assert.equal(t.found, t.want, `「${t.title}」 in the window ${t.found} times`)
    const head = await s.page.evaluate(() => ({ eyebrow: document.querySelector('[data-part="decide-summary"] .eyebrow').textContent, title: document.querySelector('[data-part="decide-title"]').textContent, lead: document.querySelector('[data-part="decide-summary"] p').textContent }))
    assert.deepEqual(head, { eyebrow: PROPOSALS.list.eyebrow, title: fmt(PROPOSALS.list.title, { n: v.count }), lead: PROPOSALS.list.lead })
    assert.equal(/\d/.test(await s.page.evaluate(() => document.querySelector('[data-nav="chat"]').textContent)), false, 'F10')
  })

  test('R5b-3 the small cards (precheck fix 7 · 8): the top line as it is written (库名 and 主 Agent not in capitals); every card\'s buttons on the right, the main one last, one row or two; a time not spliced in with spaces', async () => {
    await openRow(W.ids[0])
    await onDecide()
    const v = await list()
    await agreeOn(v.count)
    const cards = await s.page.evaluate(() => [...document.querySelectorAll('[data-pane="decide"] [data-decide]')].map(c => {
      const from = c.querySelector('[data-part="from"]')
      const footer = c.querySelector('.confirm-footer')
      const buttons = [...footer.querySelectorAll('.row button')]
      const box = footer.getBoundingClientRect()
      const right = box.right - parseFloat(getComputedStyle(footer).paddingRight)
      // the rows of buttons: a button whose middle is within the height of a row's first is on that row (a button with an icon
      // can sit a pixel or two lower than its neighbours)
      const rows = []
      for (const b of buttons) {
        const r = b.getBoundingClientRect()
        const mid = (r.top + r.bottom) / 2
        const row = rows.find(x => mid > x.top && mid < x.bottom)
        if (row) row.right = Math.max(row.right, r.right)
        else rows.push({ top: r.top, bottom: r.bottom, right: r.right })
      }
      const ends = rows.map(x => x.right)
      return { id: c.dataset.decide, from: c.dataset.from, shown: from.innerText.trim(), written: from.textContent.trim(), right, ends, lastPrimary: /\bprimary\b/.test(buttons.at(-1)?.className ?? ''), line: c.querySelector('[data-part="evidence"]').textContent.trim() }
    }))
    assert.equal(cards.length, v.count, 'control: every card read')
    assert.ok(cards.some(c => c.from === 'agent') && cards.some(c => c.ends.length > 1), 'control: a 主 Agent 提议 and a card whose buttons take two rows')
    assert.ok(cards.some(c => /[a-z]/.test(c.written)), 'control: a top line with small letters (主 Agent, a library\'s name)')
    for (const c of cards) {
      assert.equal(c.shown, c.written, `${c.id}: the top line as written`)
      assert.ok(c.lastPrimary, `${c.id}: the main one last`)
      for (const end of c.ends) assert.ok(Math.abs(end - c.right) <= 2, `${c.id}: a row of buttons ends at ${end}, the card's right at ${c.right}`)
      assert.equal(/[一-鿿] [一-鿿]/.test(c.line), false, `${c.id}: 「${c.line}」`)
    }
    assert.ok(/[一-鿿] [一-鿿]/.test('自 今天 09:33 起'), 'control: the scan finds a spliced time')
  })

  test('R5b-3 O5: a 系统检测 made by the app on the way (three 放弃 with 营销内容 → rule ⑤) is in the list and the number at once — no reload of the page', async () => {
    await openRow(W.ids[0])
    await onDecide()
    const before = await list()
    assert.equal(before.items.some(i => i.kind === 'dismiss-reason' && i.libraryId === W.ids[0]), false, 'control: not there yet')
    await agreeOn(before.count)
    await s.page.evaluate(() => { window.__r5bStill = 'the same page' })
    const items = (await bridge('getInbox')).data.items.slice(0, 3)
    assert.equal(items.length, 3, 'control: three in 待看')
    for (const it of items) {
      await bridge('dismissItem', it.url)
      await bridge('settleDismiss', null, 'marketing')
    }
    // the main process has it (rule ⑤ right after the third 放弃)…
    const after = await list()
    const made = after.items.find(i => i.kind === 'dismiss-reason' && i.libraryId === W.ids[0])
    assert.ok(made, 'control: the core made it')
    // …and the page has it, list and number, within the time, the page not loaded again
    await s.page.waitForFunction(id => document.querySelector(`[data-pane="decide"] [data-decide="${id}"]`) !== null, made.id, { polling: 100, timeout: 8_000 })
    await agreeOn(after.count)
    assert.equal(after.count, before.count + 1)
    assert.equal(await s.page.evaluate(() => window.__r5bStill), 'the same page', 'no reload')
  })

  test('R5b-3 the same proposal in the conversation and in 待确认: 拒绝 in the conversation takes it off the list; 拒绝 in the list makes it 已拒绝 in the conversation', async () => {
    await s.page.click('[data-nav="chat"]')
    await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]') !== null)
    await onDecide()
    const n = await s.page.evaluate(() => document.querySelectorAll('[data-part="conversation"] [data-row="agent"]').length)
    await s.page.fill('textarea[data-field="message"]', '上限改成 44，定时改成 07:30。')
    await s.page.click('[data-action="send"] button')
    await until(m => document.querySelectorAll('[data-part="conversation"] [data-row="agent"]').length > m && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false', n)
    // the turn's two proposals drawn (the cards are read on proposals-changed, a moment after the turn's words)
    await until(() => [...document.querySelectorAll('[data-part="conversation"] [data-row="agent"]')].at(-1)?.querySelectorAll('[data-proposal][data-status="pending"]').length === 2)
    const ids = await s.page.evaluate(() => { const last = [...document.querySelectorAll('[data-part="conversation"] [data-row="agent"]')].at(-1); return [...last.querySelectorAll('[data-proposal][data-status="pending"]')].map(e => e.dataset.proposal) })
    assert.equal(ids.length, 2, 'control: two proposals in the turn')
    await until(([a, b]) => document.querySelector(`[data-pane="decide"] [data-proposal-id="${a}"]`) && document.querySelector(`[data-pane="decide"] [data-proposal-id="${b}"]`), ids)
    await s.page.evaluate(() => { window.__r5bStill = 'the same page' })
    // in the conversation → off the list
    await s.page.click(`[data-part="conversation"] [data-proposal="${ids[0]}"] [data-action="decline"] button`)
    await s.page.waitForFunction(id => document.querySelector(`[data-pane="decide"] [data-proposal-id="${id}"]`) === null, ids[0], { polling: 100, timeout: 8_000 })
    assert.equal(await s.page.evaluate(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)?.dataset.status, ids[0]), 'declined')
    // in the list → the conversation says 已拒绝
    await s.page.click(`[data-pane="decide"] [data-proposal-id="${ids[1]}"] [data-action="decline"] button`)
    await s.page.waitForFunction(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)?.dataset.status === 'declined', ids[1], { polling: 100, timeout: 8_000 })
    assert.equal(await s.page.evaluate(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"] [data-part="status"]`)?.textContent, ids[1]), PROPOSALS.states.declined)
    assert.equal((await bridge('listProposals', null)).data.filter(c => ids.includes(c.id)).map(c => c.status).join(), 'declined,declined')
    assert.equal(await s.page.evaluate(() => window.__r5bStill), 'the same page')
  })

  test('R5b-3 a 系统检测 of a library that is not the current one: 暂停该来源 is done right there — that library\'s source paused (手动修改), the current one untouched', async () => {
    await openRow(W.ids[0])
    await onDecide()
    const item = (await list()).items.find(i => i.from === 'system' && i.libraryId === W.ids[1] && i.kind === 'source-failing')
    assert.ok(item, 'control: 电动车\'s ① waits')
    const cfg = join(W.shelf.dirs[1], 'streams.json')
    const mine = join(W.shelf.dirs[0], 'streams.json')
    const bytes = sha(mine)
    assert.equal(JSON.parse(readFileSync(cfg, 'utf8')).sources.find(x => x.name === 'ev-feed').paused, undefined, 'control: not paused')
    await s.page.click(`[data-decide="${item.id}"] [data-action="pause-source"] button`)
    await s.page.waitForFunction(id => document.querySelector(`[data-decide="${id}"]`) === null, item.id, { polling: 100, timeout: 8_000 })
    assert.equal(JSON.parse(readFileSync(cfg, 'utf8')).sources.find(x => x.name === 'ev-feed').paused, true)
    assert.equal(jsonl(join(W.shelf.dirs[1], '_pipeline', 'changes.jsonl')).at(-1)?.by, 'you', '变更记录: 手动修改')
    assert.equal(sha(mine), bytes, 'the current library as it was')
    assert.equal(JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8')).active, W.ids[0], 'still the current library')
    assert.ok(await s.page.evaluate(id => document.querySelector(`.lib-page[data-library="${id}"]`) !== null, W.ids[0]), 'no other page')
  })

  /** 主 Agent, then that library again from the sidebar: its page as it remembered it — and whether a 修改地址 dialog is open. */
  const awayAndBack = async id => {
    await s.page.click('[data-nav="chat"]')
    await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]') !== null)
    await s.page.click(`[data-library-row="${id}"]`)
    await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="sources"][data-state="ready"]`) !== null, id)
    // the sources are read again and the page settles (the dialog of a remembered editAddress would open by then)
    await until(() => document.querySelector('.st-src-row[data-row]') !== null)
    await new Promise(r => setTimeout(r, 800))
    return s.page.evaluate(() => document.querySelector('dialog[data-dialog="edit-source"][open]') !== null)
  }

  test('R5b-1 修改地址 (precheck fix 2): the dialog opens once — 取消, then 主 Agent, then the library again from the sidebar: 来源与要求 without the dialog', async () => {
    await openRow(W.ids[0])
    await onDecide()
    const item = (await list()).items.find(i => i.from === 'system' && i.libraryId === W.ids[2] && i.kind === 'source-failing')
    assert.ok(item && item.evidence.state === 'gap', 'control: 时尚\'s ① 地址无效 waits')
    await s.page.click(`[data-decide="${item.id}"] [data-action="edit-address"] button`)
    await until(id => document.querySelector(`.lib-page[data-library="${id}"] main[data-screen="sources"]`) !== null && document.querySelector('dialog[data-dialog="edit-source"][open]') !== null, W.ids[2])
    await s.page.click('dialog[data-dialog="edit-source"] [data-action="cancel-edit-source"] button')
    await until(() => document.querySelector('dialog[data-dialog="edit-source"][open]') === null)
    assert.equal(await awayAndBack(W.ids[2]), false, 'back on the library: no 修改地址 dialog again')
    assert.ok((await list()).items.some(i => i.id === item.id), 'control: cancelled, the proposal still waits')
  })

  test('R5b-1 修改地址: that library\'s 来源与要求 with the row\'s 修改地址 dialog open; the address saved → the proposal leaves the list', async () => {
    await openRow(W.ids[0])
    await onDecide()
    const item = (await list()).items.find(i => i.from === 'system' && i.libraryId === W.ids[2] && i.kind === 'source-failing')
    assert.ok(item && item.evidence.state === 'gap', 'control: 时尚\'s ① 地址无效 waits')
    await s.page.click(`[data-decide="${item.id}"] [data-action="edit-address"] button`)
    await until(id => document.querySelector(`.lib-page[data-library="${id}"] main[data-screen="sources"]`) !== null && document.querySelector('dialog[data-dialog="edit-source"][open]') !== null, W.ids[2])
    assert.equal(await s.page.evaluate(() => document.querySelector('dialog[data-dialog="edit-source"] [data-field="address"]').value), 'http://127.0.0.1:9/hk.xml', 'the row\'s own address')
    await s.page.fill('dialog[data-dialog="edit-source"] [data-field="address"]', 'http://127.0.0.1:9/hk-new.xml')
    await s.page.click('dialog[data-dialog="edit-source"] [data-action="confirm-edit-source"] button')
    await s.page.waitForFunction(id => document.querySelector(`[data-decide="${id}"]`) === null, item.id, { polling: 100, timeout: 15_000 })
    assert.equal(JSON.parse(readFileSync(join(W.shelf.dirs[2], 'streams.json'), 'utf8')).sources.find(x => x.name === 'hk-filings').url, 'http://127.0.0.1:9/hk-new.xml')
    // precheck fix 2: saved, then away and back from the sidebar — the library's page as it was, the dialog not again
    assert.equal(await awayAndBack(W.ids[2]), false, 'back on the library: no 修改地址 dialog again')
  })

  test('no page errors (待确认)', () => {
    assert.deepEqual(s.errors, [])
  })
})

// =========================================================================================================================
describe('R5b-4 未通过筛选\'s 重新评分 (N07, P05): the notice and the button with the core\'s estimate when items were judged under the old standard; none otherwise', () => {
  const W = {}
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } },
    prepare: async world => {
      // the seeded library: its round left one item below 相关度; then 严格程度 saved by you — that verdict is old now
      const dir = world.library
      const before = core.snapshot(dir, ['thresholds'])
      core.saveStrictness(dir, 'standard')
      core.recordChanges(dir, before, core.snapshot(dir, ['thresholds']), { by: 'you', now: () => new Date(Date.now() - 600_000) })
      // precheck fix 6: beside it, an item judged under the standard of now and below it too — in 未通过筛选, not old
      const node = core.pipelineConfig(dir).nodes.find(n => n.id === 'relevance')
      W.fresh = 'https://example.test/new-standard/1'
      const ts = new Date(Date.now() - 300_000).toISOString()
      core.appendEvent(dir, { ts, ev: 'seen', url: W.fresh, source: 'letta-blog', title: '新标准下也未通过的条目', date: ts.slice(0, 10) })
      core.appendEvent(dir, { ts, ev: 'scored', url: W.fresh, node: 'relevance', score: 0.1, reason: '与追踪要求无关', cfg: core.cfgOf(node), threshold: node.threshold, round: 'r-now' })
      // a second library with a round of its own and nothing changed since: below the line, not old
      W.plain = join(world.root, 'world', 'plain')
      await seedLibrary(W.plain)
      let reg = core.emptyRegistry()
      const ids = []
      for (const [d, name] of [[dir, '重评库'], [W.plain, '未改库']]) { const r = core.withLibrary(reg, d, { name }); reg = r.registry; ids.push(r.entry.id) }
      core.writeRegistry(join(world.appData, 'libraries.json'), core.withActive(reg, ids[0]))
      W.ids = ids
      W.dir = dir
    },
    env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
  })
  const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
  const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
  const openRejected = async id => {
    await s.page.click(`[data-library-row="${id}"]`)
    await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="inbox"][data-state="ready"]`) !== null, id)
    await until(() => document.querySelector('[data-part="rejected"]') !== null)
    if (await s.page.evaluate(() => document.querySelector('[data-part="rejected"]').dataset.open !== 'true')) await s.page.click('[data-part="rejected"] summary')
    await until(() => document.querySelector('[data-part="rejected"][data-open="true"] [data-rejected]') !== null)
  }

  test('R5b-4 严格程度 changed: 「严格程度已于 … 更新，以下 n 条按旧标准评分。」 + 重新评分（预计 a–b 次模型调用） = the core\'s; the old rows marked; pressed → only they are scored again, what passes is in 待看, the notice is gone', async () => {
    const info = core.rescoreInfo(W.dir)
    assert.ok(info.total > 0 && info.changedField === 'thresholds', `control: old verdicts (${info.total}, ${info.changedField})`)
    // precheck fix 6: the item judged under the standard of now is below it too, and not old
    const rejected = core.listRejected(W.dir)
    assert.equal(rejected.total, info.total + 1, 'control: one more in 未通过筛选 than the old ones')
    assert.equal(rejected.items.find(i => i.url === W.fresh)?.old, false, 'control: judged under the standard of now')
    assert.equal(info.items.some(i => i.url === W.fresh), false)
    await openRejected(W.ids[0])
    const shown = await s.page.evaluate(fresh => { const a = document.querySelector('[data-part="rescore"]'); const row = document.querySelector(`[data-rejected="${fresh}"]`); return a && { text: a.querySelector('[data-part="rescore-text"]').textContent, button: a.querySelector('[data-action="rescore"] button').textContent.trim(), cls: a.className, old: document.querySelectorAll('[data-rejected][data-old="true"] [data-part="old"]').length, marks: document.querySelectorAll('[data-rejected] [data-part="old"]').length, rows: document.querySelectorAll('[data-rejected]').length, fresh: row && { old: row.dataset.old, mark: row.querySelector('[data-part="old"]') !== null } } }, W.fresh)
    assert.ok(shown, 'the notice is there')
    assert.ok(/\bprogress-alert\b/.test(shown.cls))
    const calls = info.expectedCalls[0] === info.expectedCalls[1] ? String(info.expectedCalls[0]) : fmt(INBOX.rejected.calls, { lo: info.expectedCalls[0], hi: info.expectedCalls[1] })
    assert.equal(shown.button, fmt(INBOX.rejected.rescore, { calls }))
    assert.ok(shown.text.startsWith(INBOX.rejected.changed.thresholds) && shown.text.endsWith(fmt(INBOX.rejected.alert, { what: '', when: 'X', n: info.total }).split('X')[1]), shown.text)
    assert.equal(shown.old, info.total, 'each old row marked 按旧标准评分')
    // precheck fix 6: the notice's number is the old ones only; the mark only on them — the row judged under the standard of now has none
    assert.equal(shown.rows, info.total + 1, 'both kinds listed')
    assert.equal(shown.marks, info.total, 'no mark but on the old rows')
    assert.deepEqual(shown.fresh, { old: 'false', mark: false })
    assert.ok(shown.text.includes(` ${info.total} `) && !shown.text.includes(` ${info.total + 1} `), shown.text)
    const urls = info.items.map(i => i.url)
    const usage = () => jsonl(join(W.dir, '_pipeline', 'usage.jsonl'))
    const ledger = () => jsonl(join(W.dir, '_pipeline', 'ledger.jsonl'))
    const scoredOf = u => ledger().filter(e => e.ev === 'scored' && e.url === u).length
    const n0 = usage().length
    const freshScored = scoredOf(W.fresh)
    const oldScored = urls.map(scoredOf)
    await s.page.click('[data-part="rescore"] [data-action="rescore"] button')
    await s.page.waitForFunction(() => document.querySelector('[data-part="rescore"]') === null, null, { polling: 100, timeout: 60_000 })
    assert.equal(core.rescoreInfo(W.dir).total, 0)
    const lines = usage().slice(n0)
    // every call of it is a line with its purpose: the self-check's probe and the re-scoring's rescore:<step> (a line without a
    // purpose is not counted as either)
    assert.ok(lines.length > 0 && lines.every(l => typeof l.purpose === 'string' && (l.purpose === 'probe' || /^rescore:/.test(l.purpose))), JSON.stringify(lines.map(l => l.purpose)))
    assert.ok(lines.some(l => /^rescore:/.test(l.purpose)), 'control: something was scored again')
    assert.ok(lines.length <= info.expectedCalls[1], `${lines.length} calls ≤ ${info.expectedCalls[1]}`)
    // only the old ones: each scored again, the one of the standard of now not touched
    assert.ok(urls.every((u, i) => scoredOf(u) > oldScored[i]), 'the old ones scored again')
    assert.equal(scoredOf(W.fresh), freshScored, 'the one judged under the standard of now: not scored again')
    assert.ok(core.listRejected(W.dir).items.some(i => i.url === W.fresh && i.old === false), 'and still in 未通过筛选')
    // the scripted connection passes it: it is in 待看 now
    await until(u => [...document.querySelectorAll('[data-card]')].some(c => u.includes(c.dataset.url)), urls)
  })

  test('R5b-4 a library whose 未通过筛选 was judged under the standard of now: no notice, no button', async () => {
    const info = core.rescoreInfo(W.plain)
    assert.equal(info.total, 0, 'control: nothing old')
    await openRejected(W.ids[1])
    assert.ok(await s.page.evaluate(() => document.querySelectorAll('[data-rejected]').length) > 0, 'control: items below the line are listed')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="rescore"], [data-action="rescore"]')), null)
  })

  test('R5b-3 待确认 with nothing in it (precheck fix 9): only the empty state\'s sentence — no 「以下事项均需确认后才会执行。」', async () => {
    assert.equal((await bridge('listToConfirm')).data.count, 0, 'control: nothing waits in this world')
    await s.page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelector('[data-pane="decide"] [data-part="decide-none"]') !== null)
    const pane = await s.page.evaluate(() => ({ text: document.querySelector('[data-pane="decide"]').textContent, paragraphs: document.querySelectorAll('[data-pane="decide"] [data-part="decide-summary"] p').length }))
    assert.ok(pane.text.includes(PROPOSALS.list.none), pane.text)
    assert.equal(pane.text.includes(PROPOSALS.list.lead), false, `the lead only over a list: ${pane.text}`)
    assert.equal(pane.paragraphs, 0)
  })

  test('no page errors (重新评分)', () => {
    assert.deepEqual(s.errors, [])
  })
})
