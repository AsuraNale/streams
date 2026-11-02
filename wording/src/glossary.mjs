// Lookups over glossary.json: internal word -> what to say to the user.

import { loadGlossary } from './data.mjs'

/**
 * Glossary entries indexed by id.
 * @param {object} [glossary]
 * @returns {Map<string, object>}
 */
export function entriesById(glossary = loadGlossary()) {
  return new Map(glossary.entries.map(entry => [entry.id, entry]))
}

/**
 * What to say to the user instead of an internal word. Exact match on one of a
 * term's `internal` spellings (ASCII letters compared case-insensitively).
 * @param {string} internal - e.g. 'Silver', 'judge', 'promote'
 * @param {object} [glossary]
 * @returns {{entry: string, action: string, zh: string|null, en: string|null, gloss: string|null}|null}
 */
export function userTerm(internal, glossary = loadGlossary()) {
  const needle = String(internal).toLowerCase()
  for (const entry of glossary.entries) {
    for (const term of entry.terms) {
      if (term.internal.some(word => word.toLowerCase() === needle)) {
        return { entry: entry.id, action: term.action, zh: term.zh ?? null, en: term.en ?? null, gloss: term.gloss ?? null }
      }
    }
  }
  return null
}

/**
 * The user's word for one of the five fetch states (glossary.fetch_states: ok · empty · gap · failed · blocked).
 * @param {string} state
 * @param {'zh'|'en'} [lang]
 * @returns {string|null} null for an unknown state (callers decide how to show that)
 */
export function fetchStateWord(state, lang = 'zh', glossary = loadGlossary()) {
  const found = glossary.fetch_states.find(s => s.id === state)
  return found ? found[lang] ?? null : null
}
