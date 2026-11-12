// 新建库's one-page form in the main process (redesign R4a, contract R4a-3 / R4a-4; src/main/services/new-library.mjs; docs/desktop.md
// §4.16) in plain Node, on the real library and schedule services (a pipeline stand-in that only records which library's round
// it was asked to start) and a world in the OS temp folder (the default place of a new library is a folder of that world: never
// the real Documents). Each rule first gets the input made to break it:
//   - the defaults: 标准, the three levels' numbers, the app's schedule, the pipeline's cap, the starter packs as the core keeps them
//   - an empty brief (or one of spaces) is refused and nothing is made; the bridge's own check refuses a form of other keys
//   - 仅创建: made, registered, the current library, 标准's thresholds, the form's sources / topics / schedule; nothing queued,
//     no round; 创建并运行: its first run queued once, why 'first' (建库后的第一轮)
//   - the three levels write their two numbers
//   - a folder of the user's .md files is opened as a library: every one of them byte for byte as it was
//   - a folder holding a library already: opened as it is (streams.json byte for byte, no run even when asked); other things: refused
//   - O15: the form's library and a confirmed card's, from the same name and brief and the app's schedule, have the same pipeline,
//     schedule and cap
//   - the setup records: library · pack · sources · trial · schedule, and 首次打开's connection copied with its time
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createNewLibraryService } from '../src/main/services/new-library.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { createProposalsService } from '../src/main/services/proposals.mjs'
import { checkArgs } from '../src/main/bridge-methods.mjs'
import { createLibrary, listRounds, readStrictness } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedImportFolder } from './support/seed.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const CLOCK = new Date(Date.UTC(2026, 10, 12, 16, 0, 0))
const now = () => CLOCK
const config = dir => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'))
const lines = path => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(l => l.trim() !== '').map(l => JSON.parse(l)) : [])
function tree(dir) {
  const out = {}
  const walk = d => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p)
      else out[relative(dir, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir)
  return out
}

function recordingPipeline() {
  const p = { order: [], running: null }
  p.isRunning = () => p.running !== null
  p.runningLibrary = () => p.running
  p.startRoundIn = async entry => { p.order.push(entry.id); p.running = entry.id; return { started: true, roundId: `d-${p.order.length}` } }
  return p
}

/** The library, schedule and new-library services on a world whose settings say the app's schedule is 07:45, off. */
function setup({ settings = {} } = {}) {
  const w = testWorld('st-new-library-')
  worlds.push(w)
  writeFileSync(w.settingsFile, `${JSON.stringify({ schedule: { enabled: false, time: '07:45' }, ...settings })}\n`)
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now })
  const pipelineStub = recordingPipeline()
  const schedule = createScheduleService({ settingsFile: w.settingsFile, library, pipeline: pipelineStub, emit: w.emit, log: w.log, now, timers: { set: () => 0, clear: () => {} } })
  const root = join(w.root, 'libs')
  const queued = []
  const scheduler = { queueRound: (entry, why) => { queued.push([entry.id, why]); return schedule.queueRound(entry, why) } }
  const service = createNewLibraryService({ library, scheduler: () => scheduler, settingsFile: w.settingsFile, libraryRoot: () => root, locale: () => w.locale, log: w.log, now })
  return { w, library, schedule, pipelineStub, h: service.handlers, root, queued }
}

const FORM = (extra = {}) => ({
  name: '中国电动车', brief: '追踪中国新能源车的月度数据。不要软文。', strictness: 'standard', topics: ['月度数据'],
  sources: [{ name: 'ev-news', kind: 'rss', url: 'https://ev.test/feed.xml', topic: '月度数据' }, { name: 'hn-ev', kind: 'hn', query: 'EV sales' }],
  packId: null, schedule: { enabled: false, time: '07:45' }, cap: 120, run: false, ...extra,
})

test('R4a defaults: 标准, the three levels\' numbers, the app\'s schedule, the pipeline\'s cap, the place, the packs as the core keeps them; a folder chosen before is forgotten', async () => {
  const { w, h, library, root } = setup()
  mkdirSync(join(w.root, 'elsewhere'))
  w.dialogAnswers.push(join(w.root, 'elsewhere'))
  await library.handlers.chooseLibraryFolder()
  assert.notEqual(library.chosen(), null, 'control: a folder chosen')
  const d = h.getNewLibraryDefaults()
  assert.equal(library.chosen(), null, 'the form opened: forgotten')
  assert.equal(d.strictness, 'standard')
  assert.deepEqual(d.levels, { loose: { relevance: 0.4, substance: 0.5 }, standard: { relevance: 0.5, substance: 0.6 }, strict: { relevance: 0.7, substance: 0.7 } })
  assert.deepEqual(d.schedule, { enabled: false, time: '07:45' })
  assert.equal(d.cap, 120)
  assert.equal(d.root, root)
  const pack = d.packs.find(p => p.id === 'ai-agent-tools')
  assert.equal(pack.sources.find(s => s.name === 'hn-agent-memory').min_points, 50, 'a pack source as the core keeps it (packView leaves min_points out)')
  assert.ok(pack.sources.every(s => pack.topics.includes(s.topic)), 'each source names one of the pack\'s topics by its name')
})

test('R4a the folder: <root>\\<name> (empty while not there); the one 更改… chose instead', async () => {
  const { w, h, library, root } = setup()
  assert.deepEqual(h.newLibraryFolder('AI: 记忆?'), { path: join(root, 'AI- 记忆-'), state: 'empty', chosen: false })
  const vault = join(w.root, 'vault')
  seedImportFolder(vault)
  w.dialogAnswers.push(vault)
  await library.handlers.chooseLibraryFolder()
  const f = h.newLibraryFolder('ignored')
  assert.deepEqual([f.path, f.state, f.chosen, f.mdCount], [vault, 'importable', true, 6])
})

test('R4a an empty brief is refused before anything is made (the service and the bridge); so is a form with other keys', () => {
  const { h, root } = setup()
  for (const brief of ['', '   ']) {
    assert.throws(() => h.createNewLibrary(FORM({ brief })), err => err.code === 'bad_arguments', JSON.stringify(brief))
    assert.equal(existsSync(join(root, '中国电动车')), false, 'nothing made')
  }
  assert.throws(() => h.createNewLibrary(FORM({ name: ' ' })), err => err.code === 'bad_arguments')
  assert.throws(() => h.createNewLibrary(FORM({ strictness: 'medium' })), err => err.code === 'bad_arguments')
  assert.throws(() => h.createNewLibrary(FORM({ sources: [{ name: 'x', kind: 'rss', url: 'https://a.test/f', topic: '没有的主题' }] })), err => err.code === 'bad_arguments')
  assert.equal(existsSync(root), false)
  // the bridge's own check: the form's keys and shapes
  assert.doesNotThrow(() => checkArgs('createNewLibrary', [FORM()]))
  assert.throws(() => checkArgs('createNewLibrary', [{ ...FORM(), folder: 'C:\\x' }]), err => err.code === 'bad_arguments')
  assert.throws(() => checkArgs('createNewLibrary', [{ ...FORM(), run: 'yes' }]), err => err.code === 'bad_arguments')
  assert.throws(() => checkArgs('createNewLibrary', [{ ...FORM(), name: '' }]), err => err.code === 'bad_arguments')
})

test('R4a 仅创建: made at <root>\\<name>, registered and current, 标准 0.5 / 0.6, the form\'s brief, topics, sources, schedule; nothing queued, no round', async () => {
  const { h, library, schedule, pipelineStub, root, queued } = setup()
  const r = h.createNewLibrary(FORM({ run: false }))
  const dir = join(root, '中国电动车')
  assert.equal(r.made, 'created')
  assert.equal(r.queued, null)
  assert.equal(r.library.path, dir)
  const row = library.handlers.listLibraries().find(l => l.id === r.library.libraryId)
  assert.deepEqual([row.name, row.active], ['中国电动车', true])
  const c = config(dir)
  assert.equal(c.brief, '追踪中国新能源车的月度数据。不要软文。')
  assert.deepEqual(c.topics, [{ name: '月度数据', keywords: [] }])
  assert.deepEqual(c.sources.map(s => s.name), ['ev-news', 'hn-ev'])
  assert.deepEqual(c.schedule, { enabled: false, time: '07:45' })
  assert.deepEqual(readStrictness(dir), { level: 'standard', thresholds: { relevance: 0.5, substance: 0.6 } })
  await sleep(0)
  assert.deepEqual(queued, [], '仅创建 queues nothing')
  assert.deepEqual(pipelineStub.order, [])
  assert.deepEqual(schedule.handlers.getQueue().waiting, [])
  assert.equal(schedule.handlers.getQueue().running, null)
  assert.deepEqual(listRounds(dir, 5), [])
  // the user's own: changes.jsonl by you for what the form set
  assert.deepEqual(lines(join(dir, '_pipeline', 'changes.jsonl')).map(l => [l.field, l.by]).sort(), [['brief', 'you'], ['schedule', 'you'], ['sources', 'you'], ['thresholds', 'you'], ['topics', 'you']])
})

test('R4a 创建并运行: the first run in the queue once, why first (建库后的第一轮); the new library is the current one', async () => {
  const { h, schedule, pipelineStub, queued } = setup()
  const r = h.createNewLibrary(FORM({ name: '电池', run: true }))
  assert.equal(r.made, 'created')
  assert.deepEqual(queued.map(q => q[0]), [r.library.libraryId])
  assert.equal(r.queued.queued, true)
  await sleep(0)
  assert.deepEqual(pipelineStub.order, [r.library.libraryId], 'started (nothing else was running)')
  assert.deepEqual([schedule.handlers.getQueue().running?.libraryId, schedule.handlers.getQueue().running?.why], [r.library.libraryId, 'first'])
})

test('R4a 严格程度: each of the three levels writes its two numbers', () => {
  const { h, root } = setup()
  for (const [level, r, s] of [['loose', 0.4, 0.5], ['standard', 0.5, 0.6], ['strict', 0.7, 0.7]]) {
    h.createNewLibrary(FORM({ name: `lib-${level}`, strictness: level }))
    assert.deepEqual(readStrictness(join(root, `lib-${level}`)), { level, thresholds: { relevance: r, substance: s } }, level)
  }
})

test('R4a F57: a folder of the user\'s .md files is opened as a library — every one of them byte for byte as it was', async () => {
  const { w, h, library } = setup()
  const vault = join(w.root, 'vault')
  seedImportFolder(vault)
  const before = tree(vault)
  w.dialogAnswers.push(vault)
  await library.handlers.chooseLibraryFolder()
  const r = h.createNewLibrary(FORM({ name: '我的笔记库' }))
  assert.equal(r.made, 'imported')
  assert.equal(r.library.path, vault)
  const after = tree(vault)
  for (const [rel, hash] of Object.entries(before)) assert.equal(after[rel], hash, `${rel} byte for byte`)
  assert.equal(config(vault).notesDir, '.')
  assert.equal(config(vault).brief, '追踪中国新能源车的月度数据。不要软文。')
  assert.equal(readStrictness(vault).level, 'standard')
  assert.equal(library.chosen(), null, 'the choice is used up')
})

test('R4a a folder that holds a library already: opened as it is (streams.json byte for byte, no run even when asked); other things: refused, nothing made', async () => {
  const { w, h, library, queued } = setup()
  const old = join(w.root, 'old')
  createLibrary(old, { name: 'old' })
  const before = tree(old)
  w.dialogAnswers.push(old)
  await library.handlers.chooseLibraryFolder()
  const r = h.createNewLibrary(FORM({ run: true }))
  assert.deepEqual([r.made, r.queued, r.library.path], ['opened', null, old])
  const now2 = tree(old)
  for (const [rel, hash] of Object.entries(before)) assert.equal(now2[rel], hash, `${rel} byte for byte: nothing of the form written`)
  assert.deepEqual(Object.keys(now2).filter(k => !(k in before)).sort(), ['index.jsonl', 'index.meta.json'], 'only the index an open rebuilds (as every open of a library does)')
  assert.deepEqual(queued, [])
  // other things
  const busy = join(w.root, 'busy')
  mkdirSync(busy)
  writeFileSync(join(busy, 'mine.txt'), 'the user\'s')
  w.dialogAnswers.push(busy)
  await library.handlers.chooseLibraryFolder()
  assert.throws(() => h.createNewLibrary(FORM()), err => err.code === 'open_failed')
  assert.deepEqual(readdirSync(busy), ['mine.txt'])
})

test('R4a O15: the form\'s library and a confirmed card\'s (same name, brief, the app\'s schedule) have the same pipeline, schedule and cap', async () => {
  const { w, h, library, schedule, root } = setup()
  const proposals = createProposalsService({
    appDataDir: w.root, library, scheduler: () => schedule, emit: w.emit, log: w.log, now, libraryRoot: () => join(w.root, 'by-card'),
    fallbackSchedule: () => ({ enabled: false, time: '07:45' }), locale: () => w.locale,
  })
  const card = await proposals.createProposal('create_library', { name: '同一个', brief: '追踪中国新能源车的月度数据。' }, '你想追电动车')
  assert.equal(proposals.handlers.confirmProposal(card.id).status, 'confirmed')
  const d = h.getNewLibraryDefaults()
  h.createNewLibrary(FORM({ name: '同一个', brief: '追踪中国新能源车的月度数据。', topics: [], sources: [], strictness: d.strictness, schedule: d.schedule, cap: d.cap }))
  const byCard = config(card.params.folder)
  const byForm = config(join(root, '同一个'))
  assert.deepEqual(byForm.pipeline, byCard.pipeline, 'the same pipeline: thresholds 标准, cap, every node')
  assert.deepEqual(byForm.schedule, byCard.schedule)
  assert.deepEqual(readStrictness(join(root, '同一个')), readStrictness(card.params.folder))
})

test('R4a the setup records: library · pack · sources · trial · schedule, and 首次打开\'s connection with its time', () => {
  const at = '2026-11-12T15:00:00.000Z'
  const { h, root } = setup({ settings: { setupConnection: { by: 'default', at, detail: 'claude-code' } } })
  h.createNewLibrary(FORM({ name: 'plain', run: false }))
  const s = config(join(root, 'plain')).setup
  assert.deepEqual(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.detail === undefined ? v.by : [v.by, v.detail]])), {
    connection: ['default', 'claude-code'], library: ['default', 'empty'], pack: 'skipped', sources: ['wrote', { removed: 0, added: 2 }], trial: 'skipped',
    schedule: ['default', { enabled: false, time: '07:45' }],
  })
  assert.equal(s.connection.at, at, 'the connection\'s time is 首次打开\'s')
  const d = h.getNewLibraryDefaults()
  const pack = d.packs[0]
  h.createNewLibrary(FORM({ name: 'packed', topics: pack.topics, sources: pack.sources.slice(1), packId: pack.id, schedule: { enabled: true, time: '06:00' }, run: true }))
  const p = config(join(root, 'packed')).setup
  assert.deepEqual([p.pack.by, p.pack.detail, p.sources.by, p.sources.detail, p.trial.by, p.schedule.by], ['chose', pack.id, 'wrote', { removed: 1, added: 0 }, 'chose', 'wrote'])
})
