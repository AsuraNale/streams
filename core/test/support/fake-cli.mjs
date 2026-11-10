// A stand-in for the `claude` / `codex` executables, run with process.execPath.
// It answers the read-only probes and, for a call, echoes where it ran and what it got:
//   claude mode  (argv has -p):    stdout = Claude Code's result envelope, result = JSON of { ok, cwd, entries, argv, prompt }
//   codex mode   (argv has exec):  stdout = JSONL events; the -o file gets the same JSON text
// Env: FAKE_CLI_EXIT (exit code), FAKE_CLI_STDOUT (verbatim stdout instead), FAKE_CLI_SLEEP_MS.
import { readdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const sleepMs = Number(process.env.FAKE_CLI_SLEEP_MS || 0);
const exitCode = Number(process.env.FAKE_CLI_EXIT || 0);

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (d) => chunks.push(d));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.resume();
  });
}

async function main() {
  if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
  if (process.env.FAKE_CLI_STDOUT) {
    process.stdout.write(process.env.FAKE_CLI_STDOUT);
    process.exit(exitCode);
  }
  if (argv[0] === '--version') {
    process.stdout.write(argv.includes('--codex') ? 'codex-cli 9.9.9\n' : '9.9.9 (Fake CLI)\n');
    process.exit(exitCode);
  }
  if (argv[0] === 'auth' && argv[1] === 'status') {
    process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'fake' }) + '\n');
    process.exit(exitCode);
  }
  if (argv[0] === 'login' && argv[1] === 'status') {
    process.stdout.write('Logged in using fake\n');
    process.exit(exitCode);
  }
  const prompt = await readStdin();
  const seen = { ok: true, cwd: process.cwd(), entries: readdirSync(process.cwd()), argv, prompt };
  const text = JSON.stringify(seen);
  if (argv[0] === 'exec') {
    const o = argv.indexOf('-o');
    if (o >= 0) writeFileSync(argv[o + 1], text, 'utf8');
    const events = [
      { type: 'thread.started', thread_id: 'fake-thread' },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text } },
      { type: 'turn.completed', usage: { input_tokens: 7, cached_input_tokens: 3, output_tokens: 2 } },
    ];
    process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    process.exit(exitCode);
  }
  const envelope = {
    type: 'result', subtype: 'success', is_error: false, num_turns: 1, result: text,
    usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 5 },
    total_cost_usd: 0.0012, modelUsage: { 'fake-model': { inputTokens: 15, outputTokens: 5 } },
  };
  // v2 package M: Claude Code's stream-json (with --output-format stream-json --verbose): an init line, the assistant's
  // message, the rate_limit_event (FAKE_CLI_RATE_LIMIT=0 leaves it out), the result last — the shape 2.1.287 printed 11-10
  const stream = argv[argv.indexOf('--output-format') + 1] === 'stream-json';
  if (!stream) {
    process.stdout.write(JSON.stringify(envelope) + '\n');
    process.exit(exitCode);
  }
  const lines = [
    { type: 'system', subtype: 'init', cwd: process.cwd(), session_id: '00000000-0000-0000-0000-000000000000', tools: [], mcp_servers: [] },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } },
    ...(process.env.FAKE_CLI_RATE_LIMIT === '0' ? [] : [{
      type: 'rate_limit_event',
      rate_limit_info: { status: 'allowed', resetsAt: 1794339000, rateLimitType: 'five_hour', overageStatus: 'rejected', unifiedWindows: { five_hour: { utilization: 0.05, resetsAt: 1794339000 }, seven_day: { utilization: 0.11, resetsAt: 1794603600 } } },
    }]),
    envelope,
  ];
  process.stdout.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  process.exit(exitCode);
}

main();
