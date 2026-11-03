#!/usr/bin/env node
// Minimal command line over @streams/core. Output is JSON on stdout.
//   node bin/streams-core.mjs rebuild <libraryDir>            rebuild index.jsonl + index.meta.json, list refused files
//   node bin/streams-core.mjs pending <libraryDir>            list files that do not conform (with proposed headers)
//   node bin/streams-core.mjs replay  <libraryDir>            replay _pipeline/ledger.jsonl into per-url states
//   node bin/streams-core.mjs fetch   <libraryDir>            one fetch round over streams.json sources (network!)
//   node bin/streams-core.mjs try-source <libraryDir> <name>  fetch one source, write nothing (network!)
//   node bin/streams-core.mjs status  <libraryDir>            each source's last-round state and the health level
// W4 (core-api 4.5):
//   node bin/streams-core.mjs self-check <libraryDir> --connection <kind> [--model id]
//   node bin/streams-core.mjs estimate <libraryDir>
//   node bin/streams-core.mjs run <libraryDir> --connection claude-code|codex|api|fake [--model id] [--cap n]
//   node bin/streams-core.mjs inbox <libraryDir>
//   node bin/streams-core.mjs keep <libraryDir> <url>
//   node bin/streams-core.mjs dismiss <libraryDir> <url> <reason>
//   node bin/streams-core.mjs rounds <libraryDir>
//   `api` reads its key from STREAMS_API_KEY only (development use; the desktop uses safeStorage); --vendor <id> (default anthropic).
//   `fake` is the scripted fake connector (no model, no network): demos and tests.
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
import { createConnector } from '../src/connect/connector.mjs';
import { CONNECTION_KINDS } from '../src/connect/types.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { selfCheck, runRound } from '../src/pipeline/round.mjs';
import { estimateRound } from '../src/pipeline/estimate.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { keep, dismiss } from '../src/pipeline/decide.mjs';
import { listRounds } from '../src/pipeline/rounds-log.mjs';

const COMMANDS = ['rebuild', 'pending', 'replay', 'fetch', 'try-source', 'status', 'self-check', 'estimate', 'run', 'inbox', 'keep', 'dismiss', 'rounds'];
const USAGE = [
  'usage: streams-core <rebuild|pending|replay|fetch|status|estimate|inbox|rounds> <libraryDir>',
  '       streams-core try-source <libraryDir> <sourceName>',
  '       streams-core self-check <libraryDir> --connection <claude-code|codex|api|fake> [--model id] [--vendor id]',
  '       streams-core run <libraryDir> --connection <claude-code|codex|api|fake> [--model id] [--cap n] [--vendor id]',
  '       streams-core keep <libraryDir> <url>',
  '       streams-core dismiss <libraryDir> <url> <reason>',
].join('\n');

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function configOf(dir) {
  const r = readConfig(dir);
  if (!r.ok) throw fail(r.error?.code ?? 'bad-config', r.error?.message ?? 'streams.json unreadable');
  return r.config;
}

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

function connectorFor(options) {
  const kind = options.connection;
  if (kind === 'fake') return scriptedConnector({ model: options.model });
  if (!CONNECTION_KINDS.includes(kind)) throw fail('bad-connection', `--connection must be one of ${[...CONNECTION_KINDS, 'fake'].join(' | ')}`);
  const connection = { kind };
  if (options.model) connection.model = options.model;
  if (kind === 'api') connection.api = { vendor: options.vendor ?? 'anthropic', keyRef: 'env:STREAMS_API_KEY' };
  return createConnector(connection, {
    getKey: () => {
      const key = process.env.STREAMS_API_KEY;
      if (typeof key !== 'string' || key === '') throw fail('bad-key', 'STREAMS_API_KEY is not set');
      return key;
    },
  });
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
    case 'fetch': {
      const r = await fetchRound(dir, { ctx: makeContext() });
      return { libraryDir: dir, round: r.round, perSource: r.perSource, newItems: r.newItems.length, maybeDuplicates: r.maybeDuplicates };
    }
    case 'try-source': {
      const config = configOf(dir);
      const source = (config.sources ?? []).find((s) => s && s.name === extra[0]);
      if (!source) throw fail('no-such-source', `no source named "${extra[0]}" in streams.json`);
      const r = await fetchSource(source, makeContext());
      return { libraryDir: dir, source: r.source, kind: r.kind, status: r.status, http: r.http, message: r.message, retryAfterSeconds: r.retryAfterSeconds, count: r.items.length, items: r.items.slice(0, 5) };
    }
    case 'status': {
      const last = lastRoundStatus(dir);
      return { libraryDir: dir, sources: last, health: sourceHealth(last) };
    }
    case 'self-check': {
      const r = await selfCheck(dir, { connector: connectorFor(options) });
      return { libraryDir: dir, ...r };
    }
    case 'estimate':
      return { libraryDir: dir, ...estimateRound(dir) };
    case 'run': {
      const cap = options.cap === undefined ? undefined : Number(options.cap);
      if (cap !== undefined && (!Number.isInteger(cap) || cap < 0)) throw fail('bad-argument', '--cap must be a non-negative integer');
      const r = await runRound(dir, { connector: connectorFor(options), cap, ctx: makeContext() });
      return { libraryDir: dir, ...r };
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
const needsExtra = { 'try-source': 1, keep: 1, dismiss: 2 };
const needsConnection = ['self-check', 'run'];
if (!cmd || !dirArg || !COMMANDS.includes(cmd) || extra.length < (needsExtra[cmd] ?? 0) || (needsConnection.includes(cmd) && !options.connection)) {
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
