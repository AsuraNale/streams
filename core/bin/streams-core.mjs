#!/usr/bin/env node
// Minimal command line over @streams/core. Output is JSON on stdout.
//   node bin/streams-core.mjs rebuild <libraryDir>   rebuild index.jsonl + index.meta.json, list refused files
//   node bin/streams-core.mjs pending <libraryDir>   list files that do not conform (with proposed headers)
//   node bin/streams-core.mjs replay  <libraryDir>   replay _pipeline/ledger.jsonl into per-url states
// Exit codes: 0 ok, 1 error (JSON {error:{code,message}} on stderr), 2 usage.
import { resolve } from 'node:path';
import { rebuildIndex } from '../src/library/index.mjs';
import { listPending } from '../src/library/pending.mjs';
import { replayLedger } from '../src/library/ledger.mjs';

const USAGE = 'usage: streams-core <rebuild|pending|replay> <libraryDir>';

function run(cmd, dir) {
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
    default:
      return null;
  }
}

const [cmd, dirArg] = process.argv.slice(2);
if (!cmd || !dirArg || !['rebuild', 'pending', 'replay'].includes(cmd)) {
  process.stderr.write(USAGE + '\n');
  process.exit(2);
}
try {
  const out = run(cmd, resolve(dirArg));
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} catch (e) {
  process.stderr.write(JSON.stringify({ error: { code: e.code ?? 'error', message: e.message } }) + '\n');
  process.exit(1);
}
