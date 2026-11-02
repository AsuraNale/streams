/**
 * The app's own processes end with it (B1, coordinator 10-05, decision 6). Seen in the tests: the main process runs its
 * quit (before-quit … will-quit, Node's exit) within a few tens of milliseconds, yet the process stays — at times more than
 * 20 s, once 100 s — while Chromium's helpers of this run (the GPU process, the network service, the page) are still
 * there; when they are gone, it ends. Seen only with a debugger attached (Playwright starts Electron with
 * --inspect / --remote-debugging-port); not found out why in the time given. So, at `quit`, the app ends the helpers
 * of its own run itself (Electron lists them: app.getAppMetrics), and a subprocess that runs a model (plan C2) must end its own process tree
 * at quit. To look at again for the installer: whether the packaged app, without a debugger,
 * needs this at all.
 * @module desktop/main/quit
 */

import { spawnSync } from 'node:child_process'

/**
 * End a process and everything it started (Windows: taskkill /T /F). Quiet: a process already gone is no error.
 * @param {number} pid
 */
export function endProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 5000 })
  } catch { /* gone already, or taskkill is not there */ }
}

/**
 * The helper processes of this run, from Electron's own list: every process but the main (browser) one.
 * @param {{pid: number, type: string}[]} metrics - app.getAppMetrics()
 * @param {number} selfPid - process.pid
 */
export function helperPids(metrics, selfPid) {
  return (Array.isArray(metrics) ? metrics : []).filter(m => Number.isInteger(m?.pid) && m.pid !== selfPid && m.type !== 'Browser').map(m => m.pid)
}

/**
 * At `will-quit` (all windows closed; Node still up — at `quit` it has already exited): end this run's helpers (all windows are closed by then; nothing of theirs is waited for).
 * @param {{metrics: object[], selfPid: number, log?: (line: string) => void}} o
 */
export function endHelpers({ metrics, selfPid, log = () => {} }) {
  const pids = helperPids(metrics, selfPid)
  const failed = []
  for (const pid of pids) {
    try { process.kill(pid) } catch (err) { failed.push(`${pid} ${err.code ?? err.message}`) }
  }
  if (pids.length) log(`quit: ended ${pids.length - failed.length} of ${pids.length} helper process(es) of this run${failed.length ? ` (not: ${failed.join(', ')})` : ''}`)
  return pids
}
