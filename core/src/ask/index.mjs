// Public surface of 问库 (W5, core-api 5.5). src/index.mjs re-exports this.
export { ask, askCandidates, askChecklist, applyFallback, checkView, questionKey, ASK_NODE, MAX_CANDIDATES, BODY_CHARS, TOTAL_CHARS } from './ask.mjs';
export { askPrompt, materialsText, askPreambleFor, ASK_PREAMBLE, ASK_PREAMBLE_EN } from './prompts.mjs';
export { demands, demandsAdded, addDemand, answerFeedback, appendDemandLine, topicKey, DEMAND_FILE, FEEDBACK_FILE, SUGGEST_AT } from './demand.mjs';
export { routeMessage, routeByRules, routeSignals, routePrompt, readRouteAnswer, appendRouteLine, readRoutes, CHANGE_SIGNALS, QUESTION_SIGNALS, ROUTES, ROUTES_FILE, ROUTE_TEXT_CHARS, RULE_CONFIDENCE, MODEL_MIN_CONFIDENCE, ROUTE_RETRIES, ROUTE_PROMPT_HEAD } from './route.mjs';
