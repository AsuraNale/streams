// Suggestion cards (v2 package D2): rule-based, no model call, never acted on by code (维护者 11-05 「先不放权」).
//   rules.mjs    suggestFor: the four rules, read-only
//   records.mjs  _pipeline/suggestions.jsonl: record / dismiss / accept / open
export { suggestFor, topicKeywords, normalizeKeyword, jaccard, overlaps, SOURCE_FAILING_ROUNDS, SOURCE_FAILING_STATES, TOPIC_OVERLAP_PERCENT } from './rules.mjs';
export { recordSuggestions, dismissSuggestion, acceptSuggestion, openSuggestions, replaySuggestions, readSuggestionLines, suggestionKey, suggestionsPath, SUGGESTIONS_FILE, SUGGESTION_KINDS, SUGGESTION_EVENTS } from './records.mjs';
