// One round of the pipeline (product spec 4.5; core-api 4.2).
//
// selfCheck(libraryDir, { connector }) -> { ok, problems:[{ code, detail, connectionCode? }], warnings, probe? }
//   step 0: _pipeline/ writable (a temp file written and removed) · streams.json readable · the index readable
//   (a broken index.jsonl line is a failure; a non-conforming note file is only a warning) · connector.probe() once.
//   Any failure -> ok:false and nothing else is written. All passed -> the index is rebuilt (fresh for the
//   related-entries lookup) and ok:true.
// runRound(libraryDir, { connector, cap?, ctx?, signal?, onProgress?, now? })
//   self-check -> fetchRound -> for each gate, in pipeline order, the items the ledger says are waiting at it
//   (buildQueue, rebuilt from the ledger before every stage) -> body into cache for a body gate -> summary
//   under the verification loop -> inbox -> rounds.jsonl line + logs/<day>.md section -> cleanCache.
//   Counting: every connector.complete (gate, summary, judge) counts 1; calls >= cap -> stop after the current
//   item (stoppedAt:'cap'); signal.aborted -> stop after the current item ('aborted'); a connection failure ->
//   stop at once ('connection'). Items not reached keep their ledger state and are picked up next round.
//   -> { ok, started, round:{ id, startedAt, finishedAt }, counts, gates, calls, stoppedAt?, problems, warnings }
//   -> { ok:false, started:false, problems }  when the self-check fails (nothing written)
// previewNode(libraryDir, { connector, nodeId, url? | item?, ctx? }) -> { ok, output, verification, calls } | { ok:false, code }
//   runs one gate or the summary on one item and writes nothing (no ledger, no inbox, no verdicts).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from '../library/config.mjs';
import { readIndex, rebuildIndex } from '../library/index.mjs';
import { scanLibrary } from '../library/scan.mjs';
import { appendEvent, replayLedger } from '../library/ledger.mjs';
import { fetchRound } from '../fetch/round.mjs';
import { makeContext } from '../fetch/context.mjs';
import { localIsoDate } from '../fetch/dates.mjs';
import { createUsageCounter } from '../connect/usage.mjs';
import { pipelineFrom, gateNodes, summaryNode, cfgOf, checkPipeline } from './config.mjs';
import { buildQueue, nextStep } from './queue.mjs';
import { fetchBody, readCachedBody, cleanCache } from './cache.mjs';
import { relatedEntries } from './related.mjs';
import { runGate, gapConnector } from './score.mjs';
import { runSummary } from './summarize.mjs';
import { appendRoundRecord, appendRoundLogMd } from './rounds-log.mjs';
import { writeInboxItem } from './inbox.mjs';
import { constantScoreWarning } from './numbers.mjs';

function detail(e) {
  return String(e?.message ?? e).slice(0, 300);
}

export async function selfCheck(libraryDir, { connector, scoreless = false } = {}) {
  const problems = [];
  const warnings = [];
  const out = { ok: false, problems, warnings };
  if (typeof libraryDir !== 'string' || libraryDir === '' || !existsSync(libraryDir)) {
    problems.push({ code: 'not-writable', detail: `${String(libraryDir)} does not exist` });
    return out;
  }
  // writable: a real write, then removed
  try {
    mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
    const probeFile = join(libraryDir, '_pipeline', `.write-check-${randomBytes(4).toString('hex')}`);
    writeFileSync(probeFile, 'ok', 'utf8');
    unlinkSync(probeFile);
  } catch (e) {
    problems.push({ code: 'not-writable', detail: detail(e) });
    return out;
  }
  const cfg = readConfig(libraryDir);
  if (!cfg.ok) {
    problems.push({ code: 'config', detail: `${cfg.error.code}: ${cfg.error.message}` });
    return out;
  }
  // index: the file must parse and the note folder must scan; a non-conforming note file is only a warning
  try {
    readIndex(libraryDir);
    const scan = scanLibrary(libraryDir);
    for (const p of scan.pending) warnings.push(`note-not-conforming ${p.file}: ${p.codes.join(',')}`);
  } catch (e) {
    problems.push({ code: 'index', detail: `${e.code ?? 'error'}: ${detail(e)}` });
    return out;
  }
  // a round without a connection (the user skipped it: product spec S1 「没有连接也能抓，只是不打分，全部进待看」) asks
  // for it explicitly; a connector that is merely missing is still a failure, so nothing lands in the inbox by accident
  if (scoreless) {
    try {
      rebuildIndex(libraryDir);
    } catch (e) {
      problems.push({ code: 'index', detail: `${e.code ?? 'error'}: ${detail(e)}` });
      return out;
    }
    out.ok = true;
    out.scoreless = true;
    return out;
  }
  if (!connector || typeof connector.probe !== 'function') {
    problems.push({ code: 'connection', detail: 'no connector', connectionCode: 'not-installed' });
    return out;
  }
  let probe;
  try {
    probe = await connector.probe();
  } catch (e) {
    probe = { ok: false, code: 'unknown', detail: detail(e) };
  }
  if (!probe.ok) {
    problems.push({ code: 'connection', detail: probe.detail ?? probe.code, connectionCode: probe.code ?? 'unknown' });
    return out;
  }
  try {
    rebuildIndex(libraryDir);
  } catch (e) {
    problems.push({ code: 'index', detail: `${e.code ?? 'error'}: ${detail(e)}` });
    return out;
  }
  out.ok = true;
  out.probe = { latencyMs: probe.latencyMs, model: probe.model };
  return out;
}

function itemOf(state, summaries) {
  return {
    url: state.url,
    title: state.title ?? '',
    source: state.source ?? '',
    date: state.date ?? '',
    summary: state.summary ?? summaries.get(state.url) ?? '',
  };
}

// streams.json topics[] names: the library's angle, told to every gate and the summary (prompts.mjs libraryBlock)
function libraryTopics(config) {
  return (config.topics ?? []).map((t) => (typeof t === 'string' ? t : t?.name)).filter((t) => typeof t === 'string' && t.trim() !== '');
}

function topicOf(config, sourceName) {
  const src = (config.sources ?? []).find((s) => s && s.name === sourceName);
  return src && typeof src.topic === 'string' && src.topic.trim() !== '' ? src.topic.trim() : undefined;
}

function emptyGateCount() {
  return { passed: 0, failed: 0, unscored: 0 };
}

async function materialFor({ libraryDir, cfg, node, state, ctx, summaries }) {
  const item = itemOf(state, summaries);
  if (node.kind === 'gate' && node.material === 'meta') return { item, body: undefined, materials: 'meta' };
  const b = await fetchBody(state.url, ctx, { libraryDir, bodyMaxChars: cfg.bodyMaxChars });
  if (b.ok) return { item, body: b.text, materials: 'body' };
  return { item, body: null, materials: 'summary-only', bodyReason: b.reason };
}

export async function runRound(libraryDir, { connector, scoreless = false, cap, ctx, signal, onProgress, now } = {}) {
  const c = makeContext(ctx ?? (typeof now === 'function' ? { now } : {}));
  const check = await selfCheck(libraryDir, { connector, scoreless });
  if (!check.ok) return { ok: false, started: false, problems: check.problems, warnings: check.warnings };

  const config = readConfig(libraryDir).config;
  const cfg = pipelineFrom(config);
  const limit = Number.isInteger(cap) && cap >= 0 ? cap : cfg.cap;
  const fetch = await fetchRound(libraryDir, { config, ctx: c });
  const round = { id: fetch.round.id, startedAt: fetch.round.startedAt };
  const summaries = new Map(fetch.newItems.map((i) => [i.url, i.summary ?? '']));
  const index = readIndex(libraryDir);
  const usage = createUsageCounter(libraryDir, { now: c.now });
  const spaced = gapConnector(connector, { sleep: c.sleep, callGapMs: cfg.callGapMs });

  const gates = {};
  for (const g of gateNodes(cfg)) gates[g.id] = emptyGateCount();
  const counts = { fetched: 0, new: fetch.newItems.length, maybeDuplicates: fetch.maybeDuplicates.length, summarized: 0, inbox: 0, verifyRejected: 0 };
  for (const p of fetch.perSource) counts.fetched += p.count ?? 0;
  const problems = [];
  const warnings = [...check.warnings];
  const unscored = [];
  const firstGateScores = [];
  let calls = 0;
  let stoppedAt;

  const stopNow = () => {
    if (signal?.aborted) { stoppedAt = 'aborted'; return true; }
    if (calls >= limit) { stoppedAt = 'cap'; return true; }
    return false;
  };
  const progress = (stage, node, url) => {
    if (typeof onProgress === 'function') onProgress({ round: round.id, stage, node, url, calls, counts, gates });
  };
  const connectionStop = (r, node, url) => {
    stoppedAt = 'connection';
    problems.push({ code: 'connection', connectionCode: r.code, detail: r.detail ?? r.code, node, url });
  };

  // no connection: every item still waiting at the first gate goes to the inbox as it is (no score, no summary;
  // the card carries the feed's own excerpt and scoreless:true). No model call; the gates and the summary are skipped.
  const gateList = gateNodes(cfg);
  if (check.scoreless) {
    const first = gateList[0];
    const waiting = first ? buildQueue(libraryDir, cfg).byNode[first.id] ?? [] : [];
    for (const state of waiting) {
      if (signal?.aborted) { stoppedAt = 'aborted'; break; }
      const ts = c.now().toISOString();
      const card = {
        url: state.url, title: state.title ?? '', source: state.source ?? '', date: state.date ?? '',
        scores: {}, summary: { what: '', points: [], quote: '' }, excerpt: summaries.get(state.url) ?? state.summary ?? '',
        verification: { passed: false, rounds: 0, failed: [] }, scoreless: true, round: round.id,
      };
      if (state.maybeDuplicateOf) card.maybeDuplicateOf = state.maybeDuplicateOf;
      writeInboxItem(libraryDir, card);
      appendEvent(libraryDir, { ts, ev: 'inbox', url: state.url, round: round.id, verified: false, scoreless: true });
      counts.inbox += 1;
      progress('inbox', null, state.url);
    }
  }
  outer: for (let gi = 0; gi < (check.scoreless ? 0 : gateList.length); gi++) {
    const node = gateList[gi];
    const queue = buildQueue(libraryDir, cfg).byNode[node.id] ?? [];
    for (const state of queue) {
      if (stopNow()) break outer;
      const mat = await materialFor({ libraryDir, cfg, node, state, ctx: c, summaries });
      const sourceTopic = topicOf(config, state.source);
      const related = relatedEntries(index, mat.item, { topic: sourceTopic });
      const r = await runGate({ libraryDir, cfg, node, item: mat.item, body: mat.body, materials: mat.materials, related, topics: libraryTopics(config), sourceTopic, connector: usage.wrap(spaced, `gate:${node.id}`), round: round.id, now: c.now });
      calls += r.calls;
      if (r.status === 'connection') {
        unscored.push({ url: state.url, node: node.id, reason: `connection:${r.code}` });
        connectionStop(r, node.id, state.url);
        break outer;
      }
      if (r.status === 'scored') {
        gates[node.id][r.passed ? 'passed' : 'failed'] += 1;
        if (gi === 0) firstGateScores.push({ url: state.url, source: state.source, score: r.score });
      } else {
        gates[node.id].unscored += 1;
        unscored.push({ url: state.url, node: node.id, reason: r.reason });
      }
      progress('gate', node.id, state.url);
    }
  }

  const summary = summaryNode(cfg);
  if (summary && stoppedAt === undefined && !check.scoreless) {
    const queue = buildQueue(libraryDir, cfg).summary;
    for (const state of queue) {
      if (stopNow()) break;
      const mat = await materialFor({ libraryDir, cfg, node: summary, state, ctx: c, summaries });
      const sourceTopic = topicOf(config, state.source);
      const related = relatedEntries(index, mat.item, { topic: sourceTopic });
      const r = await runSummary({ libraryDir, cfg, node: summary, state, item: mat.item, body: mat.body, materials: mat.materials, related, topics: libraryTopics(config), sourceTopic, connector: usage.wrap(spaced, 'summary'), round: round.id, now: c.now });
      calls += r.calls;
      if (r.status === 'connection') {
        unscored.push({ url: state.url, node: summary.id, reason: `connection:${r.code}` });
        connectionStop(r, summary.id, state.url);
        break;
      }
      if (r.status === 'inbox') {
        counts.summarized += 1;
        counts.inbox += 1;
        if (!r.passed) counts.verifyRejected += 1;
      } else {
        unscored.push({ url: state.url, node: summary.id, reason: r.reason });
      }
      progress('summary', summary.id, state.url);
    }
  }

  // connection failures stop the round at once; the current item is recorded as unscored connection:<code>
  if (stoppedAt === 'connection') {
    const u = unscored[unscored.length - 1];
    const node = cfg.nodes.find((n) => n.id === u.node);
    appendEvent(libraryDir, { ts: c.now().toISOString(), ev: 'unscored', url: u.url, node: u.node, reason: u.reason, cfg: cfgOf(node), round: round.id });
  }

  const warn = constantScoreWarning(firstGateScores);
  if (warn) warnings.push(warn);
  const gateIds = Object.keys(gates);
  counts.gate1 = gates[gateIds[0]] ?? emptyGateCount();
  counts.gate2 = gates[gateIds[1]] ?? emptyGateCount();
  const finishedAt = c.now().toISOString();
  const record = {
    id: round.id, startedAt: round.startedAt, finishedAt, counts, gates, calls,
    ...(check.scoreless ? { scoreless: true } : {}),
    ...(stoppedAt ? { stoppedAt } : {}),
    problems, warnings,
    fetch: fetch.perSource.map((p) => ({ name: p.name, status: p.status, count: p.count, newCount: p.newCount })),
    unscored,
  };
  appendRoundRecord(libraryDir, record);
  appendRoundLogMd(libraryDir, record, { day: localIsoDate(c.now()) });
  cleanCache(libraryDir, { days: cfg.cacheDays, now: c.now });
  return { ok: true, started: true, round: { id: round.id, startedAt: round.startedAt, finishedAt }, counts, gates, calls, ...(check.scoreless ? { scoreless: true } : {}), ...(stoppedAt ? { stoppedAt } : {}), problems, warnings };
}

// `draft` (optional): the node as the user is editing it, not saved yet (product spec C3: change the requirement,
// 「试一条看结果」, then save). It is checked exactly as savePipelineConfig would check it — a locked field changed or a
// threshold out of range is refused with that code — and used for this one call only; nothing is written.
export async function previewNode(libraryDir, { connector, nodeId, url, item, ctx, draft } = {}) {
  const r = readConfig(libraryDir);
  if (!r.ok) return { ok: false, code: `config:${r.error.code}` };
  const c = makeContext(ctx);
  let cfg = pipelineFrom(r.config);
  if (draft !== undefined && draft !== null) {
    if (typeof draft !== 'object' || draft.id !== nodeId) return { ok: false, code: 'bad-node' };
    try {
      const checked = checkPipeline({ ...cfg, nodes: cfg.nodes.map((n) => (n.id === nodeId ? draft : n)) }, { current: cfg });
      cfg = pipelineFrom({ ...r.config, pipeline: checked });
    } catch (e) {
      return { ok: false, code: e?.code ?? 'bad-config', detail: String(e?.message ?? e).slice(0, 200) };
    }
  }
  const node = cfg.nodes.find((n) => n.id === nodeId);
  if (!node || (node.kind !== 'gate' && node.kind !== 'summary')) return { ok: false, code: 'bad-node' };
  let state = null;
  let it = item;
  if (typeof url === 'string' && url !== '') {
    state = replayLedger(libraryDir).states.get(url) ?? null;
    if (!state) return { ok: false, code: 'unknown-url' };
    it = { url, title: state.title ?? '', source: state.source ?? '', date: state.date ?? '', summary: state.summary ?? readCachedBody(libraryDir, url) ?? '' };
  }
  if (!it || typeof it.url !== 'string' || it.url === '') return { ok: false, code: 'bad-argument' };
  const index = existsSync(join(libraryDir, 'index.jsonl')) ? readIndex(libraryDir) : [];
  const sourceTopic = topicOf(r.config, it.source);
  const related = relatedEntries(index, it, { topic: sourceTopic });
  let body;
  let materials = 'meta';
  if (node.kind === 'summary' || node.material === 'body') {
    const b = await fetchBody(it.url, c, { libraryDir, bodyMaxChars: cfg.bodyMaxChars });
    body = b.ok ? b.text : null;
    materials = b.ok ? 'body' : 'summary-only';
  }
  const common = { libraryDir, cfg, node, item: it, body, materials, related, topics: libraryTopics(r.config), sourceTopic, connector, round: 'preview', now: c.now, write: false };
  const out = node.kind === 'gate' ? await runGate(common) : await runSummary({ ...common, state });
  if (out.status === 'connection') return { ok: false, code: out.code, calls: out.calls };
  return { ok: true, status: out.status, output: out.output, verification: out.verification, calls: out.calls, nextStep: state ? nextStep(state, cfg) : undefined };
}
