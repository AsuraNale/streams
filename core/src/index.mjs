// @streams/core — public surface of the library layer (W1).
export { StreamsError } from './errors.mjs';
export { parseFrontmatter, serializeFrontmatter, KEY_ORDER } from './library/frontmatter.mjs';
export { validateNote, NOTE_STATUSES, REQUIRED_FIELDS, isIsoDate, idFromFileName } from './library/validate.mjs';
export { readConfig, topicNames, nodeIds, CONFIG_FILE } from './library/config.mjs';
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
