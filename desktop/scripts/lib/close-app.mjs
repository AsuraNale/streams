// Closing an Electron app started by Playwright, for the tests and the screenshot script.
import { spawnSync } from 'node:child_process'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * electron.exe processes whose command line names `userDataDir` (Chromium's helper processes — GPU, network,
 * page — carry `--user-data-dir=…`; the main process of a run does not).
 * @returns {number[]} process ids
 */
export function processesUsing(userDataDir) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"],
  { encoding: 'utf8', windowsHide: true, timeout: 20_000 })
  if (r.status !== 0 || !r.stdout.trim()) return []
  let rows
  try { rows = JSON.parse(r.stdout) } catch { return [] }
  const needle = `--user-data-dir="${userDataDir}"`.toLowerCase()
  return (Array.isArray(rows) ? rows : [rows])
    .filter(p => typeof p?.CommandLine === 'string' && p.CommandLine.toLowerCase().includes(needle))
    .map(p => p.ProcessId)
}

/**
 * Close the app (Playwright: app.quit(), then wait for the process to end). When it has not ended after `ms`,
 * kill the whole process tree and say so on stderr. Then, given `userDataDir`, end any helper process still
 * running on it (a `--type=gpu-process` once outlived app.close() and kept the run folder in use): those are
 * killed, and the call waits until none is left (at most 5 s).
 * @param {import('playwright-core').ElectronApplication} app
 * @param {{ms?: number, userDataDir?: string}} [opts]
 */
export async function closeApp(app, { ms = 20_000, userDataDir } = {}) {
  if (!app) return
  const child = app.process()
  const exited = new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve()
    else child.once('exit', resolve)
  })
  let timer
  const late = new Promise(resolve => { timer = setTimeout(() => resolve('late'), ms) })
  const how = await Promise.race([app.close().then(() => 'closed', () => 'closed'), late])
  clearTimeout(timer)
  if (how === 'late') {
    process.stderr.write(`closeApp: Electron ${child.pid} did not end ${ms} ms after app.quit(); killing its process tree\n`)
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    await Promise.race([exited, sleep(5000)])
  }
  if (!userDataDir) return
  const deadline = Date.now() + 5000
  for (let left = processesUsing(userDataDir); left.length; left = processesUsing(userDataDir)) {
    if (Date.now() > deadline) {
      process.stderr.write(`closeApp: helper processes ${left.join(', ')} still use ${userDataDir}\n`)
      return
    }
    process.stderr.write(`closeApp: helper processes ${left.join(', ')} outlived the app; ending them\n`)
    for (const pid of left) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    await sleep(300)
  }
}
