// The library registry (v2 package A; docs/core-api.md 5.12): which libraries the app knows, in
// <appData>\Streams\libraries.json:
//   { schema: 'streams.libraries/1', active: <id|null>, libraries: [{ id, path, name, icon, color, addedAt }] }
//     id       a short random string (ID_RE), made once when the library is registered and never changed
//     path     the library folder, an absolute path (each folder at most once; letter case does not count on Windows)
//     name     what the app calls it; default the folder name
//     icon     one or two characters; default the first character of the name
//     color    a colour token name of LIBRARY_COLORS (the name only, never a value); default by turn, in that order
//     addedAt  ISO time of the registration, or null when unknown
//     active   the current library's id; an id not in the list is the first library's (null when there is none)
// Read whole and checked field by field: a bad field is its default, a bad row (not an object, no usable id or path,
// an id or a folder already listed) is dropped and said through `log`. Written whole, through a temporary file and a
// rename, so a crash never leaves half a file. Removing a registration only drops the row: nothing on disk is touched.
//
// Pure functions over the registry object (each returns a new one): withLibrary · withoutLibrary · withActive · withMeta.
// migrateRegistry builds the first registry from v1.0's settings.json (libraryPath, recentLibraries).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const REGISTRY_SCHEMA = 'streams.libraries/1';
export const REGISTRY_FILE = 'libraries.json';
// the colour token names a library takes by turn (package F maps each to its token of the three themes)
export const LIBRARY_COLORS = Object.freeze(['river', 'violet', 'green', 'muted']);
export const ID_RE = /^[a-z0-9]{8}$/;
export const NAME_MAX = 100;
export const ICON_MAX = 2;

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const own = (o, k) => (isObject(o) && Object.hasOwn(o, k) ? o[k] : undefined);
const chars = (s) => [...s];
const pathKey = (p) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));

/** A new library id: 8 characters of [a-z0-9], not one of `taken`. */
export function newLibraryId(taken = []) {
  const used = new Set(taken);
  for (;;) {
    const id = [...randomBytes(8)].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    if (!used.has(id)) return id;
  }
}

/** The default icon of a name: its first character. */
export function defaultIcon(name) {
  return chars(String(name).trim())[0] ?? '?';
}

/** The colour the n-th library takes by turn. */
export function colorFor(n) {
  return LIBRARY_COLORS[((n % LIBRARY_COLORS.length) + LIBRARY_COLORS.length) % LIBRARY_COLORS.length];
}

export const isLibraryName = (v) => typeof v === 'string' && v.trim() !== '' && chars(v.trim()).length <= NAME_MAX;
export const isLibraryIcon = (v) => typeof v === 'string' && v.trim() !== '' && chars(v.trim()).length <= ICON_MAX;
export const isLibraryColor = (v) => LIBRARY_COLORS.includes(v);

/** The registry with no library. */
export function emptyRegistry() {
  return { schema: REGISTRY_SCHEMA, active: null, libraries: [] };
}

/**
 * The registry `raw` checked field by field.
 * @param {unknown} raw
 * @param {{ log?: (line: string) => void }} [o]
 */
export function normalizeRegistry(raw, { log = () => {} } = {}) {
  const rows = own(raw, 'libraries');
  const libraries = [];
  const ids = new Set();
  const paths = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row, i) => {
    const id = own(row, 'id');
    const path = own(row, 'path');
    if (typeof id !== 'string' || !ID_RE.test(id)) { log(`registry: row ${i} dropped: no usable id`); return; }
    if (typeof path !== 'string' || !isAbsolute(path)) { log(`registry: row ${i} (${id}) dropped: no absolute path`); return; }
    if (ids.has(id)) { log(`registry: row ${i} (${id}) dropped: the id is listed already`); return; }
    if (paths.has(pathKey(path))) { log(`registry: row ${i} (${id}) dropped: the folder ${path} is listed already`); return; }
    ids.add(id);
    paths.add(pathKey(path));
    const name = isLibraryName(own(row, 'name')) ? own(row, 'name').trim() : basename(path);
    const icon = isLibraryIcon(own(row, 'icon')) ? own(row, 'icon').trim() : defaultIcon(name);
    const color = isLibraryColor(own(row, 'color')) ? own(row, 'color') : colorFor(libraries.length);
    const addedAt = typeof own(row, 'addedAt') === 'string' && !Number.isNaN(Date.parse(own(row, 'addedAt'))) ? own(row, 'addedAt') : null;
    libraries.push({ id, path, name, icon, color, addedAt });
  });
  const active = own(raw, 'active');
  return { schema: REGISTRY_SCHEMA, active: ids.has(active) ? active : (libraries[0]?.id ?? null), libraries };
}

/**
 * The registry in `file`; a missing file is the empty registry, an unreadable one too (said through `log`).
 * @returns {{ schema: string, active: string|null, libraries: object[] }}
 */
export function readRegistry(file, { log = () => {} } = {}) {
  if (!existsSync(file)) return emptyRegistry();
  let data;
  try {
    let text = readFileSync(file, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    data = JSON.parse(text);
  } catch (e) {
    log(`registry: ${file} unreadable, read as empty: ${e.message}`);
    return emptyRegistry();
  }
  return normalizeRegistry(data, { log });
}

/**
 * Write the whole registry (checked first: what is written reads back the same) through a temporary file and a rename.
 * @returns {object} the registry written
 */
export function writeRegistry(file, registry) {
  const whole = normalizeRegistry(registry);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, JSON.stringify(whole, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  try {
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return whole;
}

/** The row of `id`, or null. */
export function libraryOf(registry, id) {
  return registry.libraries.find((l) => l.id === id) ?? null;
}

/** The row whose folder is `path` (letter case aside on Windows), or null. */
export function libraryAt(registry, path) {
  if (typeof path !== 'string' || !isAbsolute(path)) return null;
  const key = pathKey(path);
  return registry.libraries.find((l) => pathKey(l.path) === key) ?? null;
}

const unknown = (id) => new StreamsError('unknown-library', `no library ${JSON.stringify(id)} in the registry`);

/**
 * Register the folder `path` (an absolute path). Already registered: the registry as it is and that row.
 * @returns {{ registry: object, entry: object, added: boolean }}
 */
export function withLibrary(registry, path, { now = () => new Date(), name } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new StreamsError('bad-argument', 'a library folder must be an absolute path');
  const there = libraryAt(registry, path);
  if (there) return { registry, entry: there, added: false };
  const folder = resolve(path);
  const shown = isLibraryName(name) ? name.trim() : basename(folder);
  const entry = { id: newLibraryId(registry.libraries.map((l) => l.id)), path: folder, name: shown, icon: defaultIcon(shown), color: colorFor(registry.libraries.length), addedAt: now().toISOString() };
  return { registry: { ...registry, libraries: [...registry.libraries, entry] }, entry, added: true };
}

/**
 * Drop the registration of `id` (nothing on disk is touched). When it was the active one, the active one becomes the
 * library that takes its place in the list (the next one; the new last one when it was last), null when none is left.
 */
export function withoutLibrary(registry, id) {
  const i = registry.libraries.findIndex((l) => l.id === id);
  if (i < 0) throw unknown(id);
  const libraries = registry.libraries.filter((l) => l.id !== id);
  const active = registry.active !== id ? registry.active : (libraries[Math.min(i, libraries.length - 1)]?.id ?? null);
  return { ...registry, active, libraries };
}

/** `id` becomes the active library. */
export function withActive(registry, id) {
  if (!libraryOf(registry, id)) throw unknown(id);
  return { ...registry, active: id };
}

/**
 * Change the name, the icon or the colour of `id` (only the keys given; each must be valid: bad-argument).
 * @param {{ name?: string, icon?: string, color?: string }} meta
 */
export function withMeta(registry, id, meta) {
  if (!libraryOf(registry, id)) throw unknown(id);
  if (!isObject(meta) || Object.keys(meta).length === 0 || Object.keys(meta).some((k) => !['name', 'icon', 'color'].includes(k))) {
    throw new StreamsError('bad-argument', 'meta must be { name?, icon?, color? } with at least one of them');
  }
  if (meta.name !== undefined && !isLibraryName(meta.name)) throw new StreamsError('bad-argument', `a name is 1–${NAME_MAX} characters`);
  if (meta.icon !== undefined && !isLibraryIcon(meta.icon)) throw new StreamsError('bad-argument', `an icon is 1–${ICON_MAX} characters`);
  if (meta.color !== undefined && !isLibraryColor(meta.color)) throw new StreamsError('bad-argument', `a colour is one of ${LIBRARY_COLORS.join(' / ')}`);
  const libraries = registry.libraries.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l };
    if (meta.name !== undefined) next.name = meta.name.trim();
    if (meta.icon !== undefined) next.icon = meta.icon.trim();
    if (meta.color !== undefined) next.color = meta.color;
    return next;
  });
  return { ...registry, libraries };
}

/**
 * The first registry, from v1.0's settings.json: the library it had open first and active, then the recent ones in
 * their order. A folder that is not there is not registered (said through `log`).
 * @param {{ libraryPath?: string|null, recentLibraries?: string[] }} settings
 * @param {{ exists?: (path: string) => boolean, now?: () => Date, log?: (line: string) => void }} [o]
 */
export function migrateRegistry({ libraryPath = null, recentLibraries = [] } = {}, { exists = existsSync, now = () => new Date(), log = () => {} } = {}) {
  let registry = emptyRegistry();
  const candidates = [libraryPath, ...(Array.isArray(recentLibraries) ? recentLibraries : [])];
  for (const path of candidates) {
    if (typeof path !== 'string' || !isAbsolute(path)) continue;
    if (libraryAt(registry, path)) continue;
    if (!exists(path)) { log(`registry: from settings.json: ${path} is not there, not registered`); continue; }
    registry = withLibrary(registry, path, { now }).registry;
  }
  // the library v1.0 had open is the active one (when it is there; otherwise the first one registered)
  const open = typeof libraryPath === 'string' ? libraryAt(registry, libraryPath) : null;
  return { ...registry, active: open?.id ?? registry.libraries[0]?.id ?? null };
}
