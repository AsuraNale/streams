// A model gate on one item (product spec 4.4 "模型关卡的契约" + "输出不对怎么办"; core-api 4.3 "关卡怎么用它").
//
// runGate({ libraryDir, cfg, node, item, body, materials, related, connector, round, now, write })
//   prompt -> completeJson (no retry of its own) -> verifyOnce over the locked checklist (all rules: zero
//   extra calls) -> not passed: the same prompt plus RETRY_NOTE naming the failed items, once more ->
//   still not passed: ledger `unscored` (reason 'bad-format' | 'rule:<id>'); passed: ledger `scored`
//   (+ one `scored { node:<enum field>, value }` per enum output field, e.g. freshness).
//   -> { status: 'scored', score, passed, output, verification, calls, judgeCalls }
//   -> { status: 'unscored', reason, output?, verification?, calls, judgeCalls }
//   -> { status: 'connection', code, detail, calls, judgeCalls }     (login-expired, network…: the round stops)
//   redesign R2: `calls` is every call of the gate (its own and the check's); `judgeCalls` the part of them the check made
//   (the run record's 调用构成 = 相关度 / 实质 own calls + 核验)
//   write:false runs everything but writes nothing (previewNode).
//   「写给 AI 的话」 (v2 D1): detectAiInstructions on the material, plus the judge fallback item when the gate has judge
//   items (aiCheck). A mark is stamped on the attempt's verdicts.jsonl lines, recorded in ai-instructions.jsonl and
//   returned as `aiInstruction`; it never triggers the retry, never changes the score, never changes a prompt.
// countingConnector(connector) -> { connector, calls() }
//   every complete() is counted (usage.calls, 1 when absent); the round's cap sees gate calls, summary calls
//   and judge calls alike. A complete() that throws becomes { ok:false, code } so the round stops with
//   stoppedAt:'connection' instead of dying half-way.
// gapConnector(connector, { sleep, callGapMs }) -> connector
//   sleeps callGapMs before every complete() after the first (the per-round call gap of core-api 4.0).
import { completeJson } from '../connect/complete-json.mjs';
import { appendEvent } from '../library/ledger.mjs';
import { verifyOnce, appendVerdict, detectAiInstructions, aiInstructionMark, recordMark } from '../verify/index.mjs';
import { cfgOf } from './config.mjs';
import { gatePrompt, materialText, retryPrompt } from './prompts.mjs';

export const GATE_ATTEMPTS = 2;

export function gapConnector(connector, { sleep = async () => {}, callGapMs = 0 } = {}) {
  let first = true;
  return {
    ...connector,
    async complete(req) {
      if (!first && callGapMs > 0) await sleep(callGapMs);
      first = false;
      return connector.complete(req);
    },
  };
}

export function countingConnector(connector) {
  let n = 0;
  const wrapped = {
    ...connector,
    async complete(req) {
      let r;
      try {
        r = await connector.complete(req);
      } catch (e) {
        // a connector that throws (a crashed child process, a bug in a fake) is a connection failure, not a dead round
        r = { ok: false, code: typeof e?.code === 'string' && e.code !== '' ? e.code : 'unknown', detail: String(e?.message ?? e).slice(0, 300), usage: { calls: 1 } };
      }
      const u = r?.usage;
      n += typeof u?.calls === 'number' ? u.calls : 1;
      return r;
    },
  };
  return { connector: wrapped, calls: () => n };
}

export function scoreKeyOf(node) {
  for (const [k, v] of Object.entries(node.output ?? {})) if (v === 'score') return k;
  return null;
}

export function enumKeysOf(node) {
  return Object.entries(node.output ?? {}).filter(([, v]) => typeof v === 'string' && v.startsWith('enum:')).map(([k]) => k);
}

function failedOf(v) {
  return v.items.filter((it) => !it.passed);
}

export async function runGate({ libraryDir, cfg, node, item, body, materials, related = [], topics = [], sourceTopic, connector, round, now = () => new Date(), write = true } = {}) {
  const language = cfg.language;
  const prompt = gatePrompt({ node, item, body, related, topics, sourceTopic, language, bodyMaxChars: cfg.bodyMaxChars });
  const source = materialText({ item, body, bodyMaxChars: cfg.bodyMaxChars });
  const checklist = node.checklist ?? [];
  const counted = countingConnector(connector);
  // redesign R2: the check's own calls, counted apart (they are in counted.calls() as well)
  const judge = countingConnector(counted.connector);
  const scoreKey = scoreKeyOf(node);
  const nodeCfg = cfgOf(node);
  const mats = materials ?? node.material;
  let current = prompt;
  let last = null;
  let lastOutput;
  let lastVerification;
  const rule = detectAiInstructions(source);
  const judgeFlags = [];
  let mark = aiInstructionMark(rule);
  const recordIt = () => { if (write && mark) recordMark(libraryDir, mark, { at: now().toISOString(), source: item.source ?? '', itemId: item.url, node: node.id }); };
  recordIt();
  const withMark = (out) => ({ ...(mark ? { ...out, aiInstruction: mark } : out), judgeCalls: judge.calls() });

  for (let attempt = 1; attempt <= GATE_ATTEMPTS; attempt++) {
    const r = await completeJson(counted.connector, { prompt: current, format: 'json', model: 'main' }, { retries: 0 });
    if (!r.ok) {
      if (r.code !== 'bad-format') return { status: 'connection', code: r.code, detail: r.detail, calls: counted.calls(), judgeCalls: judge.calls() };
      last = { reason: 'bad-format', failed: ['bad-format'] };
      current = retryPrompt(prompt, last.failed, language);
      continue;
    }
    const v = await verifyOnce({ task: `gate:${node.id}`, checklist, output: r.json, claimed: [], source, connector: judge.connector, aiCheck: true });
    lastOutput = r.json;
    lastVerification = v;
    if (v.aiJudge) judgeFlags.push(v.aiJudge);
    const before = mark;
    mark = aiInstructionMark(rule, judgeFlags);
    if (mark && !before) recordIt();
    if (write) appendVerdict(libraryDir, { node: node.id, url: item.url, round: attempt, items: v.items, ts: now().toISOString(), ...(mark ? { aiInstruction: mark } : {}) });
    if (v.code && v.code !== 'bad-format') return { status: 'connection', code: v.code, detail: 'judge call failed', calls: counted.calls(), judgeCalls: judge.calls() };
    if (v.passed) {
      const score = r.json[scoreKey];
      if (write) {
        const ts = now().toISOString();
        appendEvent(libraryDir, { ts, ev: 'scored', url: item.url, node: node.id, score, reason: r.json.reason, quote: r.json.quote, materials: mats, cfg: nodeCfg, round });
        for (const k of enumKeysOf(node)) appendEvent(libraryDir, { ts, ev: 'scored', url: item.url, node: k, value: r.json[k], reason: r.json.reason, cfg: nodeCfg, round });
      }
      return withMark({ status: 'scored', score, passed: score >= node.threshold, output: r.json, verification: v, calls: counted.calls() });
    }
    const failed = failedOf(v);
    last = { reason: `rule:${failed[0].id}`, failed };
    current = retryPrompt(prompt, failed, language);
  }

  if (write) appendEvent(libraryDir, { ts: now().toISOString(), ev: 'unscored', url: item.url, node: node.id, reason: last.reason, cfg: nodeCfg, round });
  return withMark({ status: 'unscored', reason: last.reason, output: lastOutput, verification: lastVerification, calls: counted.calls() });
}
