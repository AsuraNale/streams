// redesign R4b: rewritten for the new 设置 (docs/checks/2026-11-12-r4b/contract.md R4b-4, 「测」; design P17): v2 package I's five groups
// are four parts with four jumps (连接 · 外观与语言 · 库与用量 · 关于); its 主 Agent part and 定时一览 are gone by design (维护者 第 10 题), so
// their tests are replaced by the checks that they are gone; 来源与要求's 「这个库」 is 高级设置's 库文件夹 now (test/ui-advanced.test.mjs
// has it and 移除该库). The tests of 新建库默认存储位置 and of the folders it refuses are v2 package I's, unchanged.
// On the running app: the seeded library registered through settings.json (v1.0's libraryPath → the registry), the connections
// faked, the folder dialog answered by STREAMS_DEV_CHOOSE_FOLDER (a folder outside the app data). 1.1 W7b: v2's main agent is
// gone, and with it its line in 用量 (the total is the libraries').
//   - four parts in order with the four jumps; no 主 Agent part, no 定时一览, nothing of the current library; each connection row two
//     model slots, 测试连接, 设为当前连接 (not on the current one), 配置 on the API row; the sentence under the rows;
//   - 库与用量: 新建库默认存储位置 (the default → 更改… → written → 恢复默认), the refused folders; 本月用量合计 = each library,
//     the two sides equal, each library's number its own usage file's; no line of a main agent;
//   - 关于: the version, 检查更新, 由 Starry Digital 开发, 许可证与致谢; ▾ 高级 folded: 显示开发者信息, 复制诊断信息 (the one entry of the
//     app: the banner's is gone), 打开运行记录文件夹.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { fmt } from '../src/renderer/lib/format.js'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { worldSession } from './support/seed.mjs'

const here = tempDir('st-settings-i-')
after(() => removeTree(here, { waitMs: 5000 }))
const s = worldSession({
  kind: 'seeded',
  waitFor: 'settings',
  prepare: world => { mkdirSync(join(world.root, 'roots')) },
  settings: world => ({ libraryPath: world.library }),
  env: world => ({
    STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'roots'),
    STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'default-libraries'), STREAMS_START_SCREEN: 'settings',
  }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const click = sel => s.page.click(`${sel} button`)
const settingsText = () => readFileSync(join(s.world.appData, 'settings.json'), 'utf8')
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const registry = () => JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8'))
const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)


test('R4b-4 four parts in the design\'s order with the four jumps on top; 主 Agent and 定时一览 are gone; the one sentence under the connections; nothing of the current library', async () => {
  await until(() => document.querySelector('[data-group="library"] [data-part="library-root"] [data-root-path]')?.dataset.rootPath !== '' && document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3)
  const groups = await s.page.evaluate(() => [...document.querySelectorAll('main[data-screen="settings"] [data-group]')].map(g => [g.dataset.group, g.querySelector('.section-label').textContent, [...g.querySelectorAll(':scope > .st-set-group__body > [data-part]')] /* 1.1.2: a group's parts on one panel */.map(p => p.dataset.part)]))
  assert.deepEqual(groups, [
    ['connection', SETTINGS.groups.connection, ['connections']],
    ['look', SETTINGS.groups.look, ['theme', 'appearance', 'language']],
    ['library', SETTINGS.groups.library, ['library-root', 'source-auth', 'usage']],  // 1.1.1 P9: 来源授权 between them
    ['about', SETTINGS.about, ['about', 'advanced']],
  ])
  const jumps = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="jumps"] [data-jump]')].map(j => [j.dataset.jump, j.textContent]))
  assert.deepEqual(jumps, [['connection', SETTINGS.groups.connection], ['look', SETTINGS.groups.look], ['library', SETTINGS.groups.library], ['about', SETTINGS.groups.about]])
  const gone = await s.page.evaluate(() => ['[data-part="agent"]', '[data-group="agent"]', '[data-part="schedules"]', '[data-schedule-row]', '[data-part="library"]', '[data-library-path]', '[data-action="rebuild"]', '[data-part="setup"]', '[data-action="open-chat"]']
    .filter(q => document.querySelector(`main[data-screen="settings"] ${q}`) !== null))
  assert.deepEqual(gone, [])
  const text = await s.page.evaluate(() => document.querySelector('main[data-screen="settings"]').textContent)
  for (const word of ['定时一览', '会话', '缩写']) assert.equal(text.includes(word), false, word)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-group="connection"] [data-part="agent-uses"]')?.textContent), SETTINGS.conn.agentUses)
  // each connection row: two model slots, 测试连接; the current one 当前使用, the others 设为当前连接; 配置 on the API row
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-connection]')].map(r => [r.dataset.connection, r.querySelectorAll('select').length, [...r.querySelectorAll('[data-action]')].map(a => a.dataset.action).filter(a => !a.startsWith('login')), r.querySelector('[data-part="in-use"]') !== null]))
  assert.deepEqual(rows.map(r => r[0]), ['claude-code', 'codex', 'api'])
  for (const [kind, selects, actions, inUse] of rows) {
    assert.equal(selects, 2, `${kind}: 主模型 and 核验模型`)
    assert.ok(actions.includes('probe'), `${kind}: 测试连接`)
    assert.equal(actions.includes('use-connection'), !inUse, `${kind}: 设为当前连接 unless it is the current one`)
    assert.equal(actions.includes('setup-key'), kind === 'api', `${kind}: 配置 only on the API row`)
  }
  // a jump: the page scrolls and the part comes into view (control: 关于 is below the fold at first)
  const inView = id => s.page.evaluate(g => { const e = document.querySelector(`[data-group="${g}"]`).getBoundingClientRect(); const b = document.querySelector('.st-main__body').getBoundingClientRect(); return e.top >= b.top - 1 && e.top < b.bottom - 40 }, id)
  assert.equal(await inView('about'), false, 'control: not in view before the jump')
  await s.page.click('[data-part="jumps"] [data-jump="about"]')
  await until(() => { const e = document.querySelector('[data-group="about"]').getBoundingClientRect(); const b = document.querySelector('.st-main__body').getBoundingClientRect(); return e.top >= b.top - 1 && e.top < b.bottom - 40 })
  await s.page.click('[data-part="jumps"] [data-jump="connection"]')
})

test('R4b-4 库与用量: 本月用量合计 = each library, the two sides equal, each library the number its usage file has; no line of a main agent', async () => {
  const month = new Date().toISOString().slice(0, 7)
  const regs = registry().libraries
  const total = core.usageTotal(regs.map(l => l.path), { month })
  assert.ok(total.calls > 0, `control: the seeded library's run made calls this month (${total.calls})`)
  await until(n => document.querySelector('[data-part="usage"]')?.dataset.calls === String(n), total.calls)
  const shown = await s.page.evaluate(() => ({
    total: Number(document.querySelector('[data-part="usage"]').dataset.calls),
    totalText: document.querySelector('[data-part="usage-total"]').textContent,
    sum: Number(document.querySelector('[data-part="usage-sum"]').dataset.sum),
    libs: [...document.querySelectorAll('[data-usage-library]')].map(e => [e.dataset.usageLibrary, Number(e.dataset.calls), Number(e.dataset.selfCheck)]),
    agent: document.querySelector('[data-usage-agent]') !== null,
    line: document.querySelector('[data-part="usage-sum"]').textContent,
  }))
  assert.equal(shown.totalText, fmt(SETTINGS.usage.total, { calls: total.calls }))
  assert.equal(shown.total, shown.sum, 'the two sides of the sum are equal')
  assert.equal(shown.total, shown.libs.reduce((n, l) => n + l[1], 0), 'the total is the libraries\' calls')
  assert.equal(shown.agent, false, 'no line of a main agent')
  assert.equal(shown.libs.length, regs.length)
  for (const [id, calls, selfCheck] of shown.libs) {
    const path = regs.find(l => l.id === id).path
    const u = core.readUsage(path, { month })
    assert.equal(calls, u.calls, `${id}: the number its usage file has`)
    assert.equal(selfCheck, u.byPurpose.probe ?? 0, `${id}: its 运行前自检 calls`)
  }
  assert.ok(shown.line.startsWith('= '), shown.line)
})

test('R4b-4 关于: the version, 检查更新, Starry Digital, 许可证与致谢; ▾ 高级 folded: 显示开发者信息 · 复制诊断信息 · 打开运行记录文件夹 — 复制诊断信息 only here', async () => {
  const about = await s.page.evaluate(() => { const a = document.querySelector('[data-part="about"]'); return { version: a.querySelector('[data-version]') !== null, check: a.querySelector('[data-update-action="check"]') !== null, made: a.querySelector('[data-part="made-by"]')?.textContent, licenses: a.querySelector('[data-action="licenses"]') !== null } })
  assert.deepEqual(about, { version: true, check: true, made: SETTINGS.madeBy, licenses: true })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="advanced"]').open), false, '高级 is folded')
  // 复制诊断信息: one entry on the whole page, in 关于 › 高级
  const entries = await s.page.evaluate(t => [...document.querySelectorAll('button')].filter(b => b.textContent.includes(t)).map(b => b.closest('[data-part="advanced"]') !== null), SETTINGS.copyDiagnostics)
  assert.deepEqual(entries, [true])
  await s.page.evaluate(() => { document.querySelector('[data-part="advanced"]').open = true })
  const clip = join(s.world.appData, 'logs', 'clipboard.txt')
  assert.equal(existsSync(clip), false, 'control: nothing copied yet')
  await click('[data-part="advanced"] [data-action="copy-diagnostics"]')
  await until(t => document.querySelector('[data-part="diagnostics-note"]')?.textContent === t, SETTINGS.copied)
  assert.ok(existsSync(clip), 'a test run writes the diagnostics to logs\\clipboard.txt instead of the clipboard')
  await click('[data-part="advanced"] [data-action="open-logs"]')
  const want = `not opened in a test run: ${join(s.world.library, '_pipeline', 'logs')}`
  const end = Date.now() + 20_000
  while (Date.now() < end && !readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8').includes(want)) await new Promise(res => setTimeout(res, 100))
  assert.ok(readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8').includes(want), 'the run-log folder asked for')
  // and no other page of the app calls copyDiagnostics (the banner's went in R4b)
  const callers = readdirSync(join(DESKTOP_DIR, 'src', 'renderer', 'screens')).filter(f => f.endsWith('.js') && /call\('copyDiagnostics'\)/.test(readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'screens', f), 'utf8')))
  assert.deepEqual(callers, ['settings.js'])
})

test('新建库默认放在: the default place → 换一个文件夹… (the hook) → written → 恢复默认 → null again', async () => {
  const def = join(s.world.root, 'default-libraries')
  const roots = join(s.world.root, 'roots')
  await until(p => document.querySelector('[data-part="library-root"] [data-root-path]')?.dataset.rootPath === p, def)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="library-root"] [data-root-default]').dataset.rootDefault), 'true')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="reset-root"] button').disabled), true, 'already the default')
  assert.equal(JSON.parse(settingsText()).libraryRoot ?? null, null)
  await click('[data-action="change-root"]')
  await until(p => document.querySelector('[data-part="library-root"] [data-root-path]')?.dataset.rootPath === p, roots)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="library-root"] [data-root-default]').dataset.rootDefault), 'false')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-root-note]')?.dataset.rootNote), 'saved')
  assert.equal(JSON.parse(settingsText()).libraryRoot, roots)
  assert.deepEqual((await bridge('getLibraryRoot')).data, { path: roots, isDefault: false })
  await click('[data-action="reset-root"]')
  await until(p => document.querySelector('[data-part="library-root"] [data-root-path]')?.dataset.rootPath === p, def)
  assert.equal(JSON.parse(settingsText()).libraryRoot, null)
})

test('refused: a relative path, the app-data folder, a folder inside it, not a string (bad_arguments, settings.json byte for byte the same)', async () => {
  const before = settingsText()
  for (const bad of ['libs', '..\libs', s.world.appData, join(s.world.appData, 'libraries'), join(s.world.appData.toUpperCase(), 'x'), 3, '']) {
    assert.deepEqual(await bridge('setLibraryRoot', bad), { ok: false, error: { code: 'bad_arguments' } }, String(bad))
  }
  assert.equal(settingsText(), before, 'nothing written')
  assert.equal((await bridge('setLibraryRoot', join(s.world.root, 'roots'))).ok, true, 'control: a folder outside the app data is taken')
  assert.equal((await bridge('setLibraryRoot', null)).ok, true)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})

// the system's dialog answering a folder inside the app data: refused, and the page says why
const b = worldSession({
  kind: 'empty',
  waitFor: 'settings',
  prepare: world => { mkdirSync(join(world.appData, 'inside')) },
  settings: world => ({ libraryPath: world.library }),
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.appData, 'inside'), STREAMS_START_SCREEN: 'settings' }),
})

test('换一个文件夹… answered with a folder inside the app data: 「这个文件夹不能用」, settings.json unchanged, still the default', async () => {
  await b.page.waitForFunction(() => document.querySelector('[data-part="library-root"] [data-root-default="true"]') !== null, null, POLL)
  const before = readFileSync(join(b.world.appData, 'settings.json'), 'utf8')
  await b.page.click('[data-action="change-root"] button')
  await b.page.waitForFunction(() => document.querySelector('[data-root-note]') !== null, null, POLL)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-root-note]').dataset.rootNote), 'bad')
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-root-note]').textContent), SETTINGS.root.bad)
  assert.equal(readFileSync(join(b.world.appData, 'settings.json'), 'utf8'), before)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-part="library-root"] [data-root-default]').dataset.rootDefault), 'true')
  assert.deepEqual(b.errors, [])
})
