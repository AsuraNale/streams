// A seeded library for the tests and the screenshots (scripts/lib/world.mjs kind 'seeded'): a real round of the core over a
// fake feed on this machine, so every file the app reads (streams.json, the ledger, the inbox files, rounds.jsonl,
// fetch_log.jsonl, notes/, the index) is what the core itself writes.
//   const seed = await seedLibrary(dir)
// 1.1 W7b: a library exactly as v1.0 made it and ran it — v1.0's code is core/legacy (not shipped; tests and fixtures may use
// it): createLibraryV1, its scripted connector, makeContext, runRound. The app only opens such a library (it is not updated).
// What it does: createLibraryV1 → three topics and two RSS sources (one served by a node:http server for the round, one at a
// port nobody listens on, so it fails in the round and the banner of 今日 has a line) → runRound with the core's scripted
// connector (scores per item from SCORES below; item 7 fails relevance and stays 「抓到的」) → keep one, dismiss one, leave four
// in the inbox, one of them with its inbox event moved 17 days back → the live source's address switched to the dead port, so
// the next run fails on both and nothing reaches the network. Returns what it wrote, for the tests to compare against.
// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// Nothing else that is checked changed.
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../../scripts/lib/paths.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href
const LEGACY = pathToFileURL(join(REPO_DIR, 'core', 'legacy', 'index.mjs')).href
const DAY_MS = 86_400_000
export const LONG_WAIT_DAYS = 17
export const DISMISS_REASON = '营销稿，没有技术内容'
export const TOPICS = ['agent 记忆', 'MCP 生态', '评测']

// per item: title, relevance, substance, freshness; item 7 fails the first gate (0.7) and stays at stage seen
export const ITEMS = [
  { n: 1, title: 'Letta 发布 Memory Blocks API：把 agent 记忆拆成可编辑的块', relevance: 0.86, substance: 0.72, freshness: 'new' },
  { n: 2, title: '一篇比较五种 agent 记忆方案的评测', relevance: 0.91, substance: 0.8, freshness: 'new' },
  { n: 3, title: 'Our CRM now has AI memory', relevance: 0.71, substance: 0.61, freshness: 'new' },
  { n: 4, title: 'MemGPT 作者的一次播客访谈', relevance: 0.78, substance: 0.6, freshness: 'followup' },
  { n: 5, title: 'MCP 服务器注册表投毒事件复盘', relevance: 0.83, substance: 0.77, freshness: 'new' },
  { n: 6, title: '给 agent 加长期记忆的三种做法', relevance: 0.75, substance: 0.66, freshness: 'duplicate' },
  { n: 7, title: '一年前的旧文被转发：记忆这个词', relevance: 0.3, substance: 0.2, freshness: 'new' },
]
const TITLE_RE = /^(?:标题：|Title: )(.*)$/m
const JUDGE_ID_RE = /^\[([A-Za-z0-9_.:-]+)\] /gm

const rss = (base, items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>seed</title>\n${items.map(i => `<item><title>${i.title}</title><link>${base}/item/${i.n}</link><pubDate>${new Date(Date.now() - i.n * DAY_MS).toUTCString()}</pubDate><description>summary of item ${i.n}</description></item>`).join('\n')}\n</channel></rss>`

async function serveFeed() {
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`
    if (req.url === '/feed') { res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }); res.end(rss(base, ITEMS)); return }
    const m = /^\/item\/(\d+)$/.exec(req.url ?? '')
    if (m) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<html><body><p>Body of item ${m[1]}. The benchmark improved by 6%. Nothing else.</p></body></html>`); return }
    res.writeHead(404); res.end('no')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, feed: `${base}/feed`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}

/** An address on this machine that nothing listens on (the port was bound and released). */
export async function deadFeedUrl() {
  const s = createServer()
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve))
  const { port } = s.address()
  await new Promise(resolve => s.close(resolve))
  return `http://127.0.0.1:${port}/feed`
}

const readJson = p => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`, 'utf8')

/**
 * @param {string} dir - an empty folder (the world's library folder)
 * @param {object} [o]
 * @param {() => Date} [o.now]
 */
export async function seedLibrary(dir, { now = () => new Date() } = {}) {
  const core = await import(CORE)
  const legacy = await import(LEGACY)
  legacy.createLibraryV1(dir, { name: basename(dir) })
  const live = await serveFeed()
  const dead = await deadFeedUrl()
  const configFile = join(dir, 'streams.json')
  const config = readJson(configFile)
  config.topics = TOPICS.map(name => ({ name }))
  config.sources = [
    { name: 'letta-blog', kind: 'rss', url: live.feed, topic: TOPICS[0], max_results: 50 },
    { name: 'mcp-news', kind: 'rss', url: dead, topic: TOPICS[1], max_results: 50 },
  ]
  writeJson(configFile, config)

  const byTitle = title => ITEMS.find(i => i.title === title.trim()) ?? null
  const connector = legacy.scriptedConnector({
    // item 4's summary never satisfies the checker: its card carries 「未通过核验」 (verification.passed false)
    judgePassed: (ids, prompt) => !prompt.includes(ITEMS[3].title),
    gate: (key, prompt) => {
      const item = byTitle(TITLE_RE.exec(prompt)?.[1] ?? '')
      if (!item) return undefined
      const out = { [key]: item[key] ?? 0.5, reason: key === 'relevance' ? '直接讲 agent 记忆的实现' : '有具体接口和示例，但没有评测', quote: item.title }
      if (key === 'substance') out.freshness = item.freshness
      return out
    },
    summary: prompt => {
      const title = TITLE_RE.exec(prompt)?.[1]?.trim() ?? ''
      const ids = [...prompt.matchAll(JUDGE_ID_RE)].map(m => m[1])
      return { what: `一条讲 ${title} 的材料，有代码示例，不是论文。`, points: ['把长期记忆拆成块', '暴露读写接口', '给了数字但没有第三方评测'], quote: title, claimed: [...new Set(ids)] }
    },
  })
  const ctx = legacy.makeContext({ timeoutMs: 1500, now, sleep: async () => {} })
  let round
  try {
    round = await legacy.runRound(dir, { connector, ctx })
  } finally {
    await live.close()
  }
  if (!round.ok || !round.started) throw new Error(`seed: the round did not run: ${JSON.stringify(round.problems)}`)

  const inbox = core.listInbox(dir, { now })
  if (inbox.length < 6) throw new Error(`seed: ${inbox.length} items in the inbox, 6 expected`)
  const keptItem = inbox[0]
  const dismissedItem = inbox[1]
  const kept = core.keep(dir, keptItem.url, { now })
  core.dismiss(dir, dismissedItem.url, DISMISS_REASON, { now })
  const remaining = core.listInbox(dir, { now })
  const waiting = remaining[remaining.length - 1]
  // the oldest card: its inbox event moved 17 days back (a test fixture; the app itself never rewrites the ledger)
  const ledgerFile = join(dir, '_pipeline', 'ledger.jsonl')
  const oldTs = new Date(now().getTime() - LONG_WAIT_DAYS * DAY_MS - 3_600_000).toISOString()
  const lines = readFileSync(ledgerFile, 'utf8').split('\n').map(line => {
    if (line.trim() === '') return line
    const ev = JSON.parse(line)
    if (ev.ev === 'inbox' && ev.url === waiting.url) ev.ts = oldTs
    return JSON.stringify(ev)
  })
  writeFileSync(ledgerFile, lines.join('\n'), 'utf8')
  // the live source goes dead too: the next run fails on both, and nothing leaves this machine
  const cfg = readJson(configFile)
  cfg.sources = cfg.sources.map(s => ({ ...s, url: dead }))
  writeJson(configFile, cfg)

  const scores = Object.fromEntries(inbox.map(i => [i.url, i.scores]))
  return {
    dir,
    name: basename(dir),
    topics: TOPICS,
    sources: cfg.sources.map(s => s.name),
    deadUrl: dead,
    round: { id: round.round.id, counts: round.counts, gates: round.gates, calls: round.calls },
    urls: inbox.map(i => i.url),
    scores,
    kept: { url: keptItem.url, title: keptItem.title, id: kept.id, file: kept.file },
    dismissed: { url: dismissedItem.url, title: dismissedItem.title, reason: DISMISS_REASON },
    inbox: core.listInbox(dir, { now }).map(i => ({ url: i.url, title: i.title })),
    waiting: { url: waiting.url, title: waiting.title, days: LONG_WAIT_DAYS },
    caughtUrl: `${live.base}/item/7`,
  }
}

// ---- a session on a world of a given kind (the counterpart of test/support/app.mjs appSession, which makes an empty world) ----
//   const s = worldSession({ kind: 'seeded', env: world => ({ STREAMS_DEV_LIBRARY: world.library }), waitFor: 'inbox' })
//   … s.world (the folders + `seed`) · s.app · s.page · s.errors
// `env` may be an object or a function of the world (the library folder is only known once the world exists); `prepare(world)`
// runs before the app starts (to put a file somewhere, to start a server) and may return a function run after the app closes.
import { after, before } from 'node:test'
import { closeApp, launch, ready } from './app.mjs'
import { removeTree } from '../../scripts/lib/remove-tree.mjs'
import { tempDir } from '../../scripts/lib/temp.mjs'
import { makeWorld } from '../../scripts/lib/world.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// (v2 package F: by default it waits for 概览, the screen the app opens on; v1.0 waited for 今日)
export function worldSession({ kind = 'seeded', env = {}, settings = null, waitFor = 'inbox', prepare = null } = {}) {  // redesign R1: the app opens on 待看 (was 'overview')
  const s = { world: null, run: null, app: null, page: null, errors: [] }
  const folders = []
  let cleanup = null
  before(async () => {
    const root = tempDir('st-desktop-ui-')
    folders.push(root)
    s.world = await makeWorld({ root, kind })
    s.run = s.world
    if (typeof prepare === 'function') cleanup = await prepare(s.world)
    const extra = typeof env === 'function' ? env(s.world) : env
    const started = await launch(s.world, { settings: typeof settings === 'function' ? settings(s.world) : settings, env: extra })
    s.app = started.app
    s.page = started.page
    s.page.on('pageerror', err => s.errors.push(`pageerror: ${err.message}`))
    s.page.on('console', msg => { if (msg.type() === 'error') s.errors.push(`console: ${msg.text()}`) })
    if (waitFor === 'load') await s.page.waitForLoadState('domcontentloaded')
    else await ready(s.page, waitFor)
  })
  after(async () => {
    const problems = []
    try { await closeApp(s.app, { userDataDir: s.world ? join(s.world.appData, 'electron') : undefined }) } catch (err) { problems.push(err) }
    if (typeof cleanup === 'function') { try { await cleanup() } catch (err) { problems.push(err) } }
    await sleep(300)
    for (const dir of folders) {
      try { removeTree(dir, { waitMs: 20_000 }) } catch (err) { problems.push(err) }
    }
    if (problems.length) throw problems[0]
  })
  return s
}

/** A feed on this machine for a test's own round: { base, feed, close }. */
export const startFeed = serveFeed

// ---- the extras of plan B's screens (资料库 · 图谱 · 问库 · 流水线 · 来源与主题 · 运行状态), on top of what seedLibrary wrote ----
//   const s = worldSession({ kind: 'seeded', prepare: world => { seedPlanB(world) }, … })   → world.planB
// It changes nothing seedLibrary returned and adds no ledger line, note or source that plan A's tests read (they do not call
// it): two kept notes with [[links]] and one note the user wrote, standing for files edited or written in Obsidian (written
// straight into notes/ as a fixture, the way a user's own files arrive — the app itself writes notes/ only through the
// core's writeNoteFile); one of the two kept has its history in the ledger (seen → inbox → kept) and a summary checked over
// two rounds in verdicts.jsonl (round 1: one model check failed that the model claimed it had done; round 2: all passed);
// a file without a header (待规范); one question asked in demand.jsonl; a source whose address gives 404, four rounds in a row in fetch_log.jsonl. Then the
// index is rebuilt.
export const PLAN_B = Object.freeze({
  memgpt: Object.freeze({ id: '2023-10-12-memgpt', title: 'MemGPT 论文', source: 'https://example.org/papers/memgpt', date: '2023-10-12', kept: '2026-10-20' }),
  evals: Object.freeze({ id: '2026-10-27-five-memory-evals', title: '五种 agent 记忆方案评测', source: 'https://example.org/papers/five-memory-evals', date: '2026-10-27' }),
  mine: Object.freeze({ id: '2026-10-20-memory-choice', title: '我的笔记：记忆方案选型', date: '2026-10-20' }),
  missingLink: '一条库里没有的笔记',
  demandTopic: 'agent 记忆评测',
  demandQuestion: '最近一个月 agent 记忆这块有什么进展？有没有人做过横向比较？',
  untidy: 'untitled.md',
  oldBlog: 'old-blog',
  oldBlogRounds: 4,
  keywords: Object.freeze({ 'agent 记忆': Object.freeze(['agent memory', 'long-term memory', 'MemGPT']), 'MCP 生态': Object.freeze(['MCP', 'Model Context Protocol']) }),
})

const note = (core, meta, body) => core.serializeFrontmatter(meta) + body

/** @param {{ library: string, seed: object }} world - a seeded world (scripts/lib/world.mjs) */
export async function seedPlanB(world) {
  const core = await import(CORE)
  const dir = world.library
  const B = PLAN_B
  const notesDir = join(dir, 'notes')
  // the evals note was kept just now, after everything seedLibrary did (the ledger is read in the order it was written)
  const t0 = Date.now() + 1000
  const at = sec => new Date(t0 + sec * 1000).toISOString()
  const keptDay = core.localIsoDate(new Date(t0))
  writeFileSync(join(notesDir, `${B.memgpt.id}.md`), note(core, {
    id: B.memgpt.id, title: B.memgpt.title, source: B.memgpt.source, source_name: 'letta-blog', date: B.memgpt.date, collected: B.memgpt.kept, kept: B.memgpt.kept,
    status: 'kept', topics: [TOPICS[0]], scores: { relevance: { score: 0.9, reason: '分层记忆的原始论文' }, substance: { score: 0.85, reason: '有方法和评测' } },
  }, `**这是什么：**把 agent 记忆分成主记忆和外部存储两层的论文。\n\n- 主记忆放在上下文里，外部存储按需换入换出\n- 和 [[${B.mine.title}]] 里的方案 A 对得上\n- 给了 *长对话* 上的评测\n`), 'utf8')
  writeFileSync(join(notesDir, `${B.evals.id}.md`), note(core, {
    id: B.evals.id, title: B.evals.title, source: B.evals.source, source_name: 'mcp-news', date: B.evals.date, collected: keptDay, kept: keptDay,
    status: 'kept', topics: [TOPICS[2], TOPICS[0]], scores: { relevance: { score: 0.91, reason: '横向比较五种方案' }, substance: { score: 0.8, reason: '有数据，作者方案排第一' }, freshness: { value: 'new', reason: '新的预印本' } },
  }, `**这是什么：**一篇在三个任务上比较五种 agent 记忆方案的预印本。\n\n1. 基线是 [[${B.memgpt.title}]]\n2. 作者自己的方案排第一\n3. 还提到了 [[${B.missingLink}]]\n`), 'utf8')
  writeFileSync(join(notesDir, `${B.mine.id}.md`), note(core, {
    id: B.mine.id, title: B.mine.title, source: `file:${B.mine.id}.md`, date: B.mine.date, status: 'authored', topics: [TOPICS[0]],
  }, `# 记忆方案选型\n\n两种做法，先记下来。\n\n## 方案 A\n\n- 分层，参考 [[${B.memgpt.title}]]\n- 成本：\`每轮多一次调用\`\n\n## 方案 B\n\n**块**的粒度更粗，_还没试_。\n`), 'utf8')

  // a file of the user's without a header: 待规范
  writeFileSync(join(notesDir, B.untidy), '随手记的一段，没有文件头。\n', 'utf8')

  // the evals note has a history: seen → inbox → kept, and its summary was checked over two rounds
  core.appendEvent(dir, { ts: at(0), ev: 'seen', url: B.evals.source, source: 'mcp-news', title: B.evals.title, date: B.evals.date })
  core.appendEvent(dir, { ts: at(1), ev: 'inbox', url: B.evals.source, round: 'seed-b', verified: true })
  core.appendEvent(dir, { ts: at(2), ev: 'kept', url: B.evals.source, id: B.evals.id })
  const base = (await import(LEGACY)).summaryBaseline()
  const judge = base.find(i => i.kind === 'judge')
  core.appendVerdict(dir, {
    node: 'summary', url: B.evals.source, round: 1, ts: at(1),
    items: base.map(i => (i.id === judge.id
      ? { id: i.id, kind: 'judge', passed: false, evidence: '摘要写「性能提升 20–30%」，材料只有「+6%」', claimed: true }
      : { id: i.id, kind: i.kind, passed: true, evidence: 'ok', claimed: true })),
  })
  core.appendVerdict(dir, {
    node: 'summary', url: B.evals.source, round: 2, ts: new Date(t0 + 1500).toISOString(),
    items: base.map(i => ({ id: i.id, kind: i.kind, passed: true, evidence: i.id === judge.id ? '改成「+6%（来源原话）」' : 'ok', claimed: true })),
  })

  // one question asked of the library
  core.appendDemandLine(dir, { ts: at(3), question: B.demandQuestion, topic: B.demandTopic, notInLibrary: false, used: [B.evals.id, B.memgpt.id] })

  // a source whose address is gone: 404 four rounds in a row (on this machine: nothing reaches the network)
  const configFile = join(dir, 'streams.json')
  const cfg = readJson(configFile)
  const oldUrl = world.seed.deadUrl.replace(/\/feed$/, '/old-feed')
  cfg.sources = [...cfg.sources, { name: B.oldBlog, kind: 'rss', url: oldUrl, max_results: 50 }]
  cfg.topics = cfg.topics.map(t => (B.keywords[t.name] ? { ...t, keywords: [...B.keywords[t.name]] } : t))
  writeJson(configFile, cfg)
  for (let i = 1; i <= B.oldBlogRounds; i++) {
    core.appendFetchLog(dir, { ts: new Date(Date.now() - (B.oldBlogRounds - i + 1) * DAY_MS).toISOString(), round: `seed-old-${i}`, source: B.oldBlog, kind: 'rss', status: 'gap', http: 404, count: 0, new: 0, message: 'HTTP 404: check the address' })
  }

  core.rebuildIndex(dir)
  world.planB = { ...B, oldUrl, kept: [world.seed.kept.id, B.memgpt.id, B.evals.id], authored: [B.mine.id] }
  return world.planB
}

// ---- a folder of the user's own .md files, not a library yet (plan A3 / S8: 导入已有文件夹) ----
//   const imp = seedImportFolder(dir)   → the files written, by what S8 should do with each
// What it writes (nothing else; no streams.json): two files without a header (one with a "# heading", one without), one
// whose header lacks source and date, one that conforms already, one whose name cannot be an id, one whose header cannot
// be read, a sub folder with a .md (not read in v1.0), an .obsidian folder; every file's mtime is MTIME. Bodies use CRLF
// and lack a final newline on purpose, so a writer that normalizes them is seen.
import { mkdirSync, utimesSync } from 'node:fs'

export const IMPORT_MTIME = new Date(2026, 9, 20, 9, 30, 0)
export const IMPORT_FILES = Object.freeze({
  '记忆方案选型.md': '# 记忆方案选型\r\n\r\n比较了 MemGPT、Letta 和自己写的三种做法。\r\n- 和 [[2025-读书笔记]] 有关\r\n最后一行没有换行',
  '2025-读书笔记.md': '---\nid: 2025-读书笔记\ntitle: 2025 读书笔记\nstatus: authored\ntopics: [阅读]\n---\n今年读的书。\n\n',
  'untitled.md': '随手记的一段话，没有标题。\n',
  '已经合规范.md': '---\nid: 已经合规范\ntitle: 已经合规范的一条\nsource: file:已经合规范.md\ndate: 2026-09-01\nstatus: authored\ntopics: [阅读]\n---\n这一条本来就合规范。\n',
  '会议记录(草稿).md': '# 会议记录\n草稿。\n',
  '坏了的文件头.md': '---\nid: 坏了的文件头\ntitle\n---\n正文。\n',
  '旧笔记/2024.md': '# 2024\n',
  '.obsidian/app.json': '{}\n',
})

export function seedImportFolder(dir) {
  for (const [rel, text] of Object.entries(IMPORT_FILES)) {
    const path = join(dir, rel)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text, 'utf8')
    utimesSync(path, IMPORT_MTIME, IMPORT_MTIME)
  }
  return {
    dir,
    files: Object.keys(IMPORT_FILES),
    conforming: ['已经合规范.md'],
    proposable: ['2025-读书笔记.md', 'untitled.md', '记忆方案选型.md'],
    badName: ['会议记录(草稿).md'],
    notProposable: ['坏了的文件头.md'],
    skippedDirs: ['旧笔记'],
    mdCount: 6,
  }
}

// ---- three registered libraries (v2 package F: the sidebar of plan B, the shelf, switching between libraries) ----
//   const shelf = await seedShelf(world)   (in a worldSession's `prepare`, on a seeded world; start the app with STREAMS_DEV_LIBRARY: '')
// What it writes: the world's seeded library gets a brief (core saveBrief) and stays the current one; two more libraries next
// to it, made by the core — 「电动车」 with a brief and two topics, nothing run yet; 「时尚」 with no brief, no topics and three
// rounds without output in its rounds.jsonl (its problem: no-output) — and <appData>\libraries.json (core writeRegistry)
// with the three, in that order, each its own colour. Returns { ids: [seeded, ev, fashion], dirs, names, briefs }.
export const SHELF = Object.freeze({
  names: Object.freeze(['AI Agent 记忆', '中国电动车行业', '中国时尚上市公司']),
  briefs: Object.freeze(['追踪 agent 记忆方案、MCP 生态和评测的新动态。不要营销稿。', '追踪中国电动车行业：整车销量、电池和充电。不要二手车。', null]),
  colors: Object.freeze(['river', 'green', 'violet']),
  icons: Object.freeze(['A', '车', '衣']),
})

export async function seedShelf(world) {
  const core = await import(CORE)
  const legacy = await import(LEGACY)
  const ev = join(world.root, 'world', 'ev')
  const fashion = join(world.root, 'world', 'fashion')
  legacy.createLibraryV1(ev, { name: 'ev' })
  core.addTopic(ev, { name: '整车销量', keywords: ['月销', '交付'] })
  core.addTopic(ev, { name: '电池', keywords: ['装机量'] })
  legacy.createLibraryV1(fashion, { name: 'fashion' })
  const at = i => new Date(Date.now() - (4 - i) * 3_600_000).toISOString()
  writeFileSync(join(fashion, '_pipeline', 'rounds.jsonl'), [1, 2, 3].map(i => `${JSON.stringify({ id: `dry-${i}`, startedAt: at(i), finishedAt: at(i), counts: { fetched: 2, new: 0, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: {}, calls: 0 })}\n`).join(''), 'utf8')
  core.saveBrief(world.library, SHELF.briefs[0])
  core.saveBrief(ev, SHELF.briefs[1])
  const dirs = [world.library, ev, fashion]
  let reg = core.emptyRegistry()
  const ids = []
  for (const [i, dir] of dirs.entries()) {
    const r = core.withLibrary(reg, dir, { name: SHELF.names[i] })
    reg = core.withMeta(r.registry, r.entry.id, { icon: SHELF.icons[i], color: SHELF.colors[i] })
    ids.push(r.entry.id)
  }
  reg = core.withActive(reg, ids[0])
  core.writeRegistry(join(world.appData, 'libraries.json'), reg)
  return { ids, dirs, names: SHELF.names, briefs: SHELF.briefs }
}
