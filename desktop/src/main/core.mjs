/**
 * The core (`core/`, @streams/core: the library, the fetchers, the connections, the pipeline, the verification) as the
 * main process sees it — one import, re-exported, so every service takes it from here and nothing else reaches into
 * core/src/. The core is plain Node with no dependencies (docs/core-api.md); it runs in the main process only, never
 * in the page.
 * @module desktop/main/core
 */

export * from '../../../core/src/index.mjs'
