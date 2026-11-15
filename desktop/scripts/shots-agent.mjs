#!/usr/bin/env node
// Pictures of the real window for v2 package G (docs/checks/2026-11-09-wp-g/contract.md G5): 和主 Agent 聊, the proposal card,
// the suggestion card and 问库's routed sentences, walked through the design's use cases on a world under the OS temp folder
// (removed after). Playwright drives the pinned Electron, the window shown, content 1440×960, --force-device-scale-factor=1.
//   node scripts/shots-agent.mjs                   河蓝: every picture below; 素灰 and 夜间: two each (uc1-3, uc3-3)
//   node scripts/shots-agent.mjs --theme night     one theme only (its pictures)
// The world: two registered libraries as at the start of UC1 — 「AI Agent 工具」 (the seeded library: its dead source mcp-news)
// and 「中国时尚上市公司」 (five sources, three topics) — a feed server on this machine for every test fetch, the main Agent on the
// core's scripted stand-in (STREAMS_DEV_CONNECTION=fake + STREAMS_DEV_AGENT_SCRIPT, SCRIPT below), the new library's folder
// under the world (STREAMS_DEV_LIBRARY_ROOT). No connection is chosen. Pictures → docs/shots/<date>-g-<name>[-<theme>].png:
//   uc1-1  和主 Agent 聊, nothing waiting, your sentence typed         uc1-2  its one question with two quick answers
//   uc1-3  the new library's card (8 sources tried, the refused one not ticked)   uc1-4  after 建库: the card says so, the sidebar has it
//   uc2-4  「AI Agent 工具」's 概览: three rounds without output, the suggestion card (交给主 Agent / 不要, nothing else)
//   uc3-3  问库 of 「中国时尚上市公司」: 「这句转给主 Agent」, the reply and its two cards   uc3-4  确认 both → 来源与要求's 「谁定的」
//   unsure 问库: 「这是要改这个库吗？」 with its two buttons             states  a card gone stale and one that did not take effect
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const day = value('--date') ?? new Date().toLocaleDateString('sv-SE')
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const ALL = ['uc1-1', 'uc1-2', 'uc1-3', 'uc1-4', 'uc2-4', 'uc3-3', 'uc3-4', 'unsure', 'states']
const PLANS = { river: ALL, paper: ['uc1-3', 'uc3-3'], night: ['uc1-3', 'uc3-3'] }
const themes = value('--theme') ? [value('--theme')] : Object.keys(PLANS)

// ---- the feed server: /feed/<name>?n=<items>, /blocked → 403 ----
const rss = (base, name, n) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${name}</title>\n${Array.from({ length: n }, (_, i) => `<item><title>${name} 第 ${i + 1} 条</title><link>${base}/item/${name}/${i + 1}</link><pubDate>${new Date(Date.now() - (i + 1) * 3_600_000).toUTCString()}</pubDate><description>${name}</description></item>`).join('\n')}\n</channel></rss>`
const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`
  const u = new URL(req.url ?? '/', base)
  const m = /^\/feed\/([\w-]+)$/.exec(u.pathname)
  if (m) { res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }); res.end(rss(base, m[1], Number(u.searchParams.get('n') ?? 3))); return }
  if (u.pathname === '/blocked') { res.writeHead(403); res.end('no'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<html><body><p>An item.</p></body></html>')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`
const feed = (name, n) => `${BASE}/feed/${name}?n=${n}`

const EV_SOURCES = [['cpca-weekly', 6, '整车销量'], ['caam-monthly', 3, '整车销量'], ['battery-monthly', 4, '电池'], ['charging-alliance', 2, '充电'], ['ev-review', 12, '整车销量'], ['hkex-auto', 9, '整车销量'], ['us-filings-auto', 5, '整车销量']]
// redesign R6b-1: the scripted reply names the unticked source by its state as the page says it now (访问被拒; it said the v1 word)
const script = (ids) => [
  { reply: '好。先问一件事：', ask: { question: '港股、美股上市的中国车企要算进来吗？', options: ['要', '不要'] } },
  { reply: '按你说的拟了一个库（港股、美股上市的也算）。8 个来源均已测试抓取，状态为「访问被拒」的来源未勾选：', proposals: [{ kind: 'create_library', why: '你要追整车销量、电池和充电；港股、美股上市的车企也算', params: {
    name: '中国电动车行业',
    brief: '追踪中国电动车行业：整车销量（月销、交付、上险量）、动力电池（装机量、价格、技术路线）、充电（公共桩、换电、超充）。含在港股、美股上市的中国车企。不要：二手车、汽车金融、纯营销稿。',
    topics: [{ name: '整车销量', keywords: ['月销', '交付量', '上险量'] }, { name: '电池', keywords: ['动力电池', '装机量', '固态电池'] }, { name: '充电', keywords: ['充电桩', '换电', '超充'] }],
    sources: [...EV_SOURCES.map(([name, n, topic]) => ({ name, kind: 'rss', url: feed(name, n), topic })), { name: 'auto-forum', kind: 'rss', url: `${BASE}/blocked`, topic: '整车销量' }],
    thresholds: { relevance: 0.7, substance: 0.6 }, schedule: { enabled: true, time: '08:30' } } }] },
  { reply: '好，我拟了一个改动，新来源试抓过了：', proposals: [
    { kind: 'add_source', why: '你说「以后也追踪港股服装公司的公告」', params: { libraryId: ids.fashion, source: { name: 'hkex-apparel', kind: 'rss', url: feed('hkex-apparel', 6), topic: '财报' } } },
    { kind: 'edit_topics', why: '你说「以后也追踪港股服装公司的公告」', params: { libraryId: ids.fashion, ops: [{ op: 'add_keywords', topic: '财报', keywords: ['港股公告'] }] } }] },
  { reply: '拟了两张卡：', proposals: [
    { kind: 'edit_cap', why: '你说把 AI Agent 工具的每轮上限改成 50', params: { libraryId: ids.agent, cap: 50 } },
    { kind: 'add_source', why: '你说给中国时尚上市公司加一个运动品牌的来源', params: { libraryId: ids.fashion, source: { name: 'hkex-sports', kind: 'rss', url: feed('hkex-sports', 3), topic: '财报' } } }] },
]

async function seed(world) {
  const agent = world.library
  const fashion = join(world.root, 'world', 'fashion')
  core.createLibrary(fashion, { name: 'fashion' })
  core.saveBrief(fashion, '追踪中国上市服装与运动品牌：财报、零售流水、门店与渠道的变化。不要：明星八卦、穿搭推荐。')
  for (const [name, keywords] of [['财报', ['财报', '营收', '流水']], ['门店与渠道', ['门店', '电商', '渠道']], ['品牌动向', ['新品', '收购', '代言']]]) core.addTopic(fashion, { name, keywords })
  for (const [name, n] of [['fashion-daily', 4], ['retail-weekly', 3], ['sports-brands', 5], ['brand-ir', 2], ['fashion-biz', 6]]) core.addSource(fashion, { name, kind: 'rss', url: feed(name, n), topic: '财报' })
  core.saveBrief(agent, 'AI Agent 的框架、工具与 MCP 生态。不要营销稿。')
  // three rounds without output after the seed's (the banner of 概览)
  for (let i = 1; i <= core.NO_OUTPUT_ROUNDS; i++) {
    const at = new Date(Date.now() - (core.NO_OUTPUT_ROUNDS - i + 1) * 3_600_000).toISOString()
    appendFileSync(join(agent, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: `shot-${i}`, startedAt: at, finishedAt: at, counts: { fetched: 14, new: 12, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: {}, calls: 15 })}\n`)
  }
  let reg = core.emptyRegistry()
  const ids = {}
  for (const [key, dir, name, icon, color] of [['fashion', fashion, '中国时尚上市公司', '衣', 'violet'], ['agent', agent, 'AI Agent 工具', 'A', 'river']]) {
    const r = core.withLibrary(reg, dir, { name })
    reg = core.withMeta(r.registry, r.entry.id, { icon, color })
    ids[key] = r.entry.id
  }
  reg = core.withActive(reg, ids.agent)
  core.writeRegistry(join(world.appData, 'libraries.json'), reg)
  return { ids, dirs: { agent, fashion } }
}

async function run(theme, wanted) {
  const root = tempDir(`st-shots-agent-${theme}-`)
  let app = null
  const taken = []
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    const { ids, dirs } = await seed(world)
    const scriptFile = join(root, 'agent-script.json')
    writeFileSync(scriptFile, JSON.stringify(script(ids)))
    const libraryRoot = join(root, 'library-root')
    mkdirSync(libraryRoot)
    const env = { STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'chat', STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: scriptFile, STREAMS_DEV_LIBRARY_ROOT: libraryRoot }
    const started = await launch(world, { env, settings: { theme } })
    app = started.app
    const page = started.page
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const shot = async (name, prepare) => {
      if (!wanted.includes(name)) return
      if (prepare) await prepare()
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(400)
      const out = resolve(REPO_DIR, 'docs', 'shots', `${day}-g-${name}${theme === 'river' ? '' : `-${theme}`}.png`)
      await page.screenshot({ path: out })
      taken.push(out)
    }
    const idle = () => until(() => document.querySelector('[data-part="compose"]')?.dataset.busy === 'false' && !document.querySelector('[data-sending]'))
    const toEnd = () => page.evaluate(() => { const l = document.querySelector('[data-part="conversation"]'); l.scrollTop = l.scrollHeight })
    const scrollTo = sel => page.evaluate(q => document.querySelector(q)?.scrollIntoView({ block: 'start' }), sel)
    await ready(page, 'chat')
    await until(() => document.querySelectorAll('[data-library-row]').length === 2 && document.querySelector('[data-part="intro"]') !== null)

    // UC1
    await page.fill('textarea[data-field="message"]', '帮我建个库，追踪中国电动车行业，重点是整车销量、电池和充电。')
    await shot('uc1-1')
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="ask"][data-open="true"]') !== null)
    await idle()
    await shot('uc1-2', toEnd)
    await page.click('[data-part="ask"][data-open="true"] [data-action="quick"][data-option="要"] button')
    await until(() => document.querySelector('[data-part="conversation"] [data-proposal][data-kind="create_library"]') !== null)
    await idle()
    await shot('uc1-3', () => scrollTo('[data-part="conversation"] [data-row="agent"]:last-of-type'))
    await page.click('[data-part="conversation"] [data-proposal][data-kind="create_library"] [data-action="confirm"] button')
    await until(() => document.querySelector('[data-part="conversation"] [data-proposal][data-kind="create_library"]')?.dataset.status === 'confirmed' && document.querySelectorAll('[data-library-row]').length === 3)
    await shot('uc1-4', toEnd)

    // UC2 step 4: the rule of package D finds mcp-news failing; 「AI Agent 工具」's 概览
    const at = new Date(Date.now() - 2 * 3_600_000).toISOString()
    core.recordSuggestions(dirs.agent, [{ key: 'source-failing:mcp-news', kind: 'source-failing', subject: 'mcp-news', createdAt: at, evidence: { rounds: 3, failed: 0, blocked: 3, since: at, last: { ts: at, status: 'blocked', message: 'HTTP 403', http: 403 } } }])
    await page.click(`[data-library-row="${ids.agent}"]`)
    await until(() => document.querySelector('main[data-screen]')?.dataset.state === 'ready')
    await page.click('.st-lib-tabs [data-tab="overview"]')
    await until(() => document.querySelector('[data-part="suggestions"] [data-suggestion]') !== null)
    await shot('uc2-4', () => scrollTo('[data-part="no-output"]'))

    // UC3 on 「中国时尚上市公司」
    await page.click(`[data-library-row="${ids.fashion}"]`)
    await until(() => document.querySelector('main[data-screen]')?.dataset.state === 'ready')
    await page.click('.st-lib-tabs [data-tab="ask"]')
    await ready(page, 'ask')
    const ask = async text => {
      const n = await page.evaluate(() => document.querySelectorAll('section[data-turn]').length)
      await page.fill('textarea[data-field="question"]', text)
      await page.click('main[data-screen="ask"] [data-action="send"] button')
      await until(i => { const t = document.querySelector(`section[data-turn="${i}"]`); return t && t.dataset.state !== 'asking' }, n)
      return n
    }
    const i = await ask('以后也追踪港股服装公司的公告。')
    await until(n => document.querySelectorAll(`section[data-turn="${n}"] [data-proposal]`).length === 2, i)
    await shot('uc3-3', () => page.evaluate(n => { const l = document.querySelector('[data-part="conversation"]'); l.scrollTop = l.scrollHeight }, i))
    for (const kind of ['add_source', 'edit_topics']) {
      await page.click(`section[data-turn="${i}"] [data-proposal][data-kind="${kind}"] [data-action="confirm"] button`)
      await until(([n, k]) => ['confirmed'].includes(document.querySelector(`section[data-turn="${n}"] [data-proposal][data-kind="${k}"]`)?.dataset.status), [i, kind])
    }
    const j = await ask('你好')
    await shot('unsure', () => page.evaluate(() => { const l = document.querySelector('[data-part="conversation"]'); l.scrollTop = l.scrollHeight }))
    void j
    await page.click('.st-lib-tabs [data-tab="sources"]')
    await ready(page, 'sources')
    await until(() => document.querySelector('[data-who="sources"]')?.dataset.by === 'agent-confirmed' && document.querySelector('[data-part="gates"][data-state="ready"]') !== null)
    await shot('uc3-4')

    // a card gone stale, one that did not take effect
    if (wanted.includes('states')) {
      await page.click('[data-nav="chat"]')
      await ready(page, 'chat')
      await page.fill('textarea[data-field="message"]', '把 AI Agent 工具的每轮上限改成 50，再给中国时尚上市公司加一个运动品牌的来源。')
      await page.click('[data-action="send"] button')
      await until(() => document.querySelectorAll('[data-part="conversation"] [data-row="agent"]:last-of-type [data-proposal]').length === 2)
      await idle()
      await page.evaluate(id => window.streams.setActiveLibrary(id), ids.agent)
      await page.evaluate(() => window.streams.setRoundCap(60))
      await page.click('[data-part="conversation"] [data-row="agent"]:last-of-type [data-proposal][data-kind="edit_cap"] [data-action="confirm"] button')
      await until(() => document.querySelector('[data-part="conversation"] [data-row="agent"]:last-of-type [data-proposal][data-kind="edit_cap"]')?.dataset.status === 'stale')
      const cfg = join(dirs.fashion, 'streams.json')
      chmodSync(cfg, 0o444)
      try {
        await page.click('[data-part="conversation"] [data-row="agent"]:last-of-type [data-proposal][data-kind="add_source"] [data-action="confirm"] button')
        await until(() => ['failed', 'confirmed'].includes(document.querySelector('[data-part="conversation"] [data-row="agent"]:last-of-type [data-proposal][data-kind="add_source"]')?.dataset.status))
      } finally { chmodSync(cfg, 0o644) }
      await shot('states', toEnd)
    }
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
  return taken
}

try {
  for (const theme of themes) {
    const taken = await run(theme, PLANS[theme] ?? ALL)
    process.stdout.write(`${JSON.stringify({ theme, taken }, null, 1)}\n`)
  }
} finally {
  server.closeAllConnections()
  server.close()
}
