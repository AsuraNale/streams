// TEST-ONLY helpers for the pipeline tests: a library whose one RSS source and item pages live on the
// local fake server, byte snapshots of the files a round may touch, and raw jsonl readers so every
// number can be recomputed from disk.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeLibrary, TEST_CONFIG } from './fixtures.mjs';
import { rssWith } from './feeds.mjs';
import { makeContext } from '../../src/fetch/context.mjs';

export const CLOCK = new Date(2026, 10, 3, 12, 0, 0);

export function ctx(overrides = {}) {
  return makeContext({ timeoutMs: 1500, now: () => CLOCK, sleep: async () => {}, ...overrides });
}

// n items on the fake server: /feed serves the RSS, /item/<i> serves a small HTML page with a body.
// items(i) may override { title, url, summary, body, status }.
export function serveItems(srv, n, items = () => ({})) {
  const list = [];
  for (let i = 1; i <= n; i++) {
    const o = items(i) ?? {};
    const url = o.url ?? `${srv.base}/item/${i}`;
    const title = o.title ?? `Item ${i} about agent memory`;
    const body = o.body ?? `<html><body><nav>menu</nav><p>Body of item ${i}. The benchmark improved by +6% (target). Nothing else.</p></body></html>`;
    if (o.url === undefined) srv.route(`/item/${i}`, { status: o.status ?? 200, body, contentType: 'text/html' });
    list.push({ title, url, summary: o.summary ?? `summary ${i}`, date: o.date });
  }
  return list;
}

export function feedRoute(srv, list, path = '/feed') {
  return srv.route(path, { body: rssWith(list) });
}

export function libraryWithFeed(name, feedUrl, { sources, config } = {}) {
  const cfg = { ...TEST_CONFIG, ...(config ?? {}), sources: sources ?? [{ name: 'feed-a', kind: 'rss', url: feedUrl, topic: 'agent 记忆', max_results: 100 }] };
  const dir = makeLibrary(name, cfg);
  // makeLibrary overwrites streams.json with TEST_CONFIG, which carries the W1 placeholder pipeline:
  // pipelineConfig() resolves that to the defaults, so a test library runs the default pipeline.
  return dir;
}

export function setPipeline(dir, patch) {
  const p = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  cfg.pipeline = typeof patch === 'function' ? patch(cfg.pipeline ?? {}) : { ...(cfg.pipeline ?? {}), ...patch };
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export function jsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
}

export function ledgerLines(dir) {
  return jsonl(join(dir, '_pipeline', 'ledger.jsonl'));
}

export function verdictLines(dir) {
  return jsonl(join(dir, '_pipeline', 'verdicts.jsonl'));
}

export function roundLines(dir) {
  return jsonl(join(dir, '_pipeline', 'rounds.jsonl'));
}

export function fetchLogLines(dir) {
  return jsonl(join(dir, '_pipeline', 'fetch_log.jsonl'));
}

// sha256 of every file under dir (relative path -> hash); `skip` drops paths matching a regex.
export function hashTree(dir, { skip } = {}) {
  const out = {};
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      const rel = relative(dir, p).replace(/\\/g, '/');
      if (skip && skip.test(rel)) continue;
      if (f.isDirectory()) walk(p);
      else out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return out;
}

// the files the idempotency rule names: ledger, inbox/, notes/, index.jsonl, verdicts.jsonl
export function stateHashes(dir) {
  const all = hashTree(dir);
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (k === '_pipeline/ledger.jsonl' || k === '_pipeline/verdicts.jsonl' || k === 'index.jsonl' || k.startsWith('_pipeline/inbox/') || k.startsWith('notes/')) out[k] = v;
  }
  return out;
}

// prompts the fake connector received, split by kind: gate prompts carry a score key, judge calls use the verify slot
export function callsOf(connector) {
  return connector.calls.map((c) => ({ prompt: c.prompt, model: c.model }));
}
