// [[wiki links]] in note bodies.
//
// extractWikiLinks(body) -> raw targets in order of first appearance (deduped).
//   [[target]], [[target|display]], [[target#section]] all yield "target".
// resolveLinks(targets, { byId, byTitle }) -> { links, unresolved }
//   byId / byTitle: Map or plain object mapping id -> id, title -> id.
//   A target is matched first as an exact id, then as an exact title.
//   links: resolved ids, deduped, sorted. unresolved: raw targets, deduped, sorted.

const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g;

export function extractWikiLinks(body) {
  if (typeof body !== 'string') throw new TypeError('extractWikiLinks expects a string');
  const seen = new Set();
  const out = [];
  for (const m of body.matchAll(WIKILINK_RE)) {
    const target = m[1].split('|')[0].split('#')[0].trim();
    if (target === '' || seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

function lookup(map, key) {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(key);
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function resolveLinks(targets, { byId, byTitle } = {}) {
  if (!Array.isArray(targets)) throw new TypeError('resolveLinks expects an array of targets');
  const links = new Set();
  const unresolved = new Set();
  for (const t of targets) {
    const id = lookup(byId, t) ?? lookup(byTitle, t);
    if (id === undefined) unresolved.add(t);
    else links.add(id);
  }
  return { links: [...links].sort(), unresolved: [...unresolved].sort() };
}
