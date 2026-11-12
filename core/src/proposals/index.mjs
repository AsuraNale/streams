// Public surface of the proposal cards and 「谁定的」 (v2 package B; docs/core-api.md 5.13). src/index.mjs re-exports this.
export {
  PROPOSAL_KINDS, LIBRARY_KINDS, TOPIC_OPS, COMPUTED_KEYS, OPS_MAX, KEYWORDS_MAX, KEYWORD_MAX, TOPICS_MAX, SOURCES_MAX, checkParams,
} from './params.mjs';
export {
  PROPOSAL_BY, WHY_MAX, REVISE_MAX, UNTICKED_TRIAL_STATES, CREATE_STEPS, KIND_FIELDS, HASH_FIELDS, newProposalId, libraryFolderName, folderState, trialOf,
  draftProposal, confirmProposal, declineProposal, reviseProposal, assertPending, hashOf,
} from './proposals.mjs';
export { PROPOSALS_FILE, PROPOSAL_STATUSES, libraryProposalsPath, isCard, appendProposal, readProposals } from './store.mjs';
export {
  CHANGES_FILE, CHANGE_FIELDS, CHANGE_BY, changesPath, thresholdsOf, fieldValue, snapshot, recordChange, recordChanges, readChanges, whoDecided, changeLog,
} from './changes.mjs';
