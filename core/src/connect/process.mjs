// One subprocess, collected: runProcess({ file, args, cwd, input, timeoutMs, spawnImpl })
//   -> { status, signal, stdout, stderr, timedOut, spawnError }
//
// spawnImpl has child_process.spawn's signature so tests can hand in a fake.
// Windows .cmd/.bat shims cannot be spawned directly (Node refuses since 18.x); they go through
// cmd.exe with every argument escaped the way cross-spawn does it. Newlines cannot survive cmd.exe,
// so on that route they become spaces. Native .exe files (Claude Code's install, codex.exe) and
// posix binaries are spawned directly with no shell at all.
import { spawn as nodeSpawn } from 'node:child_process';
import { isCmdShim } from './which.mjs';

export const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;

// cross-spawn's escape for cmd.exe: CRT-quote the argument, then ^-escape every cmd metacharacter.
export function escapeForCmd(arg) {
  let s = String(arg).replace(/[\r\n]+/g, ' ');
  s = s.replace(/(\\*)"/g, '$1$1\\"');
  s = s.replace(/(\\*)$/, '$1$1');
  s = `"${s}"`;
  s = s.replace(/[ !%^&()<>|"]/g, '^$&');
  return s;
}

export function spawnPlan(file, args, platform = process.platform) {
  if (platform === 'win32' && isCmdShim(file)) {
    const line = [file, ...args].map(escapeForCmd).join(' ');
    return { file: process.env.comspec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
  }
  return { file, args, windowsVerbatimArguments: false };
}

export function runProcess({ file, args = [], cwd, input, timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS, env, spawnImpl = nodeSpawn, platform = process.platform }) {
  return new Promise((resolve) => {
    const plan = spawnPlan(file, args, platform);
    let child;
    const out = [];
    const err = [];
    let settled = false;
    let timedOut = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    try {
      child = spawnImpl(plan.file, plan.args, {
        cwd,
        env: env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: plan.windowsVerbatimArguments,
      });
    } catch (e) {
      finish({ status: null, signal: null, stdout: '', stderr: '', timedOut: false, spawnError: e });
      return;
    }
    child.on('error', (e) => {
      finish({ status: null, signal: null, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut, spawnError: e });
    });
    if (child.stdout) child.stdout.on('data', (d) => out.push(Buffer.from(d)));
    if (child.stderr) child.stderr.on('data', (d) => err.push(Buffer.from(d)));
    child.on('close', (status, signal) => {
      finish({ status, signal, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut, spawnError: null });
    });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { child.kill(); } catch { /* already gone */ }
        // a child that ignores kill still resolves: do not hang the pipeline on it
        setTimeout(() => finish({ status: null, signal: 'SIGTERM', stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut: true, spawnError: null }), 1000).unref?.();
      }, timeoutMs);
    }
    if (child.stdin) {
      child.stdin.on('error', () => { /* child exited before reading stdin; close event carries the result */ });
      if (input !== undefined && input !== null) child.stdin.end(String(input));
      else child.stdin.end();
    }
  });
}
