// @streams/core — public surface of the library layer (W1).
export { StreamsError } from './errors.mjs';
export { parseFrontmatter, serializeFrontmatter, KEY_ORDER } from './library/frontmatter.mjs';
export { validateNote, NOTE_STATUSES, REQUIRED_FIELDS, isIsoDate, idFromFileName } from './library/validate.mjs';
export { readConfig, topicNames, CONFIG_FILE, FALLBACK_TOPIC } from './library/config.mjs';
// 1.1 W7b: the library's language (streams.json pipeline.language), what is left of v1.0's pipeline configuration
export { LANGUAGES, languageOfConfig } from './library/language.mjs'; // (not languageOf: that name was v2's main agent's, for another thing)
export { recordSetupStep, readSetup, SETUP_STEPS, SETUP_BY } from './library/setup.mjs';
export { readLibrarySchedule, saveLibrarySchedule, ensureLibrarySchedule } from './library/schedule.mjs';
// 1.1.2 (第 4 件): how much one update of a library may do (streams.json update.volume)
export { VOLUMES, DEFAULT_VOLUME, VOLUME_FACTOR, STANDARD_UPDATE, READS_OVER_SOURCES, isVolume, readLibraryVolume, saveLibraryVolume, updateBudgetFor } from './library/volume.mjs';
export { extractWikiLinks, resolveLinks } from './library/links.mjs';
export { rebuildIndex, readIndex, formatIndexLine, INDEX_FILE, INDEX_META_FILE, INDEX_KEYS } from './library/index.mjs';
export { appendEvent, replayLedger, recordSeen, isSeen, LEDGER_FILE, LEDGER_EVENTS } from './library/ledger.mjs';
export { listPending, pendingView, applyProposedHeader, bodyHashOf } from './library/pending.mjs';
export { writeNoteFile, WRITE_NOTE_BY } from './library/write-note.mjs';
export { createLibrary, importFolder, countFirstLevelMd, libraryFolderName } from './library/create.mjs';
export { scanLibrary, listNoteFiles, notesDir, NOTES_DIR, IMPORTED_NOTES_DIR } from './library/scan.mjs';

// W2 fetch layer and W3 connection layer (wired 2026-11-02 evening).
export * from './fetch/index.mjs';
export * from './connect/index.mjs';

// W4 pipeline engine and verification layer (wired 2026-11-03). 1.1 W7b: of the pipeline, only the inbox, the decisions, the
// run records and the schedule are left in core/src (v1.0's scoring pipeline is core/legacy/, not shipped).
export * from './pipeline/index.mjs';
export * from './verify/index.mjs';

// W5 library pages, editing, search, sources and topics, graph, ask (core-api section 5, 2026-11-03).
export { libraryCounts, listLibrary, readNote, notePath, noteBodyOf, LIBRARY_VIEWS } from './library/browse.mjs';
export { editNote, EDITABLE_KEYS } from './library/edit.mjs';
export { search, rankEntries, queryTokens, textTokens, scoreEntry, snippetOf, WEIGHTS, SEARCH_VIEWS } from './library/search.mjs';
export { sourcesView, guessSource, checkSource, addSource, updateSource, removeSource, setSourcePaused, addTopic, updateTopic, removeTopic, SOURCE_NAME_RE, SOURCE_KINDS } from './library/sources.mjs';
export { isNoteId } from './library/write-note.mjs';
export * from './graph/index.mjs';
export * from './ask/index.mjs';

// v2 package A: the library registry (core-api 5.12, 2026-11-05).
export * from './registry/index.mjs';

// v2 package B: the library's brief and 「谁定的」 (core-api 5.13, 2026-11-05). 1.1 W7b: v2's proposal cards, its rule-based
// suggestion cards and its main agent left core/src; the change log stayed (library/changes.mjs), knowing only the brief, the
// sources, the topics, the schedule and the name.
export { readBrief, saveBrief, isBrief, BRIEF_MAX, saveLibraryName } from './library/brief.mjs';
export {
  CHANGES_FILE, CHANGE_FIELDS, CHANGE_BY, changesPath, fieldValue, snapshot, recordChange, recordChanges, readChanges, whoDecided, changeLog,
} from './library/changes.mjs';
// 1.1 W1: the definition of objects and actions (core/src/ontology/streams.json), doing actions and their record, the two
// SOPs (core/src/sop/), and the start-up check (docs/checks/2026-11-20-1.1/contract-draft.md).
export {
  // (the list an agent is given goes out as actionListFor: actionsFor was v2's suggestion cards' name, which 1.1 W7b took out)
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
// 1.1 W3 / W5: updating a library (update/index.mjs). Named one by one: a name here would hide another module's
export {
  putInInbox, putMissingInInbox, runUpdate, libraryUpdateBudget, linksOf, createLinkReader, FEW_LINKS, cleanLink, articleLike, localStamp, FIRST_LOOKBACK_DAYS, sourceRows, sourceHandlers,
  readState as readUpdateState, writeState as writeUpdateState, statePath as updateStatePath, sweepDaysOf, STATE_FILE,
  UPDATE_BUDGET, UPDATE_TOOLS, UPDATE_OUTPUT, updateBudgetText, updateActionsText, stateText as updateStateText, newText as updateNewText,
} from './update/index.mjs';
// 1.1 W4: building a library (build/index.mjs). Named one by one: a name here would hide another module's of the same name
export {
  checkQuestion, answerText, QUESTION_LIMITS, QUESTION_KINDS,
  checkCard, cardUrls, urlKey as cardUrlKey, sameUrl, renderCard, cardChanges, CARD_PARTS, DEFINITION_LINES, MAX_DECISIONS, CARD_WORDS,
  toolsText, budgetText, actionsText, OUTPUT_TEXT, BUILD_BUDGET,
  createBuild, buildPrompt as buildBuildPrompt, problemText, MAX_BUILD_TURNS,
  proposalCards, writeCard, readCard, cardHandlers, splitVolume, CARD_DIR, STATE_DIR, CARD_JSON, CARD_MD,
  buildContext, volumeBlock, conversationsBlock, lastUpdateBlock, nearLimit, NOT_READ_FOR_LIMIT, CONTEXT_LIMITS, VOLUME_WORDS, countLimitOf,
} from './build/index.mjs';
