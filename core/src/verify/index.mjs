// Verification layer (product spec 4.11, core-api 4.3): a checker that does not do the task.
//
//   rules.mjs      deterministic rule operators, zero model calls
//   checklist.mjs  the built-in items a summary is checked by against the stored original (1.1 W7b: v1.0's checklists of the
//                  scoring steps are core/legacy's)
//   judge.mjs      the one independent judge call per output (all judge items packed together)
//   verify.mjs     verifyOnce (rules first, judge second) and verifyLoop (feedback = failed items only)
//   verdicts.mjs   _pipeline/verdicts.jsonl, one line per item per round
//   original-check.mjs   1.1 W3: where a point's sentence is in the stored original; the numbers of a text
//   summary.mjs          1.1 W3: checkSummary, a summary checked against the original kept in the library
//   ai-instructions.mjs  「写给 AI 的话」: the fixed-pattern rule, the judge fallback item, _pipeline/ai-instructions.jsonl
// Nothing here writes the ledger or notes/.
export { checkRule, countWords, parseRule, RULE_OPS } from './rules.mjs';
export { originalChecklist, BANNED_WORDS } from './checklist.mjs';
export { judgeItems, buildJudgePrompt, JUDGE_PROMPT } from './judge.mjs';
export { verifyOnce, verifyLoop } from './verify.mjs';
export { detectAiInstructions, normalizeForDetect, AI_INSTRUCTION_PATTERNS, AI_JUDGE_ITEM, AI_INSTRUCTIONS_FILE, AI_INSTRUCTION_BY, aiInstructionsPath, readAiInstructions, recordAiInstruction, aiInstructionMark, recordMark } from './ai-instructions.mjs';
export { appendVerdict, readVerdicts, recentVerdictFailures, verdictsFor, verdictsPath, VERDICTS_FILE } from './verdicts.mjs';
export { locateQuote, numbersIn, missingNumbers, QUOTE_MIN_CHARS } from './original-check.mjs';
export { checkSummary, JUDGE_MAX_CHARS } from './summary.mjs';
