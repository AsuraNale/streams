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

// Start a program in its own visible console window and let go of it:
//   launchDetached({ file, args, title, platform, spawnImpl, env }) -> { ok: true, pid, plan } | { ok: false, spawnError }
// Used for the CLIs' own sign-in (`claude auth login`, `codex login`). The window is the CLI's:
// Streams pipes nothing in or out (stdio all 'ignore'), does not wait for it, never sees what it prints.
//   win32:     cmd.exe /d /s /c "start "<title>" <file> <args…>"   (start opens the new window; cmd exits at once)
//   elsewhere: the file itself, detached (for a shell that already has a terminal; the product is Windows-only)
export const LAUNCH_STDIO = Object.freeze(['ignore', 'ignore', 'ignore']);

export function launchPlan(file, args, { title = 'Streams', platform = process.platform } = {}) {
  if (platform === 'win32') {
    const line = ['start', escapeForCmd(title), ...[file, ...args].map(escapeForCmd)].join(' ');
    return { file: process.env.comspec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
  }
  return { file, args, windowsVerbatimArguments: false };
}

export function launchDetached({ file, args = [], title, platform = process.platform, spawnImpl = nodeSpawn, env }) {
  return new Promise((resolve) => {
    const plan = launchPlan(file, args, { title, platform });
    let child;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      child = spawnImpl(plan.file, plan.args, {
        env: env ?? process.env,
        stdio: [...LAUNCH_STDIO],
        detached: true,
        windowsHide: false,
        windowsVerbatimArguments: plan.windowsVerbatimArguments,
      });
    } catch (e) {
      finish({ ok: false, spawnError: e });
      return;
    }
    const started = () => finish({ ok: true, pid: child.pid, plan });
    child.once('error', (e) => finish({ ok: false, spawnError: e }));
    child.once('spawn', started);
    child.once('close', started); // a very quick exit still means it started
    setTimeout(started, 500).unref?.(); // a spawnImpl that emits neither event
    child.unref?.();
  });
}

// v2 package M: a line-by-line exchange with one subprocess (Codex's app-server, codex-quota.mjs), ended by the caller:
//   runDialogue({ file, args, cwd, timeoutMs, env, spawnImpl, platform, start(ctl), onLine(line, ctl) })
//     ctl.send(text)   one line to the child's stdin ('\n' added)
//     ctl.end(value)   done: the child is killed, the promise resolves
//   -> { ended: true, value, sent } | { ended: false, status, signal, timedOut, spawnError, sent, stderr }
//   `sent` = every line written, in order (what the caller's tests check). The child is killed on end, on timeout, and when
//   it closes by itself; nothing is waited for after that.
export const DIALOGUE_TIMEOUT_MS = 10_000;

export function runDialogue({ file, args = [], cwd, timeoutMs = DIALOGUE_TIMEOUT_MS, env, spawnImpl = nodeSpawn, platform = process.platform, start, onLine }) {
  return new Promise((resolve) => {
    const plan = spawnPlan(file, args, platform);
    const sent = [];
    const err = [];
    let child;
    let settled = false;
    let timer = null;
    let buffer = '';
    // stdin closed first: a child behind a cmd.exe shim (which kill() does not reach) sees the end of its input and stops
    const kill = () => {
      try { child?.stdin?.end(); } catch { /* already closed */ }
      try { child?.kill(); } catch { /* already gone */ }
    };
    let closed = false;
    let onClosed = null;
    // the answer is handed back once the child is gone (its folder can then be removed: Windows keeps a running child's cwd
    // busy), or after a second at most
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      kill();
      const done = () => resolve({ ...result, sent: [...sent] });
      if (closed || !child) { done(); return; }
      const t = setTimeout(done, 1000);
      onClosed = () => { clearTimeout(t); done(); };
    };
    const ctl = {
      send(text) {
        if (settled || !child?.stdin) return;
        const line = String(text).replace(/[\r\n]+/g, ' ');
        sent.push(line);
        try { child.stdin.write(`${line}\n`); } catch { /* the close event carries the result */ }
      },
      end(value) { finish({ ended: true, value }); },
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
      finish({ ended: false, status: null, signal: null, timedOut: false, spawnError: e, stderr: '' });
      return;
    }
    child.on('error', (e) => {
      if (settled) { if (onClosed) onClosed(); return; }
      closed = true;
      finish({ ended: false, status: null, signal: null, timedOut: false, spawnError: e, stderr: Buffer.concat(err).toString('utf8') });
    });
    child.stdin?.on('error', () => { /* the child went away; close / timeout decides */ });
    child.stderr?.on('data', (d) => { if (err.length < 64) err.push(Buffer.from(d)); });
    child.stdout?.on('data', (d) => {
      buffer += Buffer.from(d).toString('utf8');
      let nl;
      while (!settled && (nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line === '') continue;
        try { onLine(line, ctl); } catch (e) { finish({ ended: true, value: { error: e } }); }
      }
      if (buffer.length > 1_000_000) finish({ ended: false, status: null, signal: null, timedOut: false, spawnError: null, stderr: 'stdout line too long' });
    });
    child.on('close', (status, signal) => {
      closed = true;
      if (onClosed) { onClosed(); return; }
      finish({ ended: false, status, signal, timedOut: false, spawnError: null, stderr: Buffer.concat(err).toString('utf8') });
    });
    if (timeoutMs > 0) timer = setTimeout(() => finish({ ended: false, status: null, signal: 'SIGTERM', timedOut: true, spawnError: null, stderr: Buffer.concat(err).toString('utf8') }), timeoutMs);
    try { start?.(ctl); } catch (e) { finish({ ended: true, value: { error: e } }); }
  });
}

// 1.1.1 P10: onStdout(text) is called with each piece of the output as it arrives (the whole of it still comes at the end)
export function runProcess({ file, args = [], cwd, input, timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS, env, spawnImpl = nodeSpawn, platform = process.platform, onStdout = null }) {
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
    if (child.stdout) child.stdout.on('data', (d) => { out.push(Buffer.from(d)); if (typeof onStdout === 'function') { try { onStdout(Buffer.from(d).toString('utf8')); } catch { /* a progress reader never stops the run */ } } });
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
