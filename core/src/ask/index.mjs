// Public surface of 问库 (W5, core-api 5.5). src/index.mjs re-exports this.
export { ask, askCandidates, askChecklist, applyFallback, checkView, questionKey, ASK_NODE, MAX_CANDIDATES, BODY_CHARS, TOTAL_CHARS } from './ask.mjs';
export { askPrompt, materialsText, askPreambleFor, ASK_PREAMBLE, ASK_PREAMBLE_EN } from './prompts.mjs';
export { demands, addDemand, answerFeedback, appendDemandLine, topicKey, DEMAND_FILE, FEEDBACK_FILE, SUGGEST_THRESHOLD } from './demand.mjs';
