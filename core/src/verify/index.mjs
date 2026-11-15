// Verification layer (product spec 4.11, core-api 4.3): a checker that does not do the task.
//
//   rules.mjs      deterministic rule operators, zero model calls
//   checklist.mjs  lock a checklist (drop vague / duplicate / ruleless items, cap, append baseline)
//                  and the baseline items for gates and for the summary
//   judge.mjs      the one independent judge call per output (all judge items packed together)
//   verify.mjs     verifyOnce (rules first, judge second) and verifyLoop (feedback = failed items only)
//   verdicts.mjs   _pipeline/verdicts.jsonl, one line per item per round
//   ai-instructions.mjs  「写给 AI 的话」: the fixed-pattern rule, the judge fallback item, _pipeline/ai-instructions.jsonl
// The pipeline layer (src/pipeline/) imports from here; nothing here writes the ledger or notes/.
export { checkRule, countWords, parseRule, RULE_OPS } from './rules.mjs';
export { lockChecklist, gateBaseline, summaryBaseline, baselineDescription, describeChecklist, BASELINE_LANGUAGES, BANNED_WORDS, CHECK_KINDS, MAX_CHECKLIST_ITEMS, MIN_DESC_CHARS } from './checklist.mjs';
export { judgeItems, buildJudgePrompt, JUDGE_PROMPT } from './judge.mjs';
export { verifyOnce, verifyLoop } from './verify.mjs';
export { detectAiInstructions, normalizeForDetect, AI_INSTRUCTION_PATTERNS, AI_JUDGE_ITEM, AI_INSTRUCTIONS_FILE, AI_INSTRUCTION_BY, aiInstructionsPath, readAiInstructions, recordAiInstruction, aiInstructionMark, recordMark } from './ai-instructions.mjs';
export { appendVerdict, readVerdicts, recentVerdictFailures, verdictsFor, verdictsPath, VERDICTS_FILE } from './verdicts.mjs';
