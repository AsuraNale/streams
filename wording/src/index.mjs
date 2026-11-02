// @streams/wording — user-facing vocabulary for the app.
export { loadGlossary, loadBannedTerms } from './data.mjs'
export { userTerm, entriesById, fetchStateWord } from './glossary.mjs'
export {
  scanText, scanCard, scanPayload, scanStrings, formatForAgent, compileMatchers,
  CARD_TEXT_FIELDS, OPTION_TEXT_FIELDS, EXCLUDED_CARD_FIELDS,
} from './scanner.mjs'
