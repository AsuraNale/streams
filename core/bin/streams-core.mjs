#!/usr/bin/env node
// Minimal command line over @streams/core. Output is JSON on stdout.
//   node bin/streams-core.mjs rebuild <libraryDir>            rebuild index.jsonl + index.meta.json, list refused files
//   node bin/streams-core.mjs pending <libraryDir>            list files that do not conform (with proposed headers)
//   node bin/streams-core.mjs replay  <libraryDir>            replay _pipeline/ledger.jsonl into per-url states
//   node bin/streams-core.mjs fetch   <libraryDir>            one fetch round over streams.json sources (network!)
//   node bin/streams-core.mjs try-source <libraryDir> <name>  fetch one source, write nothing (network!)
//   node bin/streams-core.mjs status  <libraryDir>            each source's last-round state and the health level
// Exit codes: 0 ok, 1 error (JSON {error:{code,message}} on stderr), 2 usage.
import { resolve } from 'node:path';
import { rebuildIndex } from '../src/library/index.mjs';
import { listPending } from '../src/library/pending.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { readConfig } from '../src/library/config.mjs';
import { fetchRound } from '../src/fetch/round.mjs';
import { fetchSource } from '../src/fetch/source.mjs';
import { makeContext } from '../src/fetch/context.mjs';
import { lastRoundStatus } from '../src/fetch/log.mjs';
import { sourceHealth } from '../src/fetch/health.mjs';

const COMMANDS = ['rebuild', 'pending', 'replay', 'fetch', 'try-source', 'status'];
const USAGE = 'usage: streams-core <rebuild|pending|replay|fetch|status> <libraryDir> | try-source <libraryDir> <sourceName>';

function configOf(dir) {
  const r = readConfig(dir);
  if (!r.ok) {
    const e = new Error(r.error?.message ?? 'streams.json unreadable');
    e.code = r.error?.code ?? 'bad-config';
    throw e;
  }
  return r.config;
}

async function run(cmd, dir, extra) {
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
    case 'fetch': {
      const r = await fetchRound(dir, { ctx: makeContext() });
      return { libraryDir: dir, round: r.round, perSource: r.perSource, newItems: r.newItems.length, maybeDuplicates: r.maybeDuplicates };
    }
    case 'try-source': {
      const config = configOf(dir);
      const source = (config.sources ?? []).find((s) => s && s.name === extra);
      if (!source) {
        const e = new Error(`no source named "${extra}" in streams.json`);
        e.code = 'no-such-source';
        throw e;
      }
      const r = await fetchSource(source, makeContext());
      return { libraryDir: dir, source: r.source, kind: r.kind, status: r.status, http: r.http, message: r.message, retryAfterSeconds: r.retryAfterSeconds, count: r.items.length, items: r.items.slice(0, 5) };
    }
    case 'status': {
      const last = lastRoundStatus(dir);
      return { libraryDir: dir, sources: last, health: sourceHealth(last) };
    }
    default:
      return null;
  }
}

const [cmd, dirArg, extra] = process.argv.slice(2);
if (!cmd || !dirArg || !COMMANDS.includes(cmd) || (cmd === 'try-source' && !extra)) {
  process.stderr.write(USAGE + '\n');
  process.exit(2);
}
try {
  const out = await run(cmd, resolve(dirArg), extra);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} catch (e) {
  process.stderr.write(JSON.stringify({ error: { code: e.code ?? 'error', message: e.message } }) + '\n');
  process.exit(1);
}
