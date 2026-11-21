// @streams/core — public surface of the library layer (W1).
export { StreamsError } from './errors.mjs';
export { parseFrontmatter, serializeFrontmatter, KEY_ORDER } from './library/frontmatter.mjs';
export { validateNote, NOTE_STATUSES, REQUIRED_FIELDS, isIsoDate, idFromFileName } from './library/validate.mjs';
export { readConfig, topicNames, nodeIds, CONFIG_FILE } from './library/config.mjs';
export { recordSetupStep, readSetup, SETUP_STEPS, SETUP_BY } from './library/setup.mjs';
export { readLibrarySchedule, saveLibrarySchedule, ensureLibrarySchedule } from './library/schedule.mjs';
export { extractWikiLinks, resolveLinks } from './library/links.mjs';
export { rebuildIndex, readIndex, formatIndexLine, INDEX_FILE, INDEX_META_FILE, INDEX_KEYS } from './library/index.mjs';
export { appendEvent, replayLedger, recordSeen, isSeen, LEDGER_FILE, LEDGER_EVENTS } from './library/ledger.mjs';
export { listPending, pendingView, applyProposedHeader, bodyHashOf } from './library/pending.mjs';
export { writeNoteFile, WRITE_NOTE_BY } from './library/write-note.mjs';
export { createLibrary, importFolder, countFirstLevelMd, DEFAULT_NODE_IDS } from './library/create.mjs';
export { scanLibrary, listNoteFiles, notesDir, NOTES_DIR, IMPORTED_NOTES_DIR } from './library/scan.mjs';
export { STARTER_PACKS, STARTER_PACK_IDS, BLANK_PACK_ID, starterPack, packView, listStarterPacks, applyStarterPack, applyStarterPackToLibrary } from './library/starter-packs.mjs';

// W2 fetch layer and W3 connection layer (wired 2026-11-02 evening).
export * from './fetch/index.mjs';
export * from './connect/index.mjs';

// W4 pipeline engine and verification layer (wired 2026-11-03).
export * from './pipeline/index.mjs';
export * from './verify/index.mjs';

// W5 library pages, editing, search, sources and topics, graph, ask (core-api section 5, 2026-11-03).
export { libraryCounts, listLibrary, readNote, notePath, noteBodyOf, LIBRARY_VIEWS } from './library/browse.mjs';
export { editNote, EDITABLE_KEYS } from './library/edit.mjs';
export { search, rankEntries, queryTokens, textTokens, scoreEntry, snippetOf, WEIGHTS, SEARCH_VIEWS } from './library/search.mjs';
export { sourcesView, guessSource, checkSource, addSource, updateSource, removeSource, setSourcePaused, addTopic, updateTopic, removeTopic, SOURCE_NAME_RE } from './library/sources.mjs';
export { isNoteId } from './library/write-note.mjs';
export * from './graph/index.mjs';
export * from './ask/index.mjs';

// v2 package A: the library registry (core-api 5.12, 2026-11-05).
export * from './registry/index.mjs';

// v2 package B: the library's brief, the proposal cards, 「谁定的」 (core-api 5.13, 2026-11-05).
export { readBrief, saveBrief, isBrief, BRIEF_MAX, saveLibraryName } from './library/brief.mjs';
export * from './proposals/index.mjs';
// v2 package D: rule-based suggestion cards (core-api 5.14, 2026-11-05). 「写给 AI 的话」 is exported with verify/ above.
export * from './suggest/index.mjs';
// v2 package C: the main agent (core-api 5.15, 2026-11-05); its session mode is exported with connect/ above.
export * from './agent/index.mjs';
// redesign R4a: a new library's settings, the same for 新建库's form and a confirmed card (core-api 5.18, 2026-11-12).
export { newLibrarySettings, fillNewLibrary, checkNewLibrary } from './library/new-library.mjs';
// 1.1 W1: the definition of objects and actions (core/src/ontology/streams.json), doing actions and their record, the two
// SOPs (core/src/sop/), and the start-up check (docs/checks/2026-11-20-1.1/contract-draft.md).
export {
  // (actionsFor is the suggestions' own name, suggest/act.mjs: the list an agent is given goes out as actionListFor)
  loadDefinition, checkDefinition, actionsFor as actionListFor, DEFINITION_PATH, DEFINITION_SCHEMA,
  createActionRunner, checkRequest as checkActionRequest, validate as validateActionParams,
  appendActionLog, readActionLog, ACTION_LOG, startupCheck,
  loadSop, renderSop, checkSops, placeholdersOf, SOP_DIR, SOP_NAMES,
} from './actions/index.mjs';
export {
  createPageReader, READ_REASONS, extractOriginal, cleanEdges, humanCheck, signInPage, errorPage,
  saveOriginal, readOriginal, originalFor, originalId, originalPath, pruneOriginals,
  ORIGINALS_DIR, ORIGINAL_METHODS, ORIGINAL_MISSING, RETAIN_DISMISSED_DAYS, sourceStateOf,
} from './read/index.mjs';
// 1.1 W3: a checked summary into 待看 (the update, W5, calls it)
export { putInInbox } from './update/inbox.mjs';
// 1.1 W4: building a library (build/index.mjs). Named one by one: a name here would hide another module's of the same name
export {
  checkQuestion, answerText, QUESTION_LIMITS, QUESTION_KINDS,
  checkCard, cardUrls, urlKey as cardUrlKey, sameUrl, renderCard, CARD_PARTS, DEFINITION_LINES, MAX_DECISIONS, CARD_WORDS,
  toolsText, budgetText, actionsText, OUTPUT_TEXT, BUILD_BUDGET,
  createBuild, buildPrompt as buildBuildPrompt, problemText, MAX_BUILD_TURNS,
  proposalCards, writeCard, readCard, cardHandlers, CARD_DIR, STATE_DIR, CARD_JSON, CARD_MD,
} from './build/index.mjs';
