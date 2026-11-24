// The main agent's connection (v2 package C; docs/core-api.md 5.15; docs/design/v2/architecture.md 〇 and 2.1):
// one long conversation instead of v1.0's one question, one answer. Only the main agent uses this; the library's own
// calls (the gates, the summary, the verification) and asking the library stay on v1.0's complete() — no session.
//
// createSessionConnector(connection, deps, { cwd }) -> {
//   ...createConnector(connection, deps)       v1.0's complete() / detect() / probe() as they are (the summary call uses it)
//   sessionful: boolean                        claude-code / codex: true (the CLI keeps the conversation); api: false
//   cwd                                        the main agent's own working folder (claude-code / codex)
//   send(req, { sessionId? }) -> the complete() result + { sessionId, resumed, sessionLost? }
// }
//
// 「不能动手」 (CLAUDE.md, architecture 第一节) holds for every call here:
//   claude-code  v1.0's zero-tool argv (CLAUDE_FIXED_ARGS) without --no-session-persistence, plus
//                  --session-id <new uuid>     the first call of a conversation
//                  --resume <id>               every later one
//                The prompt goes in on stdin, --system-prompt on argv (as v1.0). Claude Code keeps a session under the folder
//                it ran in (~/.claude/projects/<folder>), so every call runs in the same folder: `cwd` (the desktop:
//                core agent/store.mjs AGENT_CWD = %TEMP%/streams-agent-cwd, outside the app data); whether a resume from
//                another folder works was not tried.
//   codex        the first call: v1.0's argv (CODEX_FIXED_ARGS, --sandbox read-only) without --ephemeral; the session id is
//                the `thread_id` of the `thread.started` event. Every later one:
//                  exec resume --json -c sandbox_mode="read-only" --skip-git-repo-check --ignore-user-config --ignore-rules
//                       -o <file> [-m <model>] <id> -
//                (`codex exec resume` takes no --sandbox, no -C and no --color: read-only goes in as a config override,
//                checked against `codex exec resume --help` of 0.166.0-alpha.6 on 2026-11-05.) The prompt on stdin; -o's
//                file sits in a throw-away folder beside, never inside, `cwd`.
//   api          no session on the server: send() is complete(); the caller replays the conversation (core agent).
// web: true (1.1 W4, building a library): the same sessions with the two web tools and nothing else —
//   claude-code  --tools WebSearch,WebFetch --allowedTools WebSearch WebFetch in place of --tools ''
//   codex        --search before exec (the native web_search tool), on the first call and on every resume; still read-only
//   and every result carries what the run read: reads [{ url, ok }] (Claude Code's WebFetch calls; Codex's open_page
//   actions) and searches [query], read from the call's own output (agentrun/stream.mjs, codexWebOf below).
// `cwd` must be empty before each call (anything found there is removed first: the folder is the app's own and nothing
// belongs in it), and is checked again after; a call that leaves something there says so in `leftover` (and it is removed).
//
// A resume that fails for any reason other than the connection itself (not installed, not logged in, login expired, bad
// key, rate limited, network, timeout, refused, bad format) is `sessionLost: true`: the session is gone (deleted, expired,
// another machine's); the caller starts a new one and rebuilds the context from its own transcript.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { createConnector } from './connector.mjs';
// v2 package M: CLAUDE_FIXED_ARGS is stream-json + --verbose now; the envelope and the quota read from that stream
import { CLAUDE_COMMAND, CLAUDE_FIXED_ARGS, parseClaudeOutput, claudeEnvelopeOf, withQuota } from './claude-code.mjs';
import { CODEX_FIXED_ARGS, CODEX_LAST_MESSAGE_FILE, chooseCodex, codeFromText as codexCode, parseCodexEvents } from './codex.mjs';
import { resolveCommand, spawnFailure, finishText } from './command.mjs';
import { runProcess } from './process.mjs';
import { withWorkdir } from './workdir.mjs';
import { resolveModel } from './models.mjs';
import { checkRequest, clip, failure } from './types.mjs';
import { parseStream } from '../agentrun/stream.mjs';

// a main-agent turn carries the situation and the recent conversation: more time than one v1.0 call
export const AGENT_TIMEOUT_MS = 240_000;

// Claude Code: v1.0's zero-tool set, keeping the session on disk (the one flag taken out)
export const CLAUDE_SESSION_ARGS = Object.freeze(CLAUDE_FIXED_ARGS.filter((a) => a !== '--no-session-persistence'));
// Codex: v1.0's first call keeping its session files (the one flag taken out); a resume's own fixed part
export const CODEX_SESSION_ARGS = Object.freeze(CODEX_FIXED_ARGS.filter((a) => a !== '--ephemeral'));
export const CODEX_READ_ONLY_CONFIG = 'sandbox_mode="read-only"';
export const CODEX_RESUME_ARGS = Object.freeze(['exec', 'resume', '--json', '-c', CODEX_READ_ONLY_CONFIG, '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules']);

// failures of the connection itself: a new session would fail the same way, so they are not a lost session
// 1.1 W4: a turn of building a library reads and searches the web: more time than a turn of talk
export const WEB_TIMEOUT_MS = 20 * 60_000;
export const WEB_TOOLS = Object.freeze(['WebSearch', 'WebFetch']);
// Claude Code with the two web tools and nothing else (the zero-tool set's --tools '' replaced)
export const CLAUDE_WEB_ARGS = Object.freeze(CLAUDE_SESSION_ARGS.flatMap((a, i, all) => {
  if (a === '--tools') return ['--tools', WEB_TOOLS.join(','), '--allowedTools', ...WEB_TOOLS];
  if (i > 0 && all[i - 1] === '--tools') return [];
  return [a];
}));
export const CODEX_SEARCH_FLAG = '--search';

export const CONNECTION_CODES = Object.freeze(['not-installed', 'not-logged-in', 'login-expired', 'bad-key', 'rate-limited', 'network', 'timeout', 'refused', 'bad-format', 'bad-model']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_RE = /^[A-Za-z0-9._:-]{1,200}$/;

/** `claude` argv of one main-agent call: a new session (`sessionId`) or a resumed one (`resume`). */
export function claudeSessionArgv({ model, system, sessionId, resume, web = false } = {}) {
  const argv = [...(web ? CLAUDE_WEB_ARGS : CLAUDE_SESSION_ARGS)];
  if (resume) argv.push('--resume', resume);
  else if (sessionId) argv.push('--session-id', sessionId);
  else throw new StreamsError('bad-request', 'a session call needs a sessionId or a resume id');
  if (model) argv.push('--model', model);
  if (system) argv.push('--system-prompt', system);
  return argv;
}

/** `codex` argv of the first call of a conversation. */
export function codexSessionArgv({ model, cwd, lastMessageFile, web = false } = {}) {
  const argv = [...(web ? [CODEX_SEARCH_FLAG] : []), ...CODEX_SESSION_ARGS];
  if (cwd) argv.push('-C', cwd);
  if (lastMessageFile) argv.push('-o', lastMessageFile);
  if (model) argv.push('-m', model);
  argv.push('-');
  return argv;
}

/** `codex` argv of every later call: `exec resume <id> -`, read-only by config override. */
export function codexResumeArgv({ model, sessionId, lastMessageFile, web = false } = {}) {
  if (!sessionId) throw new StreamsError('bad-request', 'a resume needs a session id');
  const argv = [...(web ? [CODEX_SEARCH_FLAG] : []), ...CODEX_RESUME_ARGS];
  if (lastMessageFile) argv.push('-o', lastMessageFile);
  if (model) argv.push('-m', model);
  argv.push(sessionId, '-');
  return argv;
}

/** The folder made if missing; anything in it removed (it is the app's own and must be empty). -> the names removed */
export function emptyFolder(dir) {
  mkdirSync(dir, { recursive: true });
  const names = readdirSync(dir);
  for (const n of names) rmSync(join(dir, n), { recursive: true, force: true });
  if (readdirSync(dir).length !== 0) throw new StreamsError('workdir-not-empty', `${dir} could not be emptied`);
  return names;
}

function lostOrNot(result, resumed) {
  if (!resumed || result.ok) return result;
  return CONNECTION_CODES.includes(result.code) ? result : { ...result, sessionLost: true };
}

export function createSessionConnector(connection, deps = {}, { cwd, web = false } = {}) {
  const base = createConnector(connection, deps);
  const kind = connection.kind;
  if (kind === 'api') {
    return { ...base, sessionful: false, cwd: null, send: async (req) => ({ ...(await base.complete(req)), sessionId: null, resumed: false }) };
  }
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new StreamsError('bad-argument', 'a session connection needs an absolute working folder');
  const timeoutMs = deps.timeoutMs ?? (web ? WEB_TIMEOUT_MS : AGENT_TIMEOUT_MS);
  const log = typeof deps.log === 'function' ? deps.log : () => {};
  const run = (cmd, args, input, onStdout = null) => runProcess({ file: cmd.file, args: [...cmd.prefixArgs, ...args], cwd, input, timeoutMs, env: deps.env, spawnImpl: deps.spawnImpl, platform: deps.platform, onStdout });
  // 1.1.1 P10 (A8): with onProgress, the run's searches and reads are counted from its output as it comes (whole lines only),
  // and onProgress({ searches, reads }) is called each time a count changes
  const progressReader = (webOf, onProgress) => {
    if (!web || typeof onProgress !== 'function') return null;
    let seen = '';
    let last = '';
    return (chunk) => {
      seen += chunk;
      if (!chunk.includes('\n')) return;
      const done = seen.slice(0, seen.lastIndexOf('\n') + 1);
      const w = webOf(done);
      const now = `${w.searches.length}/${w.reads.length}`;
      if (now === last) return;
      last = now;
      onProgress({ searches: w.searches.length, reads: w.reads.length });
    };
  };
  const before = () => {
    const removed = emptyFolder(cwd);
    if (removed.length) log(`session: ${cwd} was not empty, removed ${removed.length} entr${removed.length === 1 ? 'y' : 'ies'}`);
  };
  const after = (r) => {
    const left = existsSync(cwd) ? readdirSync(cwd) : [];
    if (left.length === 0) return r;
    log(`session: the call left ${left.length} entr${left.length === 1 ? 'y' : 'ies'} in ${cwd}; removed`);
    emptyFolder(cwd);
    return { ...r, leftover: left };
  };
  const checkId = (id) => {
    if (id !== undefined && id !== null && (typeof id !== 'string' || !SESSION_RE.test(id))) throw new StreamsError('bad-request', 'bad session id');
  };

  if (kind === 'claude-code') {
    async function send(req, { sessionId, onProgress } = {}) {
      checkRequest(req);
      checkId(sessionId);
      const model = resolveModel(connection, req.model);
      const cmd = resolveCommand(connection, CLAUDE_COMMAND, deps);
      if (!cmd) return { ...failure('not-installed', 'claude not found on PATH', { model, calls: 0 }), sessionId: sessionId ?? null, resumed: Boolean(sessionId) };
      const resumed = Boolean(sessionId);
      const id = sessionId || randomUUID();
      before();
      const r = await run(cmd, claudeSessionArgv({ model, system: req.system, web, ...(resumed ? { resume: id } : { sessionId: id }) }), req.prompt, progressReader(claudeWebOf, onProgress));
      const sf = spawnFailure(r);
      if (sf) return after({ ...sf, model, sessionId: id, resumed });
      const parsed = parseClaudeOutput(r, { now: deps.now });
      // v2 package M: the session id from the stream's result line (it was the one envelope's)
      const envId = claudeEnvelopeOf(r.stdout)?.session_id ?? null;
      const sid = typeof envId === 'string' && UUID_RE.test(envId) ? envId : id;
      const out = !parsed.ok
        ? { ok: false, code: parsed.code, detail: parsed.detail, text: parsed.text, usage: { calls: 1, ...(parsed.usage || {}) }, model: parsed.model ?? model }
        : finishText({ text: parsed.text, usage: parsed.usage, model: parsed.model ?? model ?? 'default' });
      // 1.1 W4: what the run read and searched, from its own stream
      const webOf = web ? claudeWebOf(r.stdout) : {};
      // v2 package M: the plan's windows of this turn, as complete() gives them
      return after(lostOrNot(withQuota({ ...out, ...webOf, sessionId: sid, resumed }, parsed.quota, deps), resumed));
    }
    return { ...base, sessionful: true, cwd, send };
  }

  if (kind === 'codex') {
    let chosen = null;
    async function send(req, { sessionId, onProgress } = {}) {
      checkRequest(req);
      checkId(sessionId);
      const model = resolveModel(connection, req.model);
      if (!chosen || !chosen.cmd) chosen = await chooseCodex(connection, deps);
      const resumed = Boolean(sessionId);
      if (!chosen.cmd) return { ...failure('not-installed', 'codex not found (command, PATH, desktop app)', { model, calls: 0 }), sessionId: sessionId ?? null, resumed };
      before();
      // the -o file in a throw-away folder of its own, never in cwd
      const r = await withWorkdir(deps.tmpRoot, async (side) => {
        const lastMessageFile = join(side.root, CODEX_LAST_MESSAGE_FILE);
        const args = resumed ? codexResumeArgv({ model, sessionId, lastMessageFile, web }) : codexSessionArgv({ model, cwd, lastMessageFile, web });
        // the first call carries the system text before the prompt (v1.0's way); a resumed session has it already
        const input = !resumed && req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
        const res = await run(chosen.cmd, args, input, progressReader(codexWebOf, onProgress));
        let last;
        if (existsSync(lastMessageFile)) { try { last = readFileSync(lastMessageFile, 'utf8'); } catch { last = undefined; } }
        return { ...res, lastMessage: last };
      });
      const sf = spawnFailure(r);
      if (sf) return after({ ...sf, model, sessionId: sessionId ?? null, resumed });
      const ev = parseCodexEvents(r.stdout);
      const threadId = threadIdOf(r.stdout);
      const sid = threadId ?? sessionId ?? null;
      const text = r.lastMessage && r.lastMessage.trim() !== '' ? r.lastMessage : ev.text;
      let out;
      if (ev.errors.length > 0 || r.status !== 0 || text === undefined) {
        const msg = [...ev.errors, (r.stderr || '').trim(), text === undefined && ev.events === 0 ? (r.stdout || '').trim() : ''].filter(Boolean).join(' | ');
        const code = codexCode(msg);
        out = { ok: false, code: code === 'unknown' && r.status === 0 && text === undefined ? 'bad-format' : code, detail: `exit ${r.status}; ${clip(msg, 300)}`, usage: { calls: 1, ...ev.usage }, model };
      } else {
        out = finishText({ text, usage: ev.usage, model: model ?? 'default' });
      }
      if (!resumed && !sid && out.ok) log('session: codex gave no thread id; the next call starts a new session');
      return after(lostOrNot({ ...out, ...(web ? codexWebOf(r.stdout) : {}), sessionId: sid, resumed }, resumed));
    }
    return { ...base, sessionful: true, cwd, send };
  }
  throw new StreamsError('bad-connection', `unknown connection kind "${kind}"`);
}

/** The `thread_id` of the first `thread.started` event of a `codex exec --json` stream, or null. */
export function threadIdOf(stdout) {
  for (const raw of String(stdout || '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    try {
      const ev = JSON.parse(line);
      if (ev && ev.type === 'thread.started' && typeof ev.thread_id === 'string' && SESSION_RE.test(ev.thread_id)) return ev.thread_id;
    } catch { /* not an event */ }
  }
  return null;
}

/** What a Claude Code run read and searched: its WebFetch calls (ok = not an error result) and WebSearch queries; any
 *  other tool it used is named in otherTools (there should be none). */
export function claudeWebOf(stdout) {
  const p = parseStream(stdout);
  return { reads: p.fetches.map((f) => ({ url: f.url, ok: !f.isError })), searches: p.searches.map((x) => x.query), otherTools: p.otherTools };
}

/** What a Codex run read and searched (`codex --search exec --json`, 0.167, real runs of 2026-11-21): a completed
 *  web_search item carries `results`, each with a `ref_id`. `turn<N>view<M>` is a page the model opened and looked at
 *  (whatever the item's action: open_page, find_in_page, other); `turn<N>search<M>` is only a search result, never
 *  counted as read. An open_page action's own url counts too — 1.1.1 P1 (B19): only when it worked, i.e. a result came back
 *  with the page's address; an open that came back as an error (11-24: one result, no address, 「Internal Error」) is
 *  { url, ok: false }, not a read. A search action's queries are the searches. */
const CODEX_VIEW = /^turn\d+view\d+$/;
export function codexWebOf(stdout) {
  const reads = [];
  const at = new Map();
  const read = (url, ok = true) => {
    if (typeof url !== 'string' || url === '') return;
    if (!at.has(url)) { at.set(url, reads.length); reads.push({ url, ok }); } else if (ok) reads[at.get(url)].ok = true;
  };
  const searches = [];
  for (const raw of String(stdout || '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const item = ev?.type === 'item.completed' ? ev.item : null;
    if (!item || item.type !== 'web_search') continue;
    const a = item.action ?? {};
    const results = Array.isArray(item.results) ? item.results : [];
    if (a.type === 'open_page') read(a.url, results.some((res) => typeof res?.url === 'string' && res.url !== ''));
    for (const res of results) if (CODEX_VIEW.test(String(res?.ref_id ?? ''))) read(res.url);
    if (a.type === 'search') {
      const q = typeof a.query === 'string' && a.query !== '' ? a.query : typeof item.query === 'string' ? item.query : '';
      if (q) searches.push(q);
      for (const extra of Array.isArray(a.queries) ? a.queries : []) if (typeof extra === 'string' && extra !== '' && extra !== q) searches.push(extra);
    }
  }
  return { reads, searches, otherTools: [] };
}
