// parseFeed(xmlText) -> { ok: true, kind: 'rss' | 'atom', blocks, items: [{ title, url, date, summary }] }
//                    -> { ok: false, reason, message }     reason: 'empty-body' | 'not-xml' | 'not-a-feed'
//
// A deliberately minimal reader: regular expressions + entity decoding + CDATA. It is not an XML
// parser and does not try to be. It knows exactly what a feed item needs:
//   RSS 2.0 / RSS 1.0 <item>:  title, link (else guid: when isPermaLink is not "false", or when the
//                              guid text is itself an http(s) URL), description / content:encoded,
//                              pubDate / dc:date
//   Atom <entry>:              title, <link rel="alternate" href> (else the first link, else <id>),
//                              summary / content, published / updated
// `blocks` is how many <item> / <entry> openings were seen (a truncated, never-closed one counts), so a
// caller can tell "0 items because the feed is empty" from "N blocks, none usable".
// `date` is 'YYYY-MM-DD' or '' when the entry has none (callers fill in the fetch day).
// `summary` is tag-stripped, whitespace-collapsed, cut to 500 code points.
// Items without a title or without a link are dropped (nothing to show, nothing to dedup on).
//
// Also handled: a namespace prefix on the root (<atom:feed><atom:entry>…) is stripped from the whole
// document first; an embedded <source>…</source> inside an entry is removed before the entry is read
// (its title / link belong to the origin, not to the entry); attribute values may contain ">" when
// quoted. Known limits: an <item or <entry inside CDATA text is counted as a block; nested same-name
// elements other than <source> are not understood.
import { decodeEntities, stripHtml, truncateText } from '../../src/fetch/html.mjs';
import { toIsoDate } from '../../src/fetch/dates.mjs';

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
// The attribute part of a start tag, quote-aware: a ">" inside quotes does not end the tag.
const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;

function textOf(inner) {
  // CDATA keeps its bytes verbatim; everything else is entity-decoded.
  let out = '';
  let last = 0;
  CDATA_RE.lastIndex = 0;
  let m;
  while ((m = CDATA_RE.exec(inner)) !== null) {
    out += decodeEntities(inner.slice(last, m.index));
    out += m[1];
    last = m.index + m[0].length;
  }
  out += decodeEntities(inner.slice(last));
  return out;
}

function escapeName(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function elementRe(name, flags) {
  const n = escapeName(name);
  return new RegExp(`<${n}(\\s${ATTRS})?>([\\s\\S]*?)</${n}\\s*>`, flags);
}

// First <name ...>…</name> inside block, as text (CDATA-aware), or null.
export function elementText(block, name) {
  const m = elementRe(name, 'i').exec(block);
  return m ? textOf(m[2]) : null;
}

export function parseAttrs(s) {
  const out = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s)) !== null) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

function blocks(xml, name) {
  const re = elementRe(name, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[2]);
  return out;
}

function countOpenings(xml, name) {
  const re = new RegExp(`<${escapeName(name)}(?=[\\s>/])`, 'gi');
  let n = 0;
  while (re.exec(xml) !== null) n += 1;
  return n;
}

function stripProlog(text) {
  let t = String(text ?? '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.replace(/<\?[\s\S]*?\?>/g, '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<!DOCTYPE[^>]*>/gi, '');
  return t;
}

export function detectRoot(text) {
  const t = stripProlog(text).trimStart();
  if (t === '') return { kind: null, reason: 'empty-body', message: 'empty body' };
  if (t[0] !== '<') return { kind: null, reason: 'not-xml', message: `body does not start with a tag: ${t.slice(0, 40)}` };
  const m = /^<(?:([A-Za-z_][\w.-]*):)?([A-Za-z_][\w.-]*)/.exec(t);
  if (!m) return { kind: null, reason: 'not-xml', message: `no root element: ${t.slice(0, 40)}` };
  const prefix = m[1] ? `${m[1]}:` : '';
  const root = m[2].toLowerCase();
  if (root === 'rss' || root === 'rdf') return { kind: 'rss', root: m[2], prefix };
  if (root === 'feed') return { kind: 'atom', root: m[2], prefix };
  return { kind: null, reason: 'not-a-feed', message: `root is <${m[1] ? `${m[1]}:` : ''}${m[2]}>, expected <rss> or <feed>` };
}

function cleanTitle(s) {
  return stripHtml(s ?? '');
}

function cleanSummary(s) {
  return truncateText(stripHtml(s ?? ''));
}

// An entry's embedded <source> describes where it came from; its title / link / dates are not the entry's.
const SOURCE_RE = new RegExp(`<source(?:\\s${ATTRS})?>[\\s\\S]*?</source\\s*>`, 'gi');
function withoutSource(block) {
  return block.replace(SOURCE_RE, '');
}

const GUID_RE = new RegExp(`<guid(\\s${ATTRS})?>([\\s\\S]*?)</guid\\s*>`, 'i');

function rssItem(raw) {
  const block = withoutSource(raw);
  const title = cleanTitle(elementText(block, 'title'));
  let link = (elementText(block, 'link') ?? '').trim();
  if (link === '') {
    const g = GUID_RE.exec(block);
    if (g) {
      const attrs = parseAttrs(g[1] ?? '');
      const text = textOf(g[2]).trim();
      const isPermaLink = (attrs.ispermalink ?? 'true').toLowerCase() !== 'false';
      if (isPermaLink || /^https?:\/\//i.test(text)) link = text;
    }
  }
  const summary = cleanSummary(elementText(block, 'description') ?? elementText(block, 'content:encoded') ?? '');
  const date = toIsoDate(elementText(block, 'pubDate') ?? elementText(block, 'dc:date') ?? '');
  return { title, url: link, date, summary };
}

const LINK_RE = new RegExp(`<link(\\s${ATTRS})?/?>`, 'gi');

export function atomLink(raw) {
  const block = withoutSource(raw);
  const links = [];
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(block)) !== null) links.push(parseAttrs(m[1] ?? ''));
  const alternate = links.find((l) => l.href && (l.rel === undefined || l.rel === '' || l.rel === 'alternate'));
  const pick = alternate ?? links.find((l) => l.href);
  if (pick) return pick.href.trim();
  return (elementText(block, 'id') ?? '').trim();
}

function atomEntry(raw) {
  const block = withoutSource(raw);
  const title = cleanTitle(elementText(block, 'title'));
  const url = atomLink(block);
  const summary = cleanSummary(elementText(block, 'summary') ?? elementText(block, 'content') ?? '');
  const date = toIsoDate(elementText(block, 'published') ?? elementText(block, 'updated') ?? '');
  return { title, url, date, summary };
}

export function parseFeed(xmlText) {
  const root = detectRoot(xmlText);
  if (!root.kind) return { ok: false, reason: root.reason, message: root.message };
  let body = stripProlog(xmlText);
  if (root.prefix) body = body.replace(new RegExp(`<(/?)${escapeName(root.prefix)}`, 'g'), '<$1');
  const unit = root.kind === 'rss' ? 'item' : 'entry';
  const read = root.kind === 'rss' ? rssItem : atomEntry;
  const raw = blocks(body, unit).map(read);
  const items = raw.filter((it) => it.title !== '' && it.url !== '');
  return { ok: true, kind: root.kind, blocks: countOpenings(body, unit), items };
}
