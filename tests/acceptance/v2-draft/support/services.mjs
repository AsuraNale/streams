// v2 draft: the desktop's main-process services in plain Node (they take Electron's parts as arguments), on libraries the
// library service registered — the same objects the app wires in main.mjs, with stand-ins only for the dialog, the shell,
// the events and the log. `app` is realApp() or a mutantApp(...) (./mutant-app.mjs): the services come from that copy.
//
//   const w = await servicesWorld(app, { name, libraries: [{ key, name, topics, sources }], connector, scheduler, site })
//   w.library · w.proposals · w.agent · w.dirs[key] · w.ids[key] · w.appData · w.root · w.lines (the log) · w.queued
//   w.tree(dir) → sha256 of every file under dir but the card records (the library's own _pipeline/proposals.jsonl)
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { caseDir } from '../../support/paths.mjs'

export const CLOCK = new Date('2026-11-09T15:00:00.000Z')

export function tree(dir, skip = ['_pipeline/proposals.jsonl']) {
  const out = {}
  const walk = d => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      const rel = relative(dir, p).replace(/\\/g, '/')
      if (f.isDirectory()) walk(p)
      else if (!skip.includes(rel)) out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir)
  return out
}

export const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')

/**
 * @param {object} app - realApp() / mutantApp()
 * @param {object} o
 * @param {string} o.name - the scratch folder's name
 * @param {{key: string, name: string, topics?: object[], sources?: object[]}[]} o.libraries
 * @param {object|Function|null} [o.connector] - the main agent's connector (a scripted one), or a function (kind, { cwd, log })
 *   that makes it, as services/connections.mjs sessionConnector does (the agent service hands it its working folder)
 * @param {string} [o.kind] - the connection kind the stand-in says is chosen
 */
export async function servicesWorld(app, { name, libraries, connector = null, kind = 'claude-code', now = () => CLOCK }) {
  const core = await app.core()
  const { createLibraryService } = await app.desktop('services/library.mjs')
  const { createProposalsService } = await app.desktop('services/proposals.mjs')
  const { createAgentService } = await app.desktop('services/agent.mjs')
  const root = caseDir(name)
  const appData = join(root, 'appData')
  mkdirSync(appData, { recursive: true })
  const lines = []
  const events = []
  const answers = []
  const w = {
    core, root, appData, lines, events, dirs: {}, ids: {}, queued: [],
    libraryRoot: join(root, 'library-root'),
    emit: (topic, payload = null) => { events.push({ topic, payload }); return 1 },
    log: line => { lines.push(String(line)) },
  }
  mkdirSync(w.libraryRoot, { recursive: true })
  const dialog = { showOpenDialog: async () => { const a = answers.shift(); return a ? { canceled: false, filePaths: [a] } : { canceled: true, filePaths: [] } } }
  const shell = { openExternal: async () => {}, showItemInFolder: () => {} }
  w.library = createLibraryService({
    settingsFile: join(appData, 'settings.json'), emit: w.emit, log: w.log, dialog, shell, locale: () => ({ resolved: 'zh-CN' }), now,
    hidden: true, agentUsageFile: core.agentPaths(join(appData, core.AGENT_DIR)).usage, defaultLibraryRoot: w.libraryRoot,
  })
  for (const l of libraries) {
    const dir = join(root, l.key)
    core.createLibrary(dir, { name: l.key })
    for (const t of l.topics ?? []) core.addTopic(dir, t)
    for (const s of l.sources ?? []) core.addSource(dir, s)
    answers.push(dir)
    await w.library.handlers.chooseLibraryFolder()
    await w.library.handlers.useChosenFolder(l.name)
    w.dirs[l.key] = dir
  }
  for (const e of w.library.entries()) for (const [key, dir] of Object.entries(w.dirs)) if (e.path === dir) w.ids[key] = e.id
  // the queue of rounds (services/schedule.mjs): only what was asked of it is recorded; no round runs here
  const scheduler = { queueRound: (entry, why) => { w.queued.push({ id: entry.id, why }); return { queued: true } }, arm: () => null }
  w.proposals = createProposalsService({
    appDataDir: appData, library: w.library, scheduler: () => scheduler, emit: w.emit, log: w.log, now,
    fetchContext: { timeoutMs: 3000 }, libraryRoot: () => w.libraryRoot, scratchRoot: join(root, 'scratch'),
  })
  mkdirSync(join(root, 'scratch'), { recursive: true })
  const connections = { devConnection: null, active: () => (connector ? { kind } : null), sessionConnector: (k, o) => (typeof connector === 'function' ? connector(k, o) : connector) }
  w.agentCwd = join(root, 'agent-cwd')
  w.agent = createAgentService({ appDataDir: appData, library: w.library, connections, proposals: w.proposals, emit: w.emit, log: w.log, now, cwd: w.agentCwd })
  return w
}
