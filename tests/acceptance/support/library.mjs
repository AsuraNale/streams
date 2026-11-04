// Libraries for the acceptance tests, made by the core itself (createLibrary, writeNoteFile, runRound), with the core's own
// test helpers for the local fake server and the feed fixtures (core/test/support/). Nothing here reaches the network:
// every feed and item page is on 127.0.0.1.
//
//   makeLib(name, { topics, sources, core })          createLibrary + topics / sources in streams.json (default pipeline)
//   keepNote(dir, id, overrides, body, { core })      a conforming note through the single writer (by: 'keep')
//   feedLibrary(t, name, n, { items, core })          a fake server with n items on one RSS feed + a library reading it
//   fetchCtx(overrides, { core })                     the fetch context: fake clock, no sleeping, short timeout
//   withProbeOk(connector)                            the same connector whose probe() answers ok without a call
//   hashes(dir, keep)                                 sha256 of the files under dir whose relative path passes keep()
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { caseDir, core as realCore } from './paths.mjs'
import { startFakeServer } from '../../../core/test/support/fake-server.mjs'
import { serveItems, feedRoute, hashTree, jsonl } from '../../../core/test/support/pipeline.mjs'
import { header } from '../../../core/test/support/fixtures.mjs'

export { startFakeServer, serveItems, feedRoute, hashTree, jsonl, header }

export const CLOCK = new Date(2026, 10, 3, 12, 0, 0)
export const TOPICS = [{ name: 'agent 记忆', keywords: ['memory'] }, { name: 'MCP', keywords: ['mcp'] }]

export function makeLib(name, { topics = TOPICS, sources = [], core = realCore } = {}) {
  const dir = caseDir(name)
  core.createLibrary(dir, { name })
  const file = join(dir, 'streams.json')
  const cfg = JSON.parse(readFileSync(file, 'utf8'))
  cfg.topics = topics
  cfg.sources = sources
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
  return dir
}

export function setPipeline(dir, patch) {
  const file = join(dir, 'streams.json')
  const cfg = JSON.parse(readFileSync(file, 'utf8'))
  cfg.pipeline = { ...(cfg.pipeline ?? {}), ...patch }
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
}

export function keepNote(dir, id, overrides = {}, body = `Body of ${id}.\n`, { core = realCore } = {}) {
  return core.writeNoteFile(dir, { id, header: header(id, overrides), body }, { by: 'keep' })
}

export async function feedLibrary(t, name, n, { items, core = realCore } = {}) {
  const srv = await startFakeServer()
  t.after(() => srv.close())
  const list = serveItems(srv, n, items)
  const feed = feedRoute(srv, list)
  const dir = makeLib(name, { core, sources: [{ name: 'feed-a', kind: 'rss', url: feed, topic: 'agent 记忆', max_results: 100 }] })
  return { srv, dir, items: list, feed }
}

export function fetchCtx(overrides = {}, { core = realCore } = {}) {
  return core.makeContext({ timeoutMs: 1500, now: () => CLOCK, sleep: async () => {}, ...overrides })
}

export function withProbeOk(connector) {
  return { ...connector, probe: async () => ({ ok: true, latencyMs: 0, model: 'fake-model' }) }
}

export function hashes(dir, keep = () => true) {
  return Object.fromEntries(Object.entries(hashTree(dir)).filter(([rel]) => keep(rel)))
}

export const pipelineFile = (dir, name) => join(dir, '_pipeline', name)
export const ledger = dir => jsonl(pipelineFile(dir, 'ledger.jsonl'))
export const verdicts = dir => jsonl(pipelineFile(dir, 'verdicts.jsonl'))
export const rounds = dir => jsonl(pipelineFile(dir, 'rounds.jsonl'))
export const fetchLog = dir => jsonl(pipelineFile(dir, 'fetch_log.jsonl'))

/** The model calls a connector received, the self-check's probe left out. */
export function modelCalls(connector, { core = realCore } = {}) {
  return connector.calls.filter(c => c.prompt !== core.PROBE_PROMPT)
}
