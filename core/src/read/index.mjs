// 1.1 W2: reading a page three ways, the original's text, what a page is when it is not the article, the originals kept
// in the library folder, and a source's state from reading it.
export { createPageReader, READ_REASONS, MIN_GAP_MS, MAX_BYTES } from './read-page.mjs';
export { extractOriginal, cleanEdges, titleOf, ARTICLE_MIN as ORIGINAL_MIN } from './extract.mjs';
export { humanCheck, signInPage, errorPage } from './detect.mjs';
export {
  saveOriginal, readOriginal, originalFor, originalId, originalPath, pruneOriginals,
  ORIGINALS_DIR, ORIGINAL_METHODS, ORIGINAL_MISSING, RETAIN_DISMISSED_DAYS,
} from './original.mjs';
export { sourceStateOf } from './source-state.mjs';
