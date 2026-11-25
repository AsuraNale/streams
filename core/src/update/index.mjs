// Updating a library (1.1 W5): the code reads the card's sources for new links and keeps their originals; one run of the
// update agent; what it hands in is checked and put in 待看.
//   links.mjs   the links of a source's page (direct, rendered when a script writes it)
//   state.mjs   _state/state.json: the links seen, the sources left unread, the originals carried over, the last agent run
//   format.mjs  what the code fills into the update SOP
//   run.mjs     runUpdate: one update
//   inbox.mjs   a checked summary into 待看 (W3); an item with no original, or no summary, into 待看 without one (B6)
export { linksOf, createLinkReader, FEW_LINKS, cleanLink, articleLike } from './links.mjs';
export { readState, writeState, statePath, sweepDaysOf, STATE_FILE } from './state.mjs';
export { UPDATE_BUDGET, UPDATE_TOOLS, UPDATE_OUTPUT, updateBudgetText, updateActionsText, stateText, newText, localStamp, FIRST_LOOKBACK_DAYS } from './format.mjs';
export { runUpdate, libraryUpdateBudget } from './run.mjs';
export { putInInbox, putMissingInInbox } from './inbox.mjs';
export { sourceRows, sourceHandlers } from './sources.mjs';
