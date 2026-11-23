// 严格程度 (redesign R4a; 维护者 11-11 第 8 题, N01; docs/core-api.md 5.18): a library's strictness is the pass thresholds of its
// two scoring steps — 相关度 (the gate `relevance`, else the first gate) and 实质 (`substance`, else the second gate).
//
// STRICTNESS                             { loose: { relevance: 0.4, substance: 0.5 }, standard: { 0.5, 0.6 }, strict: { 0.7, 0.7 } }
// STRICTNESS_LEVELS                      ['loose', 'standard', 'strict']
// DEFAULT_STRICTNESS                     'standard' — every new library (made by hand or from a confirmed card) starts here
// strictnessOf({ relevance, substance }) -> 'loose' | 'standard' | 'strict' | 'custom'   the level whose two numbers these are
//                                        exactly; anything else (one of them missing too) is 'custom'
// withThresholds(cfg, { relevance?, substance? }) -> a new configuration with those gates' thresholds set (a key left out is
//                                        left as it is); throws bad-config when the configuration has no gate for one given
// readStrictness(libraryDir)             -> { level, thresholds }   read only: nothing is written, whatever the numbers are
// saveStrictness(libraryDir, level)      -> { level, thresholds }   writes the level's two thresholds (savePipelineConfig: every
//                                        other key of streams.json, and of the pipeline, kept); throws bad-argument for an
//                                        unknown level
// Reading never rewrites: a library made before R4a keeps its numbers (the default pipeline's 0.7 / 0.6 is 'custom').
import { StreamsError } from '../../src/errors.mjs';
import { gateNodes, pipelineConfig, savePipelineConfig } from './config.mjs';
// the two numbers as v1.0's settings page and 「谁定的」 read them (the gate with that id, else by position)
import { thresholdsOf } from '../proposals/changes.mjs';

export const STRICTNESS = Object.freeze({
  loose: Object.freeze({ relevance: 0.4, substance: 0.5 }),
  standard: Object.freeze({ relevance: 0.5, substance: 0.6 }),
  strict: Object.freeze({ relevance: 0.7, substance: 0.7 }),
});
export const STRICTNESS_LEVELS = Object.freeze(['loose', 'standard', 'strict']);
export const DEFAULT_STRICTNESS = 'standard';

export function strictnessOf(thresholds) {
  const r = thresholds?.relevance;
  const s = thresholds?.substance;
  for (const level of STRICTNESS_LEVELS) {
    if (STRICTNESS[level].relevance === r && STRICTNESS[level].substance === s) return level;
  }
  return 'custom';
}

// the gate of a step: the one with that id, else the gate in its place (the pipeline page lets a user rename / reorder)
function gateFor(gates, key) {
  const i = key === 'relevance' ? 0 : 1;
  return gates.find((g) => g.id === key) ?? gates[i] ?? null;
}

export function withThresholds(cfg, { relevance, substance }) {
  const gates = gateNodes(cfg);
  const set = new Map();
  for (const [key, value] of [['relevance', relevance], ['substance', substance]]) {
    if (value === undefined) continue;
    const g = gateFor(gates, key);
    if (!g) throw new StreamsError('bad-config', `the pipeline has no gate for ${key}`);
    set.set(g.id, value);
  }
  return { ...cfg, nodes: cfg.nodes.map((n) => (set.has(n.id) ? { ...n, threshold: set.get(n.id) } : n)) };
}

export function readStrictness(libraryDir) {
  const thresholds = thresholdsOf(pipelineConfig(libraryDir));
  return { level: strictnessOf(thresholds), thresholds };
}

export function saveStrictness(libraryDir, level) {
  if (!STRICTNESS_LEVELS.includes(level)) throw new StreamsError('bad-argument', `strictness must be one of ${STRICTNESS_LEVELS.join(' / ')}, got ${JSON.stringify(level)}`);
  savePipelineConfig(libraryDir, withThresholds(pipelineConfig(libraryDir), STRICTNESS[level]));
  return readStrictness(libraryDir);
}
