// Loads the wording data files that sit next to this package: glossary.json and banned-terms.json. Plain
// readFileSync + JSON.parse so the module runs unchanged under Electron's bundled Node (no JSON-module imports).

import { readFileSync } from 'node:fs'

const ROOT = new URL('../', import.meta.url)
const cache = new Map()

/**
 * Read and parse one JSON file from the wording/ folder (cached).
 * @param {string} name - file name relative to wording/, e.g. 'glossary.json'
 * @returns {any}
 */
export function loadJson(name) {
  if (!cache.has(name)) {
    const text = readFileSync(new URL(name, ROOT), 'utf8')
    cache.set(name, JSON.parse(text))
  }
  return cache.get(name)
}

export const loadGlossary = () => loadJson('glossary.json')
export const loadBannedTerms = () => loadJson('banned-terms.json')

/** Absolute URL of the wording/ folder. */
export const WORDING_ROOT = ROOT
