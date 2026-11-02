// Shared pieces of the two subprocess connectors (claude-code, codex).
//
// resolveCommand(connection, defaultName, deps) -> { file, prefixArgs } | null
//   connection.command: undefined -> look `defaultName` up on PATH
//                       'C:/x/claude.exe' -> that file (checked)
//                       [process.execPath, 'fake-cli.mjs'] -> run that program with these leading args
//                       (how tests drive a real subprocess without a real CLI)
import { findExecutable } from './which.mjs';
import { runProcess } from './process.mjs';
import { withWorkdir } from './workdir.mjs';
import { failure, scrub, clip, DETECT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, PROBE_PROMPT } from './types.mjs';
import { extractJson } from './json-output.mjs';

export function resolveCommand(connection, defaultName, deps = {}) {
  const spec = connection.command;
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  if (Array.isArray(spec) && spec.length > 0) {
    const file = findExecutable(spec[0], { env, platform });
    return file ? { file, prefixArgs: spec.slice(1) } : null;
  }
  const name = typeof spec === 'string' && spec !== '' ? spec : defaultName;
  const file = findExecutable(name, { env, platform });
  return file ? { file, prefixArgs: [] } : null;
}

export function versionOf(stdout) {
  const m = /(\d+\.\d+\.\d+[\w.-]*)/.exec(stdout || '');
  return m ? m[1] : undefined;
}

// Run a tool once in a fresh empty folder. argvFor(dir) builds the argv for that folder.
export async function runInEmptyDir({ cmd, argvFor, input, deps, afterRun }) {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return withWorkdir(deps.tmpRoot, async (dir) => {
    const r = await runProcess({
      file: cmd.file,
      args: [...cmd.prefixArgs, ...argvFor(dir)],
      cwd: dir.cwd,
      input,
      timeoutMs,
      env: deps.env,
      spawnImpl: deps.spawnImpl,
      platform: deps.platform,
    });
    return afterRun ? afterRun(r, dir) : r;
  });
}

export async function runQuick({ cmd, args, deps }) {
  return runProcess({
    file: cmd.file,
    args: [...cmd.prefixArgs, ...args],
    timeoutMs: deps.timeoutMs ?? DETECT_TIMEOUT_MS,
    env: deps.env,
    spawnImpl: deps.spawnImpl,
    platform: deps.platform,
  });
}

export function spawnFailure(r) {
  if (r.spawnError) {
    const code = r.spawnError.code === 'ENOENT' ? 'not-installed' : 'unknown';
    // the process never started: no model call was made
    return failure(code, `${r.spawnError.code || 'spawn'}: ${r.spawnError.message}`, { calls: 0 });
  }
  if (r.timedOut) return failure('timeout', `no answer within the time limit; stderr: ${clip(r.stderr, 200)}`);
  return null;
}

// The last step shared by every connector: a text answer becomes { ok, json } or bad-format.
export function finishText({ text, usage, model, secrets = [] }) {
  const safe = scrub(text, secrets);
  const parsed = extractJson(safe);
  if (!parsed.ok) {
    return { ok: false, code: 'bad-format', detail: `output is not JSON (${parsed.reason})`, text: safe, usage: { calls: 1, ...usage }, model };
  }
  return { ok: true, json: parsed.json, text: safe, usage: { calls: 1, ...usage }, model };
}

export function probeFrom(complete) {
  return async function probe() {
    const t0 = Date.now();
    const r = await complete({ prompt: PROBE_PROMPT, format: 'json', model: 'main' });
    const latencyMs = Date.now() - t0;
    if (r.ok) return { ok: true, latencyMs, model: r.model, usage: r.usage };
    return { ok: false, latencyMs, code: r.code, detail: r.detail, usage: r.usage };
  };
}
