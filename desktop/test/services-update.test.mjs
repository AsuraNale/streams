// The update's 「开始更新」 (services/update.mjs install) with stand-ins for GitHub, the download and the start of the setup
// program — no Electron, no network: the setup program is started with the five switches and then /STWAITPID=<the main
// process's id>, the handshake installer/setup/streams.iss waits on (docs/installer.md §七). The arguments are written out
// here as the setup program reads them, not taken from the module. STREAMS_UPDATE_MODULE may name a copy of
// services/update.mjs (in a copy of desktop/src/main/services/) to run the same checks on: a copy without the switch fails.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const MODULE = process.env.STREAMS_UPDATE_MODULE ? pathToFileURL(process.env.STREAMS_UPDATE_MODULE).href : new URL('../src/main/services/update.mjs', import.meta.url).href
const { createUpdateService, setupArgs } = await import(MODULE)

const FIVE = ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/STRELAUNCH=1']
const VERSION = '9.9.9'
const NAME = `Streams-${VERSION}-setup.exe`
const DATA = Buffer.from('not a setup program: the bytes the stand-in download serves\n')
const SHA = createHash('sha256').update(DATA).digest('hex')
const folders = []
after(() => { for (const d of folders) removeTree(d, { waitMs: 5000 }) })

/** A service whose release is downloaded and checked (state ready), with a recording spawn. */
async function readyService(more = {}) {
  const dir = tempDir('st-update-test-')
  folders.push(dir)
  const spawned = []
  const quits = []
  const lines = []
  const release = {
    tag_name: `v${VERSION}`, name: `流息 ${VERSION}`, draft: false, prerelease: false, published_at: '2026-11-04T00:00:00Z', body: '',
    assets: [{ name: NAME, size: DATA.length, digest: `sha256:${SHA}`, browser_download_url: `https://github.com/AsuraNale/streams/releases/download/v${VERSION}/${NAME}` }],
  }
  const service = createUpdateService({
    dir, current: '1.0.0', canUpdate: true, quitDelayMs: 0,
    fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify(release) }),
    openImpl: async () => {
      const body = new PassThrough()
      setImmediate(() => { body.complete = true; body.end(DATA) })
      return { status: 200, headers: { 'content-length': String(DATA.length) }, body }
    },
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options })
      const child = new EventEmitter()
      child.pid = 777
      child.unref = () => {}
      setImmediate(() => child.emit('spawn'))
      return child
    },
    quit: () => quits.push(Date.now()),
    log: line => lines.push(line),
    ...more,
  })
  assert.equal((await service.check()).state, 'available')
  await service.download()
  await service.settled()
  assert.equal(service.snapshot().state, 'ready', 'control: downloaded and checked')
  return { service, spawned, quits, lines, dir }
}

test('开始更新 starts the setup program with the five switches, then /STWAITPID=<the main process id> — the given one', async () => {
  const { service, spawned, quits, lines } = await readyService({ pid: 4242 })
  assert.deepEqual(await service.install(), { ok: true })
  assert.equal(spawned.length, 1)
  assert.deepEqual(spawned[0].args, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/STRELAUNCH=1', '/STWAITPID=4242'])
  assert.match(spawned[0].command, new RegExp(`${NAME.replace(/\./g, '\\.')}$`))
  assert.deepEqual({ detached: spawned[0].options.detached, stdio: spawned[0].options.stdio, windowsHide: spawned[0].options.windowsHide }, { detached: true, stdio: 'ignore', windowsHide: true })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(quits.length, 1, 'then the app quits')
  assert.ok(lines.some(l => l.includes('/STWAITPID=4242')), 'the log line names the switch')
})

test('without a pid given, the switch carries this process\'s own id; exactly one /STWAITPID, the last argument, digits only', async () => {
  const { service, spawned } = await readyService()
  await service.install()
  const args = spawned[0].args
  assert.deepEqual(args.slice(0, 5), FIVE, 'the other arguments as before')
  const wait = args.filter(a => /^\/STWAITPID=/i.test(a))
  assert.equal(wait.length, 1)
  assert.equal(args.at(-1), wait[0])
  assert.match(wait[0], /^\/STWAITPID=[1-9]\d*$/)
  assert.equal(wait[0], `/STWAITPID=${process.pid}`)
  assert.equal(args.length, 6)
})

test('setupArgs: a process id only (a positive integer); anything else is refused', () => {
  assert.deepEqual(setupArgs(8), [...FIVE, '/STWAITPID=8'])
  for (const bad of [0, -4, 1.5, Number.NaN, '12', null, undefined]) assert.throws(() => setupArgs(bad), TypeError, String(bad))
})

test('control: the stand-in download is really checked — a wrong digest is refused and nothing is started', async () => {
  const dir = tempDir('st-update-test-')
  folders.push(dir)
  const spawned = []
  const service = createUpdateService({
    dir, current: '1.0.0', canUpdate: true, pid: 4242,
    fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify({ tag_name: `v${VERSION}`, assets: [{ name: NAME, size: DATA.length, digest: `sha256:${'0'.repeat(64)}`, browser_download_url: `https://github.com/AsuraNale/streams/releases/download/v${VERSION}/${NAME}` }] }) }),
    openImpl: async () => { const body = new PassThrough(); setImmediate(() => { body.complete = true; body.end(DATA) }); return { status: 200, headers: {}, body } },
    spawnImpl: (...a) => { spawned.push(a); return new EventEmitter() },
  })
  await service.check()
  await service.download()
  await service.settled()
  assert.equal(service.snapshot().state, 'verify_failed')
  assert.deepEqual(await service.install(), { ok: false, reason: 'not_ready' })
  assert.deepEqual(spawned, [])
  assert.equal(existsSync(`${dir}/${NAME}`), false)
})
