// v2 package M (contract M2; docs/core-api.md 5.17): Codex's plan windows, read without a model call.
//
// readCodexQuota(connection, deps) -> { ok: true, quota } | { ok: false, code, detail }
//   The codex found the way codex.mjs finds it (connection.command, PATH, the desktop app's copies; the highest version), run as
//     codex app-server                         (CODEX_QUOTA_ARGS; JSON-RPC over stdio, the default transport)
//   in a fresh empty folder (workdir.mjs: mkdirSync, removed afterwards). Exactly three messages are sent, in this order:
//     {"id":1,"method":"initialize","params":{"clientInfo":{"name":"streams","version":…}}}
//     {"method":"initialized"}                                   (after the answer to 1)
//     {"id":2,"method":"account/rateLimits/read"}
//   and the process is ended the moment the answer to 2 is in (or after DIALOGUE_TIMEOUT_MS, 10 s). No thread, no turn, no
//   model — nothing that could act; notifications and requests from the server (remoteControl/status/changed,
//   account/updated, …) are ignored, never answered. Of the answer only rateLimits.primary / secondary (usedPercent,
//   windowDurationMins, resetsAt) and planType are read (quota.mjs quotaFromCodexRateLimits): the account id, the credits and
//   the reset vouchers are never copied, and no account action (rateLimitResetCredit/…) is ever sent.
//   codes: 'not-installed' (no codex, or it could not start) · 'timeout' · 'bad-format' (no or another answer) · 'unknown'
// The app-server is marked [experimental] by Codex itself: anything unexpected is "no quota", never an error of the app.
import { chooseCodex } from './codex.mjs';
import { runDialogue, DIALOGUE_TIMEOUT_MS } from './process.mjs';
import { withWorkdir } from './workdir.mjs';
import { quotaFromCodexRateLimits } from './quota.mjs';
import { clip } from './types.mjs';

export const CODEX_QUOTA_ARGS = Object.freeze(['app-server']);
// the only methods this file ever sends (the tests check what a stand-in server received against this list)
export const CODEX_QUOTA_METHODS = Object.freeze(['initialize', 'initialized', 'account/rateLimits/read']);
export const STREAMS_CLIENT = Object.freeze({ name: 'streams', version: '2' });

const message = (method, id) => JSON.stringify(id === undefined ? { method } : { id, method, ...(method === 'initialize' ? { params: { clientInfo: { ...STREAMS_CLIENT } } } : {}) });

export async function readCodexQuota(connection = { kind: 'codex' }, deps = {}) {
  const chosen = await chooseCodex(connection, deps);
  if (!chosen.cmd) return { ok: false, code: 'not-installed', detail: 'codex not found (command, PATH, desktop app)' };
  const cmd = chosen.cmd;
  const r = await withWorkdir(deps.tmpRoot, (dir) => runDialogue({
    file: cmd.file,
    args: [...cmd.prefixArgs, ...CODEX_QUOTA_ARGS],
    cwd: dir.cwd,
    timeoutMs: deps.quotaTimeoutMs ?? DIALOGUE_TIMEOUT_MS,
    env: deps.env,
    spawnImpl: deps.spawnImpl,
    platform: deps.platform,
    start: (ctl) => ctl.send(message(CODEX_QUOTA_METHODS[0], 1)),
    onLine(line, ctl) {
      let m;
      try { m = JSON.parse(line); } catch { return; }
      if (!m || typeof m !== 'object' || m.method !== undefined) return; // a notification or a request of the server: ignored
      if (m.id === 1) {
        if (m.error || m.result === undefined) { ctl.end({ error: 'initialize' }); return; }
        ctl.send(message(CODEX_QUOTA_METHODS[1]));
        ctl.send(message(CODEX_QUOTA_METHODS[2], 2));
      } else if (m.id === 2) {
        ctl.end(m.error ? { error: 'rateLimits' } : { result: m.result });
      }
    },
  }));
  if (r.spawnError) return { ok: false, code: r.spawnError.code === 'ENOENT' ? 'not-installed' : 'unknown', detail: `${r.spawnError.code || 'spawn'}: ${r.spawnError.message}` };
  if (r.timedOut) return { ok: false, code: 'timeout', detail: 'app-server gave no answer in time' };
  if (!r.ended) return { ok: false, code: 'bad-format', detail: `app-server ended (exit ${r.status}) before answering; ${clip(r.stderr, 200)}` };
  if (!r.value || r.value.error) return { ok: false, code: 'bad-format', detail: `app-server refused ${r.value?.error instanceof Error ? 'the exchange' : String(r.value?.error)}` };
  const quota = quotaFromCodexRateLimits(r.value.result, deps.now);
  if (!quota) return { ok: false, code: 'bad-format', detail: 'rateLimits not in the shape seen' };
  return { ok: true, quota };
}
