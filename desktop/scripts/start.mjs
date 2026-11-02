#!/usr/bin/env node
// Start the app in development: `npm start` in desktop/ (docs/desktop.md §〇).
//
//   npm start                      an empty world in <OS temp>/streams-desktop-dev (made on first start)
//   npm start -- --fresh           make the folder again
//   npm start -- --library         the world's empty library folder taken as the open library (the sidebar shows its name)
//   npm start -- --screen kit      open another screen first (here: the component gallery)
//   npm start -- --lang en         the app in English (en · zh, or any language tag: stands in for the system's languages,
//                                  STREAMS_DEV_SYSTEM_LANGUAGES; docs/desktop.md §十六); without it the real system decides
//   npm start -- --root <dir>      another development folder (under the OS temp folder)
//   … --prepare-only               make the folder ready, print it, and stop (no window; for the tests)
//
// It runs the pinned Electron 44.0.0 (installer/electron) on desktop/, with STREAMS_APP_DATA and STREAMS_LOCAL_DATA
// pointing into that folder — a development run never touches the user's real %APPDATA%\Streams. The update asks GitHub
// nothing (STREAMS_DEV_UPDATE_URL=off) unless --update is given. The folder is only ever emptied or filled when this
// script made it (its marker file, scripts/lib/dev-root.mjs): an existing folder of anyone else's is refused and left as it is.
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claimRoot, hasMarker } from './lib/dev-root.mjs'
import { DESKTOP_DIR, appEnv, electronExe } from './lib/paths.mjs'
import { makeWorld, worldDirs, worldOf } from './lib/world.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const root = value('--root') ?? join(tmpdir(), 'streams-desktop-dev')
const screen = value('--screen')
const lang = value('--lang')

let exe
try {
  exe = electronExe()
} catch (err) {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
}
try {
  // a marked folder an interrupted run left half made is made again
  const fresh = args.includes('--fresh') || (hasMarker(root) && !worldOf(root))
  claimRoot(root, { fresh })
  if (!worldOf(root)) {
    process.stdout.write(`making an empty world in ${root} ...\n`)
    await makeWorld({ root })
  }
} catch (err) {
  if (err?.code !== 'root_refused') throw err
  process.stderr.write(`${err.message}\n`)
  process.exit(2)
}

const dirs = worldDirs(root)
const extra = { ...(screen ? { STREAMS_START_SCREEN: screen } : {}) }
if (lang) extra.STREAMS_DEV_SYSTEM_LANGUAGES = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : lang
if (args.includes('--library')) extra.STREAMS_DEV_LIBRARY = dirs.library
if (!args.includes('--update')) extra.STREAMS_DEV_UPDATE_URL = 'off'
process.stdout.write(`app data: ${dirs.appData}\nlocal data: ${dirs.localData}\nlibrary: ${extra.STREAMS_DEV_LIBRARY ?? '(none open)'}\nupdate: ${extra.STREAMS_DEV_UPDATE_URL === 'off' ? 'off' : 'GitHub'}\n`)
if (args.includes('--prepare-only')) process.exit(0)
const child = spawn(exe, [DESKTOP_DIR], {
  stdio: 'inherit',
  env: appEnv({ appData: dirs.appData, localData: dirs.localData, extra }),
})
child.on('exit', code => process.exit(code ?? 0))
