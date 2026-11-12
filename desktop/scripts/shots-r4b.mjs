#!/usr/bin/env node
// Pictures of the real window for redesign R4b (docs/checks/2026-11-12-r4b/contract.md 「测」): Playwright drives the pinned
// Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under the OS temp folder (removed
// after): the shelf's three libraries (test/support/seed.mjs seedShelf: the seeded one with a real round of the core over a feed on
// this machine), every connection the fake one (STREAMS_DEV_CONNECTION=fake: nothing real is called), the detection stood in for
// (STREAMS_DEV_DETECT), the main agent scripted (STREAMS_DEV_AGENT_SCRIPT: one turn, so 设置's sum has its line), new libraries'
// default place a folder of the world (STREAMS_DEV_LIBRARY_ROOT: never the real Documents). The source typed in place is a feed
// on this machine. The theme and the appearance are changed the way 设置 changes them.
//   node scripts/shots-r4b.mjs                 all → docs/shots/2026-11-12-r4b/
//   --out <folder>   --only p14|p15|p17
// Pictures (<theme>-<appearance>-<page>.png; the pages are the design's 03-页面稿):
//   research-light-p14      来源与要求 scrolled to 来源: a source typed and tried in place (已识别为 RSS · 正常 · n 条 · 添加 · 取消), one row's
//                           「⋯」 open (测试抓取 · 暂停 · 修改地址 · 删除), the topics with one opened (its keywords, 编辑关键词 · 删除主题),
//                           定时与上限; research-light-p14-top: the same page from its top (要求: 库名称, 追踪要求, 严格程度 标准, 保存)
//   precision-light-p14 · monoline-light-p14 · research-dark-p14   the page's top in three more looks
//   research-light-p15      高级设置: ← 返回来源与要求, the three folds, 评分环节's seven nodes, 提示词, 通过阈值, 材料, 校验规则 with the
//                           built-in ones locked; research-light-p15-log: scrolled to 变更记录 and 库文件夹
//   research-light-p21      移除「…」？ over 高级设置 (the template's dialog: what it does, the path, 取消 · 移除)
//   research-light-p17      设置 from its top: the four jumps, 连接 (three rows, two model slots, 当前使用 / 设为当前连接 / 配置, 测试连接),
//                           外观与语言; research-light-p17-end: scrolled to 库与用量 and 关于 (▾ 高级 open)
//   precision-light-p17 · monoline-light-p17 · research-dark-p17   设置's top in three more looks
//   research-light-p18      输入 API key over 设置 · research-light-p19   许可证与致谢 over 设置
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedShelf } from '../test/support/seed.mjs'
import { THEME_TEMPLATE } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-12-r4b'))
const ONLY = value('--only') ?? null
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
mkdirSync(OUT, { recursive: true })
const report = []
const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const { startFakeServer } = await import(pathToFileURL(join(REPO_DIR, 'core', 'test', 'support', 'fake-server.mjs')).href)
const { rssWith } = await import(pathToFileURL(join(REPO_DIR, 'core', 'test', 'support', 'feeds.mjs')).href)

const BRIEF = '追踪 AI agent 长期记忆的评测与对比数据：基准与评测方法、实验结果与消融、不同记忆方案的对比。框架作者的工程笔记、经验谈不要；营销稿、产品通稿不要。'

/** The corner's plan usage as the design shows it (STREAMS_DEV_QUOTA: read at start, nothing real is read). */
function quotaFile(root) {
  const file = join(root, 'quota.json')
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
    { id: 'five_hour', usedPercent: 8, resetsAt: now + 4 * 3600 },
    { id: 'seven_day', usedPercent: 26, resetsAt: now + 3 * 86400 },
  ] } }))
  return file
}

/** One run of the app on a fresh shelf world, started on `start`. */
async function session({ start }, work) {
  const root = tempDir('st-shots-r4b-')
  let app = null
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    const shelf = await seedShelf(world)
    // the seeded library as the design's: its brief, keywords on its topics, a change or two of its history
    core.saveBrief(world.library, BRIEF)
    core.saveStrictness(world.library, 'standard')
    core.updateTopic(world.library, 'agent 记忆', { keywords: ['agent memory', 'long-term memory', 'MemGPT', '评测'] })
    const detectFile = join(root, 'detect.json')
    writeFileSync(detectFile, JSON.stringify({ 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } }), 'utf8')
    const script = join(root, 'agent-script.json')
    writeFileSync(script, JSON.stringify([{ reply: '好的，已记下。' }]), 'utf8')
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_DETECT: detectFile, STREAMS_DEV_LIBRARY: '',
      STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_DEV_QUOTA: quotaFile(root), STREAMS_DEV_AGENT_SCRIPT: script, STREAMS_START_SCREEN: start,
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', connections: { active: 'claude-code' }, panel: { open: true, tab: start === 'sources' ? 'files' : 'progress' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, start)
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const look = async (theme, appearance) => {
      for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
        const r = await page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
        if (!r.ok) throw new Error(`${m}(${v}): ${JSON.stringify(r)}`)
      }
      await until(([t, a, cls]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === a && document.body.className === cls
        && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
    }
    const shot = async (name, { blur = true } = {}) => {
      if (blur) await page.evaluate(() => document.activeElement?.blur?.())
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const file = join(OUT, `${name}.png`)
      for (let i = 0; ; i++) {
        try { await page.screenshot({ path: file, timeout: 20_000 }); break } catch (err) {
          if (i === 2) throw err
          await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })
          await page.waitForTimeout(500)
        }
      }
      report.push(file)
      process.stdout.write(`${file}\n`)
    }
    const scrollTo = async (sel, offset = 12) => page.evaluate(([s, o]) => {
      const body = document.querySelector('.st-main__body')
      const el = document.querySelector(s)
      if (body && el) body.scrollTop = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - o
    }, [sel, offset])
    await work({ page, until, shot, look, scrollTo, world, shelf })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

const want = id => ONLY === null || ONLY === id
const LOOKS = [['precision', 'light'], ['monoline', 'light'], ['research', 'dark']]

if (want('p14')) {
  const srv = await startFakeServer()
  try {
    const feed = srv.route('/memory.xml', { body: rssWith([{ title: 'Launch HN: 给 agent 用的长期记忆评测集', url: 'https://hn.test/1' }]) })
    await session({ start: 'sources' }, async t => {
      const { page, until } = t
      await until(() => document.querySelector('[data-part="brief"][data-state="ready"]') && document.querySelectorAll('[data-part="sources"] [data-row]').length > 0)
      await t.look('research', 'light')
      await t.shot('research-light-p14-top')
      for (const [theme, appearance] of LOOKS) {
        await t.look(theme, appearance)
        await t.shot(`${theme}-${appearance}-p14`)
      }
      await t.look('research', 'light')
      await page.fill('[data-field="source"]', feed)
      await page.press('[data-field="source"]', 'Enter')
      await until(() => document.querySelector('[data-part="adding"]')?.dataset.fetchState === 'ok')
      const first = await page.evaluate(() => document.querySelector('[data-part="sources"] [data-row]').dataset.row)
      await page.click(`[data-row="${first}"] [data-action="row-more"] button`)
      await until(() => document.querySelector('[data-part="row-menu"]') !== null)
      const topic = await page.evaluate(() => document.querySelector('[data-topic-row]').dataset.topicRow)
      await page.evaluate(n => document.querySelector(`[data-topic-row="${CSS.escape(n)}"]`).click(), topic)
      await until(() => document.querySelector('[data-part="topic-detail"]') !== null)
      await t.scrollTo('[data-part="sources"]', 16)
      await t.shot('research-light-p14', { blur: false })
    })
  } finally {
    srv.close()
  }
}

if (want('p15')) {
  await session({ start: 'sources' }, async t => {
    const { page, until } = t
    await until(() => document.querySelector('[data-part="brief"][data-state="ready"]') !== null)
    // a little history, written the way the page writes it (by you): the level, a topic's keywords, the cap
    await page.evaluate(async () => {
      await window.streams.setStrictness('strict')
      await window.streams.updateTopic('agent 记忆', { keywords: ['agent memory', 'long-term memory', 'MemGPT', '评测', 'LoCoMo'] })
      await window.streams.setRoundCap(30)
    })
    await page.click('[data-action="go-advanced"]')
    await until(() => document.querySelector('[data-part="gates"][data-state="ready"]') && document.querySelector('[data-part="changes"][data-state="ready"]'))
    await t.look('research', 'light')
    await t.shot('research-light-p15')
    await t.scrollTo('[data-part="changes-fold"]', 16)
    await t.shot('research-light-p15-log')
    await page.click('[data-action="remove-library"] button')
    await until(() => document.querySelector('dialog[data-dialog="remove-library"][open]') !== null)
    await t.shot('research-light-p21', { blur: false })
  })
}

if (want('p17')) {
  await session({ start: 'settings' }, async t => {
    const { page, until } = t
    await page.evaluate(() => window.streams.agentSend('你好'))
    await until(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3 && document.querySelector('[data-part="usage-sum"]') !== null)
    await t.look('research', 'light')
    await t.shot('research-light-p17')
    for (const [theme, appearance] of LOOKS) {
      await t.look(theme, appearance)
      await t.shot(`${theme}-${appearance}-p17`)
    }
    await t.look('research', 'light')
    await page.evaluate(() => { document.querySelector('[data-part="advanced"]').open = true })
    await t.scrollTo('[data-group="library"]', 16)
    await t.shot('research-light-p17-end')
    await page.evaluate(() => { document.querySelector('.st-main__body').scrollTop = 0 })
    await page.click('[data-connection="api"] [data-action="setup-key"] button')
    await until(() => document.querySelector('dialog[data-dialog="api-key"][open]') !== null)
    await t.shot('research-light-p18', { blur: false })
    await page.click('[data-dialog="api-key"] [data-action="cancel-key"] button')
    await until(() => document.querySelector('[data-dialog="api-key"]') === null)
    await page.click('[data-part="about"] [data-action="licenses"] button')
    await until(() => document.querySelector('dialog[data-dialog="licenses"][open] [data-part="components"]') !== null)
    await t.shot('research-light-p19', { blur: false })
  })
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
