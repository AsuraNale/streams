// "Connect the Claude Code on your computer": one `claude -p` subprocess per call.
//
// argv (Claude Code 2.1.287, read from `claude --help` on 2026-11-02):
//   -p                              print mode, non-interactive
//   --output-format json            one JSON envelope on stdout ({ type:'result', result, is_error, usage, ... })
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
import { resolveCommand, runInEmptyDir, runQuick, spawnFailure, finishText, probeFrom, versionOf } from './command.mjs';
import { resolveModel, modelsFor } from './models.mjs';
import { failure, clip, checkRequest } from './types.mjs';

export const CLAUDE_COMMAND = 'claude';

export const CLAUDE_FIXED_ARGS = [
  '-p',
  '--output-format', 'json',
  '--safe-mode',
  '--restricted',
  '--tools', '',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--permission-prompts', 'none',
];

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

// Parse what `claude -p --output-format json` printed.
export function parseClaudeOutput({ stdout, stderr, status }) {
  const trimmed = (stdout || '').trim();
  let env = null;
  if (trimmed !== '') {
    // the envelope is the last JSON object on stdout (a warning line could precede it)
    const start = trimmed.lastIndexOf('\n{');
    const candidate = start >= 0 ? trimmed.slice(start + 1) : trimmed;
    try {
      env = JSON.parse(candidate);
    } catch {
      env = null;
    }
  }
  if (!env || typeof env !== 'object') {
    const text = trimmed !== '' ? trimmed : (stderr || '').trim();
    const code = codeFromText(text);
    return { ok: false, code: code === 'unknown' && status === 0 ? 'bad-format' : code, detail: `exit ${status}; ${clip(text, 300)}` };
  }
  const resultText = typeof env.result === 'string' ? env.result : '';
  const usage = usageFrom(env);
  const model = modelFrom(env);
  if (env.is_error === true || (status !== 0 && status !== null)) {
    const text = resultText || (stderr || '').trim();
    return { ok: false, code: codeFromText(text), detail: `exit ${status}; ${clip(text, 300)}`, usage, model };
  }
  if (env.stop_reason === 'refusal') {
    return { ok: false, code: 'refused', detail: 'stop_reason refusal', usage, model, text: resultText };
  }
  return { ok: true, text: resultText, usage, model };
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
    const parsed = parseClaudeOutput(r);
    if (!parsed.ok) return { ok: false, code: parsed.code, detail: parsed.detail, text: parsed.text, usage: { calls: 1, ...(parsed.usage || {}) }, model: parsed.model ?? model };
    return finishText({ text: parsed.text, usage: parsed.usage, model: parsed.model ?? model ?? 'default' });
  }

  return { kind, detect, probe: probeFrom(complete), complete, models: () => modelsFor(kind), connection };
}
