// v1.0's warning about a round's scores (it left core/src/pipeline/numbers.mjs in 1.1 W7b with the scoring pipeline).
// constantScoreWarning(scored, { min }) -> '' | one line   (toolkit F3: one source, >= min items, all the same score)
export const MIN_CONSTANT_RUN = 5;

// scored: [{ url, source, score }] of one round. A warning, never a rejection: a machine cannot tell a
// lazy blanket score from a correct one (52 issue-index pages at 0.15 were right), so it reports and
// a person decides. Sources are listed in alphabetical order so the line is stable.
export function constantScoreWarning(scored, { min = MIN_CONSTANT_RUN } = {}) {
  const bySource = new Map();
  for (const s of Array.isArray(scored) ? scored : []) {
    if (!s || typeof s.score !== 'number' || !Number.isFinite(s.score)) continue;
    const src = typeof s.source === 'string' && s.source !== '' ? s.source : '?';
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src).push(s.score);
  }
  const flagged = [];
  for (const [src, scores] of bySource) {
    if (scores.length >= min && new Set(scores).size === 1) flagged.push(`${src} (${scores.length} items all at ${scores[0]})`);
  }
  if (flagged.length === 0) return '';
  flagged.sort();
  return `constant-score: ${flagged.join('; ')}`;
}
