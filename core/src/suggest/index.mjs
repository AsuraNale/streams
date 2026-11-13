// Suggestion cards (v2 package D2; 系统检测 since redesign R5a): rule-based, no model call.
//   rules.mjs    suggestFor: the five rules (redesign R5a: ① also 地址无效 twice, ⑤ the same quick reason three times), read-only
//   records.mjs  _pipeline/suggestions.jsonl: record / dismiss / accept / acted / expired / open / handled
//   act.mjs      redesign R5a (维护者 11-11 动作表): each card's actions, done by Streams' own code (no model call), the check that
//                a card still fits (expired otherwise), what the page and the model may see of it
export { suggestFor, overlapSuggestions, sourceFailingCase, topicKeywords, normalizeKeyword, jaccard, overlaps, SOURCE_FAILING_ROUNDS, SOURCE_FAILING_STATES, SOURCE_GAP_ROUNDS, TOPIC_OVERLAP_PERCENT, DISMISS_REASON_COUNT } from './rules.mjs';
export { recordSuggestions, dismissSuggestion, acceptSuggestion, actedSuggestion, expireSuggestion, openSuggestions, handledSuggestions, replaySuggestions, readSuggestionLines, suggestionKey, suggestionsPath, SUGGESTIONS_FILE, SUGGESTION_KINDS, SUGGESTION_EVENTS, SUGGESTION_STATUSES, REPLACED_REASONS } from './records.mjs';
export { SUGGESTION_ACTIONS, targetLevel, actionsFor, staleReason, checkSuggestions, suggestionFacts, suggestionText, handoffText, runSuggestionAction } from './act.mjs';
