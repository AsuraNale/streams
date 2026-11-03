// "Connect the Codex on your computer": one `codex exec` subprocess per call.
//
// argv (codex-cli 0.160.1 / 0.166.0, read from `codex exec --help` on 2026-11-02; the whole argv plus
// `--help` parses with exit 0 — `--ask-for-approval` is a top-level flag only and `codex exec` rejects it):
//   exec                         non-interactive
//   --json                       events as JSONL on stdout
//   --sandbox read-only          the model's shell commands cannot write
//   --skip-git-repo-check        the empty folder is not a git repo
//   --ephemeral                  no session files on disk
//   --ignore-user-config         ~/.codex/config.toml not loaded (auth still from CODEX_HOME)
//   --ignore-rules               no execpolicy .rules files
//   --color never
//   -C <cwd>                     the fresh empty folder
//   -o <file>                    the agent's last message written to a file next to (not inside) cwd
//   -m <model>                   only when the connection names a model
//   -                            prompt from stdin
//
// Where the executable comes from (product owner's order, 2026-11-02):
//   1. connection.command (explicit)                                  source 'command'
//   2. `codex` on PATH                                                 source 'path'
//   3. the desktop app's copies                                        source 'desktop-app'
//      %LOCALAPPDATA%\OpenAI\Codex\bin\<any>\codex.exe  and  %USERPROFILE%\.codex\.sandbox-bin\codex.exe
// With several candidates the highest `--version` wins (read-only). detect() reports { source, path }.
//
// Answer = the -o file when it exists, else the last `item.completed` event whose item.type is
// `agent_message`. The event shapes (thread.started / turn.completed { usage } / item.completed /
// turn.failed / error) are from the documented `codex exec --json` stream, not from a live call.
//
// `codex login status` here printed "Logged in using ChatGPT" (exit 0). The signed-out wording is
// not observed; anything with a non-zero exit or matching /not logged in/ counts as not-logged-in.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCommand, runInEmptyDir, runQuick, spawnFailure, finishText, probeFrom, versionOf, openLoginWith } from './command.mjs';
import { findExecutable, isFile } from './which.mjs';
import { resolveModel, modelsFor } from './models.mjs';
import { failure, clip, checkRequest } from './types.mjs';

export const CODEX_COMMAND = 'codex';
export const CODEX_LAST_MESSAGE_FILE = 'last-message.txt';
export const CODEX_SOURCES = ['command', 'path', 'desktop-app'];
// The CLI's own sign-in (`codex login --help`, 0.166.0, 2026-11-02): the browser flow. Never
// --with-api-key / --with-access-token (those would put a credential through us) nor --device-auth.
export const CODEX_LOGIN_ARGS = ['login'];

export const CODEX_FIXED_ARGS = [
  'exec',
  '--json',
  '--sandbox', 'read-only',
  '--skip-git-repo-check',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--color', 'never',
];

export function codexArgv({ model, cwd, lastMessageFile } = {}) {
  const argv = [...CODEX_FIXED_ARGS];
  if (cwd) argv.push('-C', cwd);
  if (lastMessageFile) argv.push('-o', lastMessageFile);
  if (model) argv.push('-m', model);
  argv.push('-');
  return argv;
}

// The desktop app's bundled binaries, in a fixed order.
export function desktopAppCodex(env = process.env) {
  const out = [];
  if (env.LOCALAPPDATA) {
    const bin = join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    if (existsSync(bin)) {
      let subs = [];
      try { subs = readdirSync(bin).sort(); } catch { subs = []; }
      for (const sub of subs) {
        const f = join(bin, sub, 'codex.exe');
        if (isFile(f)) out.push(f);
      }
    }
  }
  const home = env.USERPROFILE ?? env.HOME;
  if (home) {
    const f = join(home, '.codex', '.sandbox-bin', 'codex.exe');
    if (isFile(f)) out.push(f);
  }
  return out;
}

// Every place a codex could be, without spawning: [{ file, prefixArgs, source }]
export function codexCandidates(connection = {}, deps = {}) {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  if (connection.command !== undefined && connection.command !== '') {
    const c = resolveCommand(connection, CODEX_COMMAND, deps);
    return c ? [{ ...c, source: 'command' }] : [];
  }
  const out = [];
  const onPath = findExecutable(CODEX_COMMAND, { env, platform });
  if (onPath) out.push({ file: onPath, prefixArgs: [], source: 'path' });
  for (const file of desktopAppCodex(env)) out.push({ file, prefixArgs: [], source: 'desktop-app' });
  return out;
}

// 0.166.0-alpha.5.1 vs 0.160.1: numeric parts first; a release beats a pre-release of the same number.
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?/.exec(String(v || ''));
    return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || '' } : { nums: [-1, -1, -1], pre: '' };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  if (pa.pre === '' && pb.pre !== '') return 1;
  if (pa.pre !== '' && pb.pre === '') return -1;
  return 0;
}

// Ask each candidate for its version; keep the highest. -> { cmd, version, source, path } | null
export async function chooseCodex(connection, deps = {}) {
  let best = null;
  const tried = [];
  for (const cand of codexCandidates(connection, deps)) {
    const v = await runQuick({ cmd: cand, args: ['--version'], deps });
    if (v.spawnError || v.timedOut || v.status !== 0) {
      tried.push(`${cand.file}: ${v.spawnError ? v.spawnError.code : v.timedOut ? 'timeout' : `exit ${v.status}`}`);
      continue;
    }
    const version = versionOf(v.stdout);
    if (!best || compareVersions(version, best.version) > 0) best = { cmd: cand, version, source: cand.source, path: cand.file };
  }
  return best ? { ...best, tried } : { tried, cmd: null };
}

const TEXT_RULES = [
  [/not logged in|not authenticated|unauthorized|\b401\b|login required|run codex login|invalid.*(token|credential)/i, 'not-logged-in'],
  [/rate limit|too many requests|usage limit|quota|\b429\b/i, 'rate-limited'],
  [/model .*? (not found|unsupported|invalid|does not exist)|unknown model|unsupported model|invalid model/i, 'bad-model'],
  [/econnrefused|enotfound|etimedout|network|connection (error|refused|reset)|dns/i, 'network'],
  [/\brefus(ed|al)\b|\bdeclined\b|content_filter/i, 'refused'],
];

export function codeFromText(text) {
  for (const [re, code] of TEXT_RULES) if (re.test(text || '')) return code;
  return 'unknown';
}

// Parse the JSONL event stream. Returns { text, usage, errors: [string], events: n }.
export function parseCodexEvents(stdout) {
  const out = { text: undefined, usage: {}, errors: [], events: 0 };
  for (const raw of (stdout || '').split('\n')) {
    const line = raw.trim();
    if (line === '' || line[0] !== '{') continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    out.events++;
    const type = ev.type;
    if (type === 'item.completed' && ev.item && ev.item.type === 'agent_message' && typeof ev.item.text === 'string') {
      out.text = ev.item.text;
    } else if (type === 'turn.completed' && ev.usage && typeof ev.usage === 'object') {
      const u = ev.usage;
      const n = (x) => (typeof x === 'number' ? x : 0);
      out.usage.inputTokens = n(u.input_tokens) + n(u.cached_input_tokens);
      out.usage.outputTokens = n(u.output_tokens);
    } else if (type === 'turn.failed') {
      out.errors.push(ev.error && ev.error.message ? ev.error.message : JSON.stringify(ev.error ?? ev));
    } else if (type === 'error') {
      out.errors.push(typeof ev.message === 'string' ? ev.message : JSON.stringify(ev));
    }
  }
  return out;
}

export function createCodexConnector(connection, deps = {}) {
  const kind = 'codex';
  let chosen = null; // memoised choice; detect() refreshes it

  async function choose() {
    if (!chosen || !chosen.cmd) chosen = await chooseCodex(connection, deps);
    return chosen;
  }

  async function detect() {
    chosen = await chooseCodex(connection, deps);
    if (!chosen.cmd) {
      const detail = chosen.tried.length > 0 ? `no codex answered --version: ${clip(chosen.tried.join('; '), 200)}` : 'codex not found (command, PATH, desktop app)';
      return { installed: false, loggedIn: null, code: 'not-installed', detail };
    }
    const s = await runQuick({ cmd: chosen.cmd, args: ['login', 'status'], deps });
    const text = `${s.stdout || ''}\n${s.stderr || ''}`.trim();
    const loggedIn = s.status === 0 && !/not logged in/i.test(text) && s.spawnError === null;
    const out = { installed: true, loggedIn, version: chosen.version, source: chosen.source, path: chosen.path, detail: clip(text, 120) };
    if (!loggedIn) out.code = 'not-logged-in';
    return out;
  }

  async function complete(req) {
    checkRequest(req);
    const model = resolveModel(connection, req.model);
    const c = await choose();
    if (!c.cmd) return failure('not-installed', 'codex not found (command, PATH, desktop app)', { model, calls: 0 });
    const input = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
    const r = await runInEmptyDir({
      cmd: c.cmd,
      argvFor: (dir) => codexArgv({ model, cwd: dir.cwd, lastMessageFile: join(dir.root, CODEX_LAST_MESSAGE_FILE) }),
      input,
      deps,
      afterRun: (res, dir) => {
        const f = join(dir.root, CODEX_LAST_MESSAGE_FILE);
        let last;
        if (existsSync(f)) {
          try { last = readFileSync(f, 'utf8'); } catch { last = undefined; }
        }
        return { ...res, lastMessage: last };
      },
    });
    const sf = spawnFailure(r);
    if (sf) return { ...sf, model };
    const ev = parseCodexEvents(r.stdout);
    const text = r.lastMessage && r.lastMessage.trim() !== '' ? r.lastMessage : ev.text;
    if (ev.errors.length > 0 || r.status !== 0 || text === undefined) {
      const msg = [...ev.errors, (r.stderr || '').trim(), text === undefined && ev.events === 0 ? (r.stdout || '').trim() : ''].filter(Boolean).join(' | ');
      const code = codeFromText(msg);
      return { ok: false, code: code === 'unknown' && r.status === 0 && text === undefined ? 'bad-format' : code, detail: `exit ${r.status}; ${clip(msg, 300)}`, usage: { calls: 1, ...ev.usage }, model };
    }
    return finishText({ text, usage: ev.usage, model: model ?? 'default' });
  }

  async function openLogin({ title } = {}) {
    const c = await choose();
    if (!c.cmd) return { ok: false, code: 'not-installed', detail: 'codex not found (command, PATH, desktop app)' };
    return openLoginWith(c.cmd, CODEX_LOGIN_ARGS, { title, deps });
  }

  return { kind, detect, probe: probeFrom(complete), complete, openLogin, models: () => modelsFor(kind), connection };
}
