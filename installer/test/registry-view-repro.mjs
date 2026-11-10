#!/usr/bin/env node
/**
 * v2 package N: 维护者's uninstall of 2026-11-10 reproduced, with a test identity (docs/installer.md §十一). Not a test of the
 * suite (no .test.mjs): it shows a cause, and only where that cause exists.
 *
 *   node installer/test/registry-view-repro.mjs
 *
 * 1. the real installer/setup/streams.iss compiled for a tiny stage under a test identity of its own ({3C1B6F0E-…},
 *    st-probe-ui, folder StProbeUi), installed silently FROM THIS PROCESS, its user folders in a temporary profile
 * 2. who sees the uninstall entry: this process, and a process Explorer starts (installer/real-registry.mjs's way)
 * 3. the uninstaller started BY EXPLORER (outside this process's registry view), no switch but /LOG — as a double click
 *    starts it — its three boxes answered here (dialogs.mjs watchDialogs: 是 → 否 → 确定)
 * 4. who sees the entry now; the uninstall log's lines
 * 5. clean-up: the identity's entry and toast key in this process's view, the temporary folders, the .cmd files
 *
 * In a Claude desktop tool shell (the Claude package's private registry view): after 1 only this process sees the entry;
 * after 3 the program folder is gone and this process STILL sees it — what the maintainer saw. In an ordinary terminal both see the
 * same registry and the entry is gone after 3. Writes: the identity's two HKCU keys (removed at the end), a temporary
 * folder, two small files in C:\Users\Public (removed); the dialogs show on the screen for a few seconds.
 * @module installer/test/registry-view-repro
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { uninstallTexts, watchDialogs } from './dialogs.mjs'
import { processesUnder, ps, shellFolder, sleep } from './machine.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { ensureInnoSetup } = await imp('installer/innosetup/setup_innosetup.mjs')
const { installDeleteList } = await imp('installer/install-delete.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')

const BS = String.fromCharCode(92)
const TEST = { guid: '3C1B6F0E-2D4A-4E7B-9A51-6B0D8E2F4C17', clsid: '5E7A9C3B-1F2D-4B6E-8A0C-9D3E5F7B1A24', name: 'st-probe-ui', folder: 'StProbeUi', exe: 'Streams.exe', aumid: 'StarryDigital.Streams.ProbeUi' }
const KEY = ['HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Uninstall', `{${TEST.guid}}_is1`].join(BS)
const TOAST = ['HKCU', 'Software', 'Classes', 'CLSID', `{${TEST.clsid}}`].join(BS)
const REG = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
const EXPLORER = join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe')
const PUB = process.env.PUBLIC ?? 'C:\\Users\\Public'
const say = t => process.stdout.write(`${t}\n`)
const put = (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t) }

const STARTED = Date.now()
const ROOT = tempDir('st-probe-cross-')
const PROFILE = join(ROOT, 'profile')
const ROAMING = join(PROFILE, 'AppData', 'Roaming')
const LOCAL = join(PROFILE, 'AppData', 'Local')
const env = { ...process.env, USERPROFILE: PROFILE, APPDATA: ROAMING, LOCALAPPDATA: LOCAL }
const X = join(ROOT, 'install')
const made = []
const here = () => spawnSync(REG, ['query', KEY], { windowsHide: true }).status === 0
let n = 0
async function realHas() {
  n += 1
  const out = join(PUB, `st-probe-cross-${process.pid}-${n}.txt`)
  const cmd = join(PUB, `st-probe-cross-${process.pid}-${n}.cmd`)
  made.push(out, cmd)
  writeFileSync(cmd, `@echo off\r\n"${REG}" query "${KEY}" >nul 2>&1\r\nif errorlevel 1 (>>"${out}" echo gone) else (>>"${out}" echo THERE)\r\n`)
  spawnSync(EXPLORER, [cmd], { windowsHide: true })
  for (let i = 0; i < 120 && !existsSync(out); i += 1) await sleep(250)
  await sleep(200)
  return existsSync(out) ? readFileSync(out, 'utf8').trim() : 'no answer'
}

try {
  if (here()) throw new Error(`${KEY} is there already: not this script's to touch`)
  for (const d of [join(ROAMING, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), LOCAL, join(PROFILE, 'Desktop')]) mkdirSync(d, { recursive: true })
  for (const name of ['Programs', 'DesktopDirectory', 'ApplicationData', 'LocalApplicationData']) {
    const p = shellFolder(name, env)
    if (!resolve(p).toLowerCase().startsWith(resolve(PROFILE).toLowerCase())) throw new Error(`${name} resolves to ${p}, outside the temporary profile: not run`)
  }
  const { iscc } = await ensureInnoSetup({ install: false })
  const icon = join(REPO, 'desktop', ...ICON_FILE)
  const iss = readFileSync(join(REPO, 'installer', 'setup', 'streams.iss'), 'utf8')
  const stage = join(ROOT, 'stage')
  put(join(stage, 'LICENSE'), 'license\n')
  put(join(stage, TEST.exe), 'not a program\n')
  put(join(stage, 'resources', 'app', ...ICON_FILE), readFileSync(icon))
  writeFileSync(join(ROOT, 'install-delete.iss'), installDeleteList(stage).text)
  const defines = { StageDir: stage, OutputDir: join(ROOT, 'out'), OutputBaseFilename: 'probe-setup', AppVersion: '9.0.0', AppName: TEST.name, AppVerName: `${TEST.name} 9`, AppPublisher: 'test', AppGuid: TEST.guid, AppCopyright: 'Copyright (C) 2026 test', InstallFolder: TEST.folder, ExeName: TEST.exe, AppUserModelId: TEST.aumid, ToastActivatorClsid: TEST.clsid, SetupIconFile: icon, IconFile: ['resources', 'app', ...ICON_FILE].join(BS), InstallDeleteFile: join(ROOT, 'install-delete.iss') }
  const c = spawnSync(iscc, ['-Qp', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), '-'], { input: iss, cwd: join(REPO, 'installer', 'setup'), encoding: 'utf8', windowsHide: true })
  if (c.status !== 0) throw new Error(`ISCC: ${c.stdout}${c.stderr}`)
  // 1. installed from this process
  const r = spawnSync(join(ROOT, 'out', 'probe-setup.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${X}`, `/LOG=${join(ROOT, 'install.log')}`], { env, windowsHide: true })
  say(`1. installed from this process: exit ${r.status}`)
  // 2. who sees it
  say(`2. after the install: this process sees the entry: ${here()}; a process Explorer starts: ${await realHas()}`)
  // 3. the uninstaller started by Explorer, as a double click starts it, its boxes answered
  const ulog = join(ROOT, 'uninstall-from-explorer.log')
  const ucmd = join(PUB, `st-probe-cross-${process.pid}-uninstall.cmd`)
  made.push(ucmd)
  writeFileSync(ucmd, `@echo off\r\nset "USERPROFILE=${PROFILE}"\r\nset "APPDATA=${ROAMING}"\r\nset "LOCALAPPDATA=${LOCAL}"\r\n"${join(X, 'unins000.exe')}" /LOG="${ulog}"\r\n`)
  spawnSync(EXPLORER, [ucmd], { windowsHide: true })
  let pid = null
  for (let i = 0; i < 80 && !pid; i += 1) { pid = processesUnder(X).find(p => /^unins000\.exe$/i.test(p.Name))?.ProcessId ?? null; if (!pid) await sleep(250) }
  if (!pid) throw new Error('the uninstaller Explorer was to start did not appear')
  const texts = uninstallTexts({ iscc, iss, appName: TEST.name })
  const w = await watchDialogs({ root: pid, confirmText: texts.confirm, dataQuestion: texts.dataQuestion, deleteData: false, workDir: ROOT })
  say(`3. the uninstaller (started by Explorer, pid ${pid}): boxes ${JSON.stringify(w.dialogs.map(d => [d.text.split('\n')[0], d.pressed]))}`)
  for (let i = 0; i < 40 && existsSync(X); i += 1) await sleep(250)
  // 4. who sees it now
  say(`4. after the uninstall: the program folder there: ${existsSync(X)}; this process sees the entry: ${here()}; a process Explorer starts: ${await realHas()}`)
  say(readFileSync(ulog, 'utf8').split(/\r?\n/).filter(l => /Current Uninstall EXE|Deleting registry key|Failed|User chose|Uninstallation process succeeded|Removed all/.test(l)).map(l => `   ${l}`).join('\n'))
} finally {
  // 5. clean up this process's view of the identity's keys, the folders, the .cmd files
  for (const k of [KEY, TOAST]) if (spawnSync(REG, ['query', k], { windowsHide: true }).status === 0) ps(`Remove-Item -LiteralPath 'Registry::${k.replace('HKCU', 'HKEY_CURRENT_USER')}' -Recurse -Force`)
  for (const f of made) rmSync(f, { force: true })
  await sleep(500)
  // the uninstaller's own copy in TEMP, when it outlived the uninstall (as the tests' after() does)
  for (const d of readdirSync(tmpdir()).filter(d => /^is-.*-uninstall\.tmp$/i.test(d) && statSync(join(tmpdir(), d)).mtimeMs >= STARTED)) {
    try { removeTree(join(tmpdir(), d), { waitMs: 10_000 }) } catch { /* still in use: left */ }
  }
  try { removeTree(ROOT, { waitMs: 20_000 }) } catch (e) { say(`(temporary folder left: ${ROOT}: ${e.message})`) }
  say(`5. cleaned up: this process sees the entry: ${here()}`)
}
