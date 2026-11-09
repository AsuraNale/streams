// The main agent (v2 package C; docs/core-api.md 5.15; docs/design/v2/architecture.md 一、2.2): the transcript, the session
// cache, the situation, the turn (JSON answer, lookups, proposal cards through package B), the compression.
//   store.mjs      agent/transcript.jsonl · session.json · notes.jsonl · usage.jsonl; AGENT_CWD (%TEMP%/streams-agent-cwd)
//   situation.mjs  situation(registry, { now, … })
//   protocol.mjs   AGENT_SYSTEM, checkAnswer
//   lookups.mjs    runLookup (read only)
//   turn.mjs       agentTurn, compressIfNeeded
//   fake.mjs       scriptedAgentConnector (tests, the desktop's development hook)
export {
  AGENT_DIR, TRANSCRIPT_FILE, SESSION_FILE, AGENT_NOTES_FILE, AGENT_USAGE_FILE, AGENT_CWD, AGENT_CWD_NAME, agentCwd, ROLES, NOTE_MAX, agentPaths,
  appendTranscript, readTranscript, isTranscriptRow, nextTurn, lastSummary, summarizedThrough, readSessions, writeSession, appendAgentNote, readAgentNotes,
} from './store.mjs';
export { situation, libraryFacts, SITUATION_MAX, BRIEF_CHARS, TRUNCATED_MARK } from './situation.mjs';
export {
  AGENT_SYSTEM, ANSWER_KEYS, LOOKUP_KINDS, MAX_LOOKUP_ROUNDS, LOOKUPS_PER_ANSWER, PROPOSALS_PER_ANSWER, ASK_OPTIONS, checkAnswer, topLevelKeys, replyTextOf, acceptedSuggestionNote,
} from './protocol.mjs';
export { runLookup, SOURCE_LOG_LINES, NOTES_SEARCH_MAX } from './lookups.mjs';
export {
  agentTurn, compressIfNeeded, charsSinceSummary, historyBlock, languageOf, droppedSentence, COMPRESS_THRESHOLD, AGENT_SUMMARY_MAX, RECENT_TURNS,
  NOT_UNDERSTOOD, NOTICE_CODES, TEXT_IN_MAX,
} from './turn.mjs';
export { scriptedAgentConnector, OUT_OF_SCRIPT } from './fake.mjs';
