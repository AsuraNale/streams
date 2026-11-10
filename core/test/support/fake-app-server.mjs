// v2 package M: a stand-in for `codex app-server` (JSON-RPC over stdio, one message per line), run with process.execPath.
// It answers --version like a codex, and in app-server mode records every message it receives (FAKE_APP_SERVER_LOG: one JSON
// line per message, plus { cwd, entries } of where it ran) and answers according to FAKE_APP_SERVER_MODE:
//   ok        initialize → result; account/rateLimits/read → the answer seen on 11-10 (with accountId, credits, reset
//             vouchers the reader must not copy); before each answer a notification the reader must ignore
//   silent    never answers (the reader's time limit)
//   bad       rateLimits/read answers with rateLimits in another shape
//   error     rateLimits/read answers with a JSON-RPC error
//   exit      exits at once after initialize, without an answer
// Any other method is recorded and answered with an error (the tests check none is ever sent).
import { appendFileSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
if (argv[0] === '--version') {
  process.stdout.write('codex-cli 0.167.0-alpha.3\n');
  process.exit(0);
}
if (argv[0] !== 'app-server') {
  process.stderr.write(`fake app-server: unexpected argv ${JSON.stringify(argv)}\n`);
  process.exit(2);
}
const mode = process.env.FAKE_APP_SERVER_MODE || 'ok';
const logFile = process.env.FAKE_APP_SERVER_LOG;
const log = (o) => { if (logFile) appendFileSync(logFile, `${JSON.stringify(o)}\n`); };
log({ start: true, argv, cwd: process.cwd(), entries: readdirSync(process.cwd()) });
const send = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

const ANSWER = {
  rateLimits: {
    limitId: 'codex', limitName: null,
    primary: { usedPercent: 28, windowDurationMins: 10080, resetsAt: 1794417106 },
    secondary: null,
    credits: { hasCredits: false, unlimited: false, balance: '0' },
    planType: 'prolite',
    rateLimitReachedType: null,
  },
  accountId: 'acct-SECRET-should-not-be-copied',
  rateLimitResetCredits: { available: 2, nextGrantAt: 1794417106 },
};

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m;
  try { m = JSON.parse(line); } catch { log({ unparsable: line }); return; }
  log({ received: m });
  if (mode === 'silent') return;
  if (m.method === 'initialize') {
    if (mode === 'exit') process.exit(0);
    send({ method: 'remoteControl/status/changed', params: { status: 'disabled' } });
    send({ id: m.id, result: { userAgent: 'fake/0.167.0', codexHome: 'C:\\nowhere' } });
  } else if (m.method === 'initialized') {
    send({ method: 'account/updated', params: { authMode: 'chatgpt' } });
  } else if (m.method === 'account/rateLimits/read') {
    if (mode === 'bad') send({ id: m.id, result: { rateLimits: { primary: { usedPercent: 'lots', windowDurationMins: 10080, resetsAt: 1794417106 } } } });
    else if (mode === 'error') send({ id: m.id, error: { code: -32600, message: 'not signed in' } });
    else send({ id: m.id, result: ANSWER });
  } else if (m.id !== undefined) {
    send({ id: m.id, error: { code: -32601, message: `unexpected method ${m.method}` } });
  }
});
rl.on('close', () => process.exit(0));
