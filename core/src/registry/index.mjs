// Public surface of the library registry (v2 package A; docs/core-api.md 5.12). src/index.mjs re-exports this.
export {
  REGISTRY_SCHEMA, REGISTRY_FILE, LIBRARY_COLORS, ID_RE, NAME_MAX, ICON_MAX, newLibraryId, defaultIcon, colorFor, isLibraryName,
  isLibraryIcon, isLibraryColor, emptyRegistry, normalizeRegistry, readRegistry, writeRegistry, libraryOf, libraryAt, withLibrary,
  withoutLibrary, withActive, withMeta, migrateRegistry,
} from './registry.mjs';
