// streams.json `pipeline`: defaults, reading with defaults filled in, validated writing (core-api 4.0).
//
// DEFAULT_PIPELINE(language)         the seven default nodes with the default requirement texts
// pipelineConfig(libraryDir)         { cap, callGapMs, maxVerifyRounds, bodyMaxChars, cacheDays, language, nodes }
//                                    missing nodes / keys get defaults; every gate and the summary carries a locked
//                                    `checklist` = user items (origin 'user') + baseline items (origin 'streams',
//                                    generated from `output`, never stored)
// savePipelineConfig(libraryDir, cfg) validates and writes `pipeline` back, other keys untouched
//                                    throws locked-node (fixed node removed / changed, output changed, baseline item
//                                    removed or taken over) or bad-config (threshold, kind, material, counts, numbers)
// cfgOf(node)                        sha1 of requirement + threshold + material + output (+ brief), first 8 hex chars; the
//                                    ledger's scored / unscored events carry it (same url, same gate, same cfg: never twice)
//                                    redesign R5a (维护者 11-12 第 4 条): the 相关度 gate (BRIEF_GATE) carries the library's
//                                    追踪要求 as node.brief (pipelineFrom puts it there from streams.json `brief`; never stored
//                                    in `pipeline`); its prompt shows it and its cfg covers it. A library without a brief: no
//                                    brief key, the cfg is the one it always had.
// gateNodes(cfg) / summaryNode(cfg)  the model nodes in pipeline order
import { createHash } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { loadWhole, saveWhole } from '../library/setup.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { gateBaseline, summaryBaseline, lockChecklist } from '../verify/index.mjs';
import { DEFAULT_REQUIREMENTS, LANGUAGES, languageOf } from './prompts.mjs';

export const NODE_KINDS = ['fixed', 'script', 'gate', 'summary'];
export const MATERIALS = ['meta', 'body'];
export const MAX_GATES = 5;
export const FIXED_NODE_IDS = ['fetch', 'decide', 'store'];
export const SCRIPT_NODE_IDS = ['dedup'];
export const DEFAULTS = { cap: 120, callGapMs: 0, maxVerifyRounds: 2, bodyMaxChars: 6000, cacheDays: 7, language: 'zh-CN' };
const NUMBER_KEYS = ['cap', 'callGapMs', 'maxVerifyRounds', 'bodyMaxChars', 'cacheDays'];

export function DEFAULT_PIPELINE(language = 'zh-CN') {
  const lang = languageOf(language);
  const req = DEFAULT_REQUIREMENTS[lang];
  return {
    ...DEFAULTS,
    language: lang,
    nodes: [
      { id: 'fetch', kind: 'fixed' },
      { id: 'dedup', kind: 'script' },
      { id: 'relevance', kind: 'gate', threshold: 0.7, material: 'meta', requirement: req.relevance, output: { relevance: 'score', reason: 'text', quote: 'text' }, checklist: [] },
      { id: 'substance', kind: 'gate', threshold: 0.6, material: 'body', requirement: req.substance, output: { substance: 'score', freshness: 'enum:new|followup|duplicate', reason: 'text', quote: 'text' }, checklist: [] },
      { id: 'summary', kind: 'summary', requirement: req.summary, output: { what: 'text', points: 'list:3', quote: 'text' }, checklist: [] },
      { id: 'decide', kind: 'fixed' },
      { id: 'store', kind: 'fixed' },
    ],
  };
}

export function defaultGateOutput(id) {
  return { [id]: 'score', reason: 'text', quote: 'text' };
}

// redesign R5a: the scoring step whose prompt carries the library's 追踪要求 (the 相关度 gate)
export const BRIEF_GATE = 'relevance';

export function briefOf(config) {
  return typeof config?.brief === 'string' && config.brief.trim() !== '' ? config.brief.trim() : undefined;
}

export function cfgOf(node) {
  const brief = typeof node?.brief === 'string' && node.brief !== '' ? node.brief : undefined;
  const key = JSON.stringify({ requirement: node?.requirement, threshold: node?.threshold, material: node?.material, output: node?.output, brief });
  return createHash('sha1').update(key).digest('hex').slice(0, 8);
}

export function baselineFor(node) {
  if (node.kind === 'gate') return gateBaseline(node);
  if (node.kind === 'summary') return summaryBaseline();
  return [];
}

export function userItems(checklist) {
  return (Array.isArray(checklist) ? checklist : []).filter((it) => isPlainObject(it) && it.origin !== 'streams');
}

// The locked checklist of a model node: user items first, baseline last.
export function lockedChecklist(node) {
  return lockChecklist(userItems(node.checklist), { baseline: baselineFor(node) }).items;
}

function scoreKeyOf(node) {
  for (const [k, v] of Object.entries(node.output ?? {})) if (v === 'score') return k;
  return null;
}

// Merge a stored node onto its default; a stored node with an id the defaults do not know is a user gate.
function mergeNode(stored, def, language) {
  if (def && (def.kind === 'fixed' || def.kind === 'script')) return { id: def.id, kind: def.kind };
  if (def) {
    const out = { ...def };
    for (const k of ['threshold', 'material', 'requirement']) if (stored[k] !== undefined) out[k] = stored[k];
    out.checklist = userItems(stored.checklist);
    return out;
  }
  const out = { id: stored.id, kind: stored.kind };
  if (stored.kind === 'gate') {
    out.threshold = stored.threshold !== undefined ? stored.threshold : 0.7;
    out.material = stored.material !== undefined ? stored.material : 'meta';
    out.requirement = typeof stored.requirement === 'string' ? stored.requirement : DEFAULT_REQUIREMENTS[language].relevance;
    out.output = isPlainObject(stored.output) ? stored.output : defaultGateOutput(stored.id);
    out.checklist = userItems(stored.checklist);
  } else if (stored.kind === 'summary') {
    out.requirement = typeof stored.requirement === 'string' ? stored.requirement : DEFAULT_REQUIREMENTS[language].summary;
    out.output = isPlainObject(stored.output) ? stored.output : { what: 'text', points: 'list:3', quote: 'text' };
    out.checklist = userItems(stored.checklist);
  }
  return out;
}

// Resolve stored nodes against the defaults. Nodes without a `kind` (the W1 placeholder shape
// [{id:'relevance'},{id:'substance'},{id:'freshness'}]) are treated as "use the default of that id".
export function resolveNodes(storedNodes, language) {
  const defaults = DEFAULT_PIPELINE(language).nodes;
  const byId = new Map(defaults.map((d) => [d.id, d]));
  const list = Array.isArray(storedNodes) ? storedNodes.filter((n) => isPlainObject(n) && typeof n.id === 'string') : [];
  const out = [];
  const have = new Set();
  for (const stored of list) {
    if (have.has(stored.id)) continue;
    const def = byId.get(stored.id);
    if (!def && !NODE_KINDS.includes(stored.kind)) continue; // an unknown id without a kind: nothing to run
    out.push(mergeNode(stored, def, language));
    have.add(stored.id);
  }
  // missing defaults go back where they belong: right after the previous default that is present
  defaults.forEach((def, i) => {
    if (have.has(def.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((n) => n.id === defaults[j].id);
      if (k >= 0) { at = k + 1; break; }
    }
    out.splice(at, 0, structuredClone(def));
    have.add(def.id);
  });
  return out;
}

function withChecklists(nodes) {
  return nodes.map((n) => (n.kind === 'gate' || n.kind === 'summary' ? { ...n, checklist: lockedChecklist(n) } : n));
}

export function pipelineFrom(config) {
  const p = isPlainObject(config?.pipeline) ? config.pipeline : {};
  const language = languageOf(p.language);
  const out = { ...DEFAULTS, language };
  for (const k of NUMBER_KEYS) if (Number.isInteger(p[k]) && p[k] >= 0) out[k] = p[k];
  out.nodes = withChecklists(resolveNodes(p.nodes, language));
  // redesign R5a: the 追踪要求 rides on the 相关度 gate (its prompt and its cfg), not stored in `pipeline`
  const brief = briefOf(config);
  if (brief !== undefined) out.nodes = out.nodes.map((n) => (n.id === BRIEF_GATE && n.kind === 'gate' ? { ...n, brief } : n));
  return out;
}

export function pipelineConfig(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  return pipelineFrom(r.config);
}

export function gateNodes(cfg) {
  return cfg.nodes.filter((n) => n.kind === 'gate');
}

export function summaryNode(cfg) {
  return cfg.nodes.find((n) => n.kind === 'summary');
}

function bad(message) {
  return new StreamsError('bad-config', message);
}

function locked(message) {
  return new StreamsError('locked-node', message);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Validate a pipeline object the way the desktop sends it back (the shape pipelineConfig returns).
export function checkPipeline(cfg, { current } = {}) {
  if (!isPlainObject(cfg)) throw bad('pipeline must be an object');
  const language = cfg.language === undefined ? (current?.language ?? DEFAULTS.language) : cfg.language;
  if (!LANGUAGES.includes(language)) throw bad(`language must be one of ${LANGUAGES.join(' | ')}`);
  const out = { ...DEFAULTS, ...(current ? pickNumbers(current) : {}), language };
  for (const k of NUMBER_KEYS) {
    if (cfg[k] === undefined) continue;
    if (!Number.isInteger(cfg[k]) || cfg[k] < 0) throw bad(`${k} must be a non-negative integer`);
    out[k] = cfg[k];
  }
  if (!Array.isArray(cfg.nodes)) throw bad('pipeline.nodes must be an array');
  const defaults = new Map(DEFAULT_PIPELINE(language).nodes.map((d) => [d.id, d]));
  const currentById = new Map((current?.nodes ?? []).map((n) => [n.id, n]));
  const seen = new Set();
  const nodes = [];
  for (const [i, n] of cfg.nodes.entries()) {
    if (!isPlainObject(n) || typeof n.id !== 'string' || n.id.trim() === '') throw bad(`nodes[${i}] must be an object with a non-empty id`);
    if (seen.has(n.id)) throw bad(`duplicate node id "${n.id}"`);
    seen.add(n.id);
    const def = defaults.get(n.id);
    const kind = n.kind === undefined && def ? def.kind : n.kind;
    if (!NODE_KINDS.includes(kind)) throw bad(`nodes[${i}] "${n.id}": unknown kind "${String(n.kind)}"`);
    if (def && def.kind !== kind) throw locked(`node "${n.id}" is a ${def.kind} node and cannot become ${kind}`);
    if (!def && (kind === 'fixed' || kind === 'script')) throw locked(`node "${n.id}": only the built-in fixed / script nodes exist`);
    if (kind === 'fixed' || kind === 'script') { nodes.push({ id: n.id, kind }); continue; }

    const node = { id: n.id, kind };
    const prev = currentById.get(n.id);
    if (kind === 'gate') {
      node.threshold = n.threshold !== undefined ? n.threshold : (prev?.threshold ?? def?.threshold ?? 0.7);
      if (typeof node.threshold !== 'number' || !Number.isFinite(node.threshold) || node.threshold < 0 || node.threshold > 1) throw bad(`node "${n.id}": threshold must be a number between 0 and 1`);
      node.material = n.material !== undefined ? n.material : (prev?.material ?? def?.material ?? 'meta');
      if (!MATERIALS.includes(node.material)) throw bad(`node "${n.id}": material must be ${MATERIALS.join(' | ')}`);
    }
    node.requirement = n.requirement !== undefined ? n.requirement : (prev?.requirement ?? def?.requirement ?? DEFAULT_REQUIREMENTS[language][kind === 'gate' ? 'relevance' : 'summary']);
    if (typeof node.requirement !== 'string' || node.requirement.trim() === '') throw bad(`node "${n.id}": requirement must be a non-empty string`);
    const expectedOutput = def ? def.output : (prev?.output ?? (kind === 'gate' ? defaultGateOutput(n.id) : { what: 'text', points: 'list:3', quote: 'text' }));
    if (n.output !== undefined && !sameJson(n.output, expectedOutput)) throw locked(`node "${n.id}": output is fixed (the scripts parse it)`);
    node.output = structuredClone(expectedOutput);
    if (kind === 'gate' && !scoreKeyOf(node)) throw bad(`node "${n.id}": output has no score field`);

    // the checklist: baseline items must all still be there; only user items are stored
    const baseline = baselineFor(node);
    if (n.checklist !== undefined) {
      if (!Array.isArray(n.checklist)) throw bad(`node "${n.id}": checklist must be an array`);
      const streamsIds = new Set(n.checklist.filter((it) => isPlainObject(it) && it.origin === 'streams').map((it) => it.id));
      for (const b of baseline) if (!streamsIds.has(b.id)) throw locked(`node "${n.id}": baseline check "${b.id}" cannot be removed`);
      const users = userItems(n.checklist);
      for (const it of users) if (baseline.some((b) => b.id === it.id)) throw locked(`node "${n.id}": check id "${it.id}" belongs to a baseline item`);
      node.checklist = users.map((it) => ({ ...it, origin: 'user' }));
    } else {
      node.checklist = userItems(prev?.checklist);
    }
    nodes.push(node);
  }
  for (const id of [...FIXED_NODE_IDS, ...SCRIPT_NODE_IDS]) if (!seen.has(id)) throw locked(`node "${id}" is fixed and cannot be removed`);
  const gates = nodes.filter((n) => n.kind === 'gate');
  if (gates.length > MAX_GATES) throw bad(`at most ${MAX_GATES} gate nodes, got ${gates.length}`);
  const summaries = nodes.filter((n) => n.kind === 'summary');
  if (summaries.length !== 1) throw bad(`exactly one summary node, got ${summaries.length}`);
  out.nodes = nodes;
  return out;
}

function pickNumbers(cfg) {
  const out = {};
  for (const k of NUMBER_KEYS) if (Number.isInteger(cfg[k])) out[k] = cfg[k];
  return out;
}

export function savePipelineConfig(libraryDir, cfg) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  const current = pipelineFrom(r.config);
  const pipeline = checkPipeline(cfg, { current });
  // the whole streams.json through a temporary file and a rename (setup.mjs saveWhole; v2 package B: every write of
  // streams.json is whole and atomic), every other key as it was
  const whole = loadWhole(libraryDir);
  whole.pipeline = pipeline;
  saveWhole(libraryDir, whole);
  return pipelineFrom(whole);
}
