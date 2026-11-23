#!/usr/bin/env node
// Minimal command line over @streams/core. Output is JSON on stdout.
//   node bin/streams-core.mjs rebuild <libraryDir>            rebuild index.jsonl + index.meta.json, list refused files
//   node bin/streams-core.mjs pending <libraryDir>            list files that do not conform (with proposed headers)
//   node bin/streams-core.mjs replay  <libraryDir>            replay _pipeline/ledger.jsonl into per-url states
//   node bin/streams-core.mjs status  <libraryDir>            each source's last-round state and the health level
// W4 (core-api 4.5):
//   node bin/streams-core.mjs inbox <libraryDir>
//   node bin/streams-core.mjs keep <libraryDir> <url>
//   node bin/streams-core.mjs dismiss <libraryDir> <url> <reason>
//   node bin/streams-core.mjs rounds <libraryDir>
// 1.1 W7b: v1.0's fetch / try-source / self-check / estimate / run (its fetch round and scoring pipeline) left with the
// scoring pipeline (core/legacy/); a 1.1 library is updated by the desktop (core runUpdate).
// Exit codes: 0 ok, 1 error (JSON {error:{code,message}} on stderr), 2 usage.
import { resolve } from 'node:path';
import { rebuildIndex } from '../src/library/index.mjs';
import { listPending } from '../src/library/pending.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { lastRoundStatus } from '../src/fetch/log.mjs';
import { sourceHealth } from '../src/fetch/health.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { keep, dismiss } from '../src/pipeline/decide.mjs';
import { listRounds } from '../src/pipeline/rounds-log.mjs';

const COMMANDS = ['rebuild', 'pending', 'replay', 'status', 'inbox', 'keep', 'dismiss', 'rounds'];
const USAGE = [
  'usage: streams-core <rebuild|pending|replay|status|inbox|rounds> <libraryDir>',
  '       streams-core keep <libraryDir> <url>',
  '       streams-core dismiss <libraryDir> <url> <reason>',
].join('\n');

// positional args and --key value options
function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      options[a.slice(2)] = argv[i + 1];
      i += 1;
    } else positional.push(a);
  }
  return { positional, options };
}

async function run(cmd, dir, extra, options) {
  switch (cmd) {
    case 'rebuild': {
      const { entries, pending, meta } = rebuildIndex(dir);
      return { libraryDir: dir, meta, indexed: entries.map((e) => e.id), pending };
    }
    case 'pending':
      return { libraryDir: dir, pending: listPending(dir) };
    case 'replay': {
      const { states, skipped } = replayLedger(dir);
      return { libraryDir: dir, count: states.size, states: [...states.values()], skipped };
    }
    case 'status': {
      const last = lastRoundStatus(dir);
      return { libraryDir: dir, sources: last, health: sourceHealth(last) };
    }
    case 'inbox':
      return { libraryDir: dir, items: listInbox(dir) };
    case 'keep':
      return { libraryDir: dir, ...keep(dir, extra[0]) };
    case 'dismiss':
      return { libraryDir: dir, ...dismiss(dir, extra[0], extra[1]) };
    case 'rounds':
      return { libraryDir: dir, rounds: listRounds(dir) };
    default:
      return null;
  }
}

const { positional, options } = parseArgs(process.argv.slice(2));
const [cmd, dirArg, ...extra] = positional;
const needsExtra = { keep: 1, dismiss: 2 };
if (!cmd || !dirArg || !COMMANDS.includes(cmd) || extra.length < (needsExtra[cmd] ?? 0)) {
  process.stderr.write(USAGE + '\n');
  process.exit(2);
}
try {
  const out = await run(cmd, resolve(dirArg), extra, options);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} catch (e) {
  process.stderr.write(JSON.stringify({ error: { code: e.code ?? 'error', message: e.message } }) + '\n');
  process.exit(1);
}
