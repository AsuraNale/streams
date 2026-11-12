// 设置 after v2 package I (contract I2; design P9; screens/settings.js) and 来源与要求's 「这个库」 (screens/sources.js), on the
// running app: the seeded library registered through settings.json (v1.0's libraryPath → the registry), the connections faked,
// the folder dialog answered by STREAMS_DEV_CHOOSE_FOLDER (a folder outside the app data).
//   - the five groups in the design's order: 连接 · 主 Agent · 库 · 外观与语言 · 软件, each with its parts; 「主 Agent 用这条连接的主
//     模型」 under the connections; nothing of the current library on the page;
//   - 主 Agent: getAgentStatus as words (the connection, no session yet, 0 turns, never shortened); after one turn of the main
//     agent (the scripted fake) the page says 1 turn; 「打开和主 Agent 聊」 opens it;
//   - 新建库默认放在: the default place (isDefault) → 「换一个文件夹…」 → the hook's folder, written to settings.json → 「恢复默认」 →
//     null again; refused (bad_arguments, settings.json byte for byte the same): a relative path, the app-data folder, a folder
//     inside it — and a chosen folder inside the app data says so on the page;
//   - 来源与要求's 「这个库」: the folder, 首次设置's record (none for this library), 重建索引, 在资源管理器中显示 (a test run only logs),
//     移除这个库 → asked first; 取消 keeps it; 移除 → the registry no longer has it, every file of the folder is still there
//     (byte for byte), the page goes to 库架.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { SHELL } from '../src/renderer/texts/shell.js'
import { fmt } from '../src/renderer/lib/format.js'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const here = tempDir('st-settings-i-')
const scriptFile = join(here, 'agent-script.json')
writeFileSync(scriptFile, JSON.stringify([{ reply: '好的，我记下了。' }]))
after(() => removeTree(here, { waitMs: 5000 }))
const s = worldSession({
  kind: 'seeded',
  waitFor: 'settings',
  prepare: world => { mkdirSync(join(world.root, 'roots')) },
  settings: world => ({ libraryPath: world.library }),
  env: world => ({
    STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'roots'),
    STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'default-libraries'), STREAMS_DEV_AGENT_SCRIPT: scriptFile, STREAMS_START_SCREEN: 'settings',
  }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const click = sel => s.page.click(`${sel} button`)
const settingsText = () => readFileSync(join(s.world.appData, 'settings.json'), 'utf8')
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const registry = () => JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8'))

function hashTree(dir, base = dir, out = {}) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) hashTree(p, base, out)
    else out[p.slice(base.length + 1).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
  }
  return out
}

test('five groups in the design\'s order, each with its parts; 主 Agent 用这条连接的主模型; nothing of the current library', async () => {
  await until(() => document.querySelector('[data-group="library"] [data-part="library-root"] [data-root-path]') !== null)
  const groups = await s.page.evaluate(() => [...document.querySelectorAll('main[data-screen="settings"] [data-group]')].map(g => [g.dataset.group, g.querySelector('.settings__group-name').textContent, [...g.querySelectorAll(':scope > .settings__group-parts > [data-part]')].map(p => p.dataset.part)]))
  assert.deepEqual(groups, [
    ['connection', SETTINGS.groups.connection, ['connections']],
    ['agent', SETTINGS.groups.agent, ['agent']],
    ['library', SETTINGS.groups.library, ['library-root', 'schedules', 'usage']],
    // v2 package K2: 外观与语言 has 「外观」 (light · dark · system) between the theme and the language. Redesign R1: the theme and
    // the appearance are the template's parts (filters, a field) — no .settings__part of the old layout — so a group's parts
    // are read as its [data-part] children (was :scope .settings__part)
    ['look', SETTINGS.groups.look, ['theme', 'appearance', 'language']],
    ['software', SETTINGS.groups.software, ['about', 'advanced']],
  ])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-group="connection"] [data-part="agent-uses"]')?.textContent), SETTINGS.conn.agentUses)
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="settings"]').querySelectorAll('[data-part="library"], [data-library-path], [data-action="rebuild"], [data-action="new-library"], [data-action="open-folder"], [data-recent], [data-part="setup"]').length), 0)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-group="software"] [data-action="licenses"]') !== null), true)
})

test('主 Agent: the status as words; one turn later the page says 1 turn; 打开和主 Agent 聊 opens it', async () => {
  const st = (await bridge('getAgentStatus')).data
  assert.deepEqual([st.connection, st.turns, st.lastSummaryAt], ['fake', 0, null], 'control: the fake connection, nothing said yet')
  await until(() => document.querySelector('[data-part="agent"] [data-turns]') !== null)
  const read = () => s.page.evaluate(() => { const p = document.querySelector('[data-part="agent"]'); return { conn: p.querySelector('[data-agent-connection]').dataset.agentConnection, session: p.querySelector('[data-session]').dataset.session, turns: p.querySelector('[data-turns]').dataset.turns, turnsText: p.querySelector('[data-turns]').textContent, summary: p.querySelector('[data-summary]').textContent } })
  const before = await read()
  assert.deepEqual(before, { conn: 'fake', session: st.session.live ? 'live' : st.sessionful === false ? 'api' : 'none', turns: '0', turnsText: fmt(SETTINGS.agent.talkLine, { turns: 0, entries: st.entries }), summary: SETTINGS.agent.summaryNone })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="agent"] [data-action="clear-chat"], [data-part="agent"] [data-action="clear"]')), null, 'no 清空对话')
  const r = await bridge('agentSend', '你好')
  assert.equal(r.ok, true, JSON.stringify(r))
  await until(() => document.querySelector('[data-part="agent"] [data-turns]')?.dataset.turns === '1')
  await click('[data-part="agent"] [data-action="open-chat"]')
  await ready(s.page, 'chat')
  await s.page.click('.st-sidebar__footer-button')
  await ready(s.page, 'settings')
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

test('来源与要求 「这个库」: the folder, 首次设置 (none), 重建索引, 在资源管理器中显示 (logged); 移除这个库 asked first, then only the registration goes', async () => {
  const id = registry().active
  assert.ok(id, 'control: a current library')
  await s.page.click('[data-library-row][data-active="true"]')
  await until(() => document.querySelector('.st-lib-tabs') !== null)
  await s.page.click('.st-lib-tabs [data-tab="sources"]')
  await ready(s.page, 'sources')
  await until(() => document.querySelector('[data-part="this-library"] [data-part="setup"]')?.dataset.setup === 'none')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="this-library"] [data-library-path]').dataset.libraryPath), s.world.library)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="this-library"] h2').textContent), SHELL.thisLibrary.title)
  await click('[data-part="this-library"] [data-action="rebuild"]')
  await until(() => document.querySelector('[data-part="this-library"] [data-rebuilt]') !== null)
  const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
  assert.equal(log().includes(`not revealed in a test run: ${s.world.library}`), false, 'control: not asked yet')
  await click('[data-part="this-library"] [data-action="reveal-library"]')
  const end = Date.now() + 20_000
  while (Date.now() < end && !log().includes(`not revealed in a test run: ${s.world.library}`)) await new Promise(r => setTimeout(r, 100))
  assert.ok(log().includes(`not revealed in a test run: ${s.world.library}`))
  const files = hashTree(s.world.library)
  await click('[data-part="this-library"] [data-action="remove-library"]')
  await until(() => document.querySelector('[data-dialog="remove-library"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="remove-library"] .st-dialog__text').textContent), SHELL.thisLibrary.removeDialog.text)
  await click('[data-dialog="remove-library"] [data-action="cancel-remove"]')
  await until(() => document.querySelector('[data-dialog="remove-library"]') === null)
  assert.ok(registry().libraries.some(l => l.id === id), '取消 keeps it')
  await click('[data-part="this-library"] [data-action="remove-library"]')
  await click('[data-dialog="remove-library"] [data-action="confirm-remove"]')
  await ready(s.page, 'shelf')
  assert.equal(registry().libraries.some(l => l.id === id), false, 'no longer registered')
  assert.deepEqual(hashTree(s.world.library), files, 'every file of the folder is still there, byte for byte')
  assert.ok(Object.keys(files).length > 5, `control: the folder held files (${Object.keys(files).length})`)
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
