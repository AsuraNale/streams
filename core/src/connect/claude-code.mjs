// "Connect the Claude Code on your computer": one `claude -p` subprocess per call.
//
// argv (Claude Code 2.1.287, read from `claude --help` on 2026-11-02):
//   -p                              print mode, non-interactive
//   --output-format stream-json     one JSON object per line on stdout; the last { type:'result', result, is_error, usage, ... }
//   --verbose                       (stream-json needs it with -p) — v2 package M: was `--output-format json` (one envelope,
//                                   no rate-limit info); the stream also carries a `rate_limit_event` with the plan's windows
//                                   (quota.mjs). Nothing else changed: every flag below is v1.0's.
//   --safe-mode                     CLAUDE.md, skills, plugins, hooks, MCP servers, custom commands all off; auth works
//   --restricted                    no Bash/code tools, ignores user/project/local settings files
//   --tools ""                      no built-in tools at all ("" = disable all tools)
//   --strict-mcp-config             only MCP servers from --mcp-config (none given) -> none
//   --disable-slash-commands        no skills
//   --no-session-persistence        nothing written to ~/.claude/projects
//   --permission-prompts none       anything that would ask is denied (nothing should ask: no tools)
//   --model <id>                    only when the connection names a model
//   --system-prompt <text>          replaces Claude Code's own system prompt; only when the request gives one
// The prompt goes in on stdin, never on argv. cwd = a fresh empty folder (workdir.mjs).
//
// Real failure seen on this machine (CLI not signed in): exit code 1, stderr empty, stdout =
//   {"type":"result","subtype":"success","is_error":true,"terminal_reason":"api_error",
//    "result":"Failed to authenticate: OAuth session expired and could not be refreshed", ...}
// -> read stdout first, then stderr; `is_error` + the result text decide the code.
//
// Real success seen on this machine (signed in via claude.ai, 2026-11-03, exit 0, stderr empty): the same
// envelope with is_error:false, stop_reason 'end_turn', terminal_reason 'completed', result '{"ok":true}',
// usage.{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}, total_cost_usd,
// modelUsage keyed by the model id. Kept verbatim in test/support/real-claude-success.json.
import { resolveCommand, runInEmptyDir, runQuick, spawnFailure, finishText, probeFrom, versionOf, openLoginWith } from './command.mjs';
import { resolveModel, modelsFor } from './models.mjs';
import { failure, clip, checkRequest } from './types.mjs';
// v2 package M: the plan's windows that come with every call
import { quotaFromClaudeStream } from './quota.mjs';

export const CLAUDE_COMMAND = 'claude';

export const CLAUDE_FIXED_ARGS = [
  '-p',
  // v2 package M: stream-json + --verbose instead of json, for the plan's rate_limit_event (quota.mjs); the rest unchanged
  '--output-format', 'stream-json',
  '--verbose',
  '--safe-mode',
  '--restricted',
  '--tools', '',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--permission-prompts', 'none',
];

// The CLI's own sign-in (`claude auth login --help`, 2.1.287, 2026-11-02): defaults to the Claude
// subscription; no flag is added (--console, --email, --sso are the user's choice, not ours).
export const CLAUDE_LOGIN_ARGS = ['auth', 'login'];

export function claudeArgv({ model, system } = {}) {
  const argv = [...CLAUDE_FIXED_ARGS];
  if (model) argv.push('--model', model);
  if (system) argv.push('--system-prompt', system);
  return argv;
}

// Fixed wording -> code. Order matters: "expired" is more specific than "authenticate".
const TEXT_RULES = [
  [/oauth session expired|session expired|token expired|expired and could not be refreshed/i, 'login-expired'],
  [/failed to authenticate|not logged in|not authenticated|please run \/login|invalid api key|authentication/i, 'not-logged-in'],
  [/rate limit|too many requests|usage limit|overloaded|\b429\b/i, 'rate-limited'],
  [/model\b.*?\b(not found|does not exist|is not available|unrecognized)|unknown model|invalid model|not_found_error.*model/i, 'bad-model'],
  [/econnrefused|enotfound|etimedout|network|fetch failed|socket hang up|connection error/i, 'network'],
  [/\brefus(ed|al)\b|\bdeclined\b|cannot help with|stop_reason.*refusal/i, 'refused'],
];

export function codeFromText(text) {
  for (const [re, code] of TEXT_RULES) if (re.test(text || '')) return code;
  return 'unknown';
}

// v2 package M: the envelope of a stream-json stdout is its last `type: 'result'` line; v1.0's one-envelope stdout (and a
// warning line before it) still reads the old way: the last JSON object.
export function claudeEnvelopeOf(stdout) {
  const trimmed = (stdout || '').trim();
  if (trimmed === '') return null;
  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{') || !line.includes('"result"')) continue;
    try {
      const j = JSON.parse(line);
      if (j && typeof j === 'object' && j.type === 'result') return j;
    } catch { /* not this line */ }
  }
  const start = trimmed.lastIndexOf('\n{');
  const candidate = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// Parse what `claude -p --output-format stream-json --verbose` printed. The answer is v1.0's (ok, text, usage, model / code,
// detail), plus `quota` when the stream carried a well-formed rate_limit_event (v2 package M; absent otherwise).
export function parseClaudeOutput({ stdout, stderr, status }, { now } = {}) {
  const trimmed = (stdout || '').trim();
  const env = claudeEnvelopeOf(trimmed);
  const quota = quotaFromClaudeStream(trimmed, now);
  const q = quota ? { quota } : {};
  if (!env || typeof env !== 'object') {
    const text = trimmed !== '' ? trimmed : (stderr || '').trim();
    const code = codeFromText(text);
    return { ok: false, code: code === 'unknown' && status === 0 ? 'bad-format' : code, detail: `exit ${status}; ${clip(text, 300)}`, ...q };
  }
  const resultText = typeof env.result === 'string' ? env.result : '';
  const usage = usageFrom(env);
  const model = modelFrom(env);
  if (env.is_error === true || (status !== 0 && status !== null)) {
    const text = resultText || (stderr || '').trim();
    return { ok: false, code: codeFromText(text), detail: `exit ${status}; ${clip(text, 300)}`, usage, model, ...q };
  }
  if (env.stop_reason === 'refusal') {
    return { ok: false, code: 'refused', detail: 'stop_reason refusal', usage, model, text: resultText, ...q };
  }
  return { ok: true, text: resultText, usage, model, ...q };
}

/**
 * v2 package M: a call's result with its quota when the stream had one — absent otherwise, so the result is v1.0's exactly —
 * and deps.onQuota(quota) told (the desktop's corner; an error there never fails the call).
 */
export function withQuota(result, quota, deps = {}) {
  if (!quota) return result;
  if (typeof deps.onQuota === 'function') { try { deps.onQuota(quota); } catch { /* the caller's problem, not the call's */ } }
  return { ...result, quota };
}

function usageFrom(env) {
  const u = env.usage && typeof env.usage === 'object' ? env.usage : {};
  const n = (x) => (typeof x === 'number' ? x : 0);
  const out = {};
  if (env.usage) {
    out.inputTokens = n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens);
    out.outputTokens = n(u.output_tokens);
  }
  if (typeof env.total_cost_usd === 'number') out.costUsd = env.total_cost_usd;
  return out;
}

function modelFrom(env) {
  if (env.modelUsage && typeof env.modelUsage === 'object') {
    const keys = Object.keys(env.modelUsage);
    if (keys.length > 0) return keys[0];
  }
  return undefined;
}

export function createClaudeCodeConnector(connection, deps = {}) {
  const kind = 'claude-code';

  async function detect() {
    const cmd = resolveCommand(connection, CLAUDE_COMMAND, deps);
    if (!cmd) return { installed: false, loggedIn: null, code: 'not-installed', detail: 'claude not found on PATH' };
    const v = await runQuick({ cmd, args: ['--version'], deps });
    const sf = spawnFailure(v);
    if (sf) return { installed: sf.code !== 'not-installed', loggedIn: null, code: sf.code, detail: sf.detail };
    if (v.status !== 0) return { installed: false, loggedIn: null, code: 'not-installed', detail: `claude --version exit ${v.status}: ${clip(v.stderr || v.stdout, 200)}` };
    const version = versionOf(v.stdout);
    const s = await runQuick({ cmd, args: ['auth', 'status', '--json'], deps });
    let loggedIn = null;
    let detail;
    try {
      const j = JSON.parse((s.stdout || '').trim());
      if (typeof j.loggedIn === 'boolean') loggedIn = j.loggedIn;
      detail = j.authMethod ? `authMethod=${j.authMethod}` : undefined;
    } catch {
      loggedIn = null;
      detail = `auth status unreadable: exit ${s.status}`;
    }
    const out = { installed: true, loggedIn, version };
    if (loggedIn === false) out.code = 'not-logged-in';
    if (detail) out.detail = detail;
    return out;
  }

  async function complete(req) {
    checkRequest(req);
    const model = resolveModel(connection, req.model);
    const cmd = resolveCommand(connection, CLAUDE_COMMAND, deps);
    if (!cmd) return failure('not-installed', 'claude not found on PATH', { model, calls: 0 });
    const r = await runInEmptyDir({
      cmd,
      argvFor: () => claudeArgv({ model, system: req.system }),
      input: req.prompt,
      deps,
    });
    const sf = spawnFailure(r);
    if (sf) return { ...sf, model };
    const parsed = parseClaudeOutput(r, { now: deps.now });
    const out = !parsed.ok
      ? { ok: false, code: parsed.code, detail: parsed.detail, text: parsed.text, usage: { calls: 1, ...(parsed.usage || {}) }, model: parsed.model ?? model }
      : finishText({ text: parsed.text, usage: parsed.usage, model: parsed.model ?? model ?? 'default' });
    // v2 package M: the plan's windows go with the result (and to deps.onQuota)
    return withQuota(out, parsed.quota, deps);
  }

  async function openLogin({ title } = {}) {
    const cmd = resolveCommand(connection, CLAUDE_COMMAND, deps);
    if (!cmd) return { ok: false, code: 'not-installed', detail: 'claude not found on PATH' };
    return openLoginWith(cmd, CLAUDE_LOGIN_ARGS, { title, deps });
  }

  return { kind, detect, probe: probeFrom(complete), complete, openLogin, models: () => modelsFor(kind), connection };
}
