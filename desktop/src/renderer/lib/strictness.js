// The three levels of 严格程度 (redesign R4a; core pipeline/strictness.mjs STRICTNESS, docs/core-api.md 5.18), as the page needs
// them to NAME a pair of pass thresholds on a proposal (redesign R5b: the card says the level and one sentence, never the
// numbers). The page cannot import the core: this is the same table, held equal to the core's by test/ui-r5b.test.mjs.
//   levelOf({ relevance, substance }) → 'loose' | 'standard' | 'strict' | 'custom' (exactly a level's two numbers, else custom)
//   placeOf({ relevance, substance }) → { lo, hi } (redesign R5b, precheck fix 1: where a custom pair stands, by BOTH thresholds)
//     lo  the strictest level the pair is at least as strict as on both (each threshold ≥ the level's), or null
//     hi  the loosest level the pair is at most as strict as on both (each threshold ≤ the level's), or null
//     e.g. 0.7 / 0.6 → { lo: 'standard', hi: 'strict' } (介于标准与严格之间) · 0.8 / 0.8 → { lo: 'strict', hi: null } (比严格更严) ·
//     0.3 / 0.4 → { lo: null, hi: 'loose' } (比宽松更宽) · 0.3 / 0.8 → { lo: null, hi: null } (one stricter, one looser than all)

export const STRICTNESS = Object.freeze({
  loose: Object.freeze({ relevance: 0.4, substance: 0.5 }),
  standard: Object.freeze({ relevance: 0.5, substance: 0.6 }),
  strict: Object.freeze({ relevance: 0.7, substance: 0.7 }),
})

const ORDER = ['loose', 'standard', 'strict']

export function levelOf(thresholds) {
  const r = thresholds?.relevance
  const s = thresholds?.substance
  for (const [level, t] of Object.entries(STRICTNESS)) if (t.relevance === r && t.substance === s) return level
  return 'custom'
}

export function placeOf(thresholds) {
  const r = Number(thresholds?.relevance)
  const s = Number(thresholds?.substance)
  const atLeast = l => r >= STRICTNESS[l].relevance && s >= STRICTNESS[l].substance
  const atMost = l => r <= STRICTNESS[l].relevance && s <= STRICTNESS[l].substance
  return { lo: [...ORDER].reverse().find(atLeast) ?? null, hi: ORDER.find(atMost) ?? null }
}
