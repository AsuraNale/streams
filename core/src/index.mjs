// @streams/core — public surface of the library layer (W1).
export { StreamsError } from './errors.mjs';
export { parseFrontmatter, serializeFrontmatter, KEY_ORDER } from './library/frontmatter.mjs';
export { validateNote, NOTE_STATUSES, REQUIRED_FIELDS, isIsoDate, idFromFileName } from './library/validate.mjs';
export { readConfig, topicNames, nodeIds, CONFIG_FILE } from './library/config.mjs';
export { extractWikiLinks, resolveLinks } from './library/links.mjs';
export { rebuildIndex, readIndex, formatIndexLine, INDEX_FILE, INDEX_META_FILE, INDEX_KEYS } from './library/index.mjs';
export { appendEvent, replayLedger, recordSeen, isSeen, LEDGER_FILE, LEDGER_EVENTS } from './library/ledger.mjs';
export { listPending } from './library/pending.mjs';
export { writeNoteFile, WRITE_NOTE_BY } from './library/write-note.mjs';
export { createLibrary, DEFAULT_NODE_IDS } from './library/create.mjs';
export { scanLibrary, listNoteFiles, NOTES_DIR } from './library/scan.mjs';

// W2 fetch layer and W3 connection layer (wired 2026-11-02 evening).
export * from './fetch/index.mjs';
export * from './connect/index.mjs';
