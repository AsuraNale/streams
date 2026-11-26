// 1.1.1 P1 (acceptance B19; plan 场景二③④): the web addresses of a card handed in, checked by Streams' own readers — not
// only by what the model says it opened. Codex once wrote 「重新尝试打开，仍 404」 for addresses it never opened, and its
// card could never be confirmed (11-24, customer 3); and a source the model could read may be one Streams cannot.
//
// checkCardUrls(card, { reads, readPage, readLinks, known, onCheck, stopped }) -> { card, problems, known, stopped? }
//   reads      the model's opens of this build: [{ url, ok }] (ok: false — an open that came back as an error — is not a read)
//   readPage   read(url) of read/read-page.mjs (direct, rendered, a PDF's text); readLinks: read(url) of update/links.mjs.
//              Without readPage only the model's opens count (no reader at hand).
//   known      what Streams read before in this build, by address key ({ [urlKey]: record }); a changed card's own
//              addresses come in with their records (the card has them); each address is read once per build
// The card's addresses are of two kinds:
//   in 「读不到的来源」  no open is asked for; Streams' own result goes beside the reason (entry.checked)
//   all the others   (a source that can be read, a sample, an address written in the card's words) need an open that
//                    worked OR Streams having read it; one with neither is a problem { code: 'not-read', url, reason }
//                    (reason: Streams' own: 'dead' · 'blocked' · 'login' · 'check' · 'failed' · null when nothing read it)
// record (entry.checked on sources, samples and unreadable entries): { ok, original, reason }
//   ok        Streams reached the page (an article, a PDF, a page of links; a page with no article still counts as reached)
//   original  for a source: what Streams can keep of its pages — 'read' · 'pdf' · 'link' (only links; the source cannot be
//             read, or none of its pages could). 来源与要求's 「原文」 shows it until the first update has its own.
//   reason    when not ok, the reader's
import { cardUrls, urlKey, sameUrl } from './card.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isWeb = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

// a page read: reached (an article or not), and what of it Streams keeps
function pageRecord(r) {
  if (r?.ok) return { ok: true, original: r.method === 'pdf' ? 'pdf' : 'read', reason: null };
  if (r?.reason === 'no-article') return { ok: true, original: null, reason: null };
  return { ok: false, original: 'link', reason: r?.reason ?? 'failed' };
}

/** An address of the card that is a source (read for its links on each update). */
const isSourceUrl = (card, url) => (card.sources ?? []).some((s) => isObj(s) && isWeb(s.url) && sameUrl(s.url, url))
  || (card.unreadable ?? []).some((s) => isObj(s) && isWeb(s.url) && sameUrl(s.url, url));

// onCheck(done, total) (1.1.1 P10, A8): after each address Streams reads itself (those it read before in this build are not counted)
// stopped() (1.1.3, 停止处理): asked before each address; true, no more is read and the result says stopped: true (the page
// being read when it was asked is read to its end — the reader's own time limit)
export async function checkCardUrls(card, { reads = [], readPage = null, readLinks = null, known = {}, onCheck = null, stopped = null } = {}) {
  const out = { ...known };
  const opened = new Set(reads.filter((r) => r && r.ok !== false).map((r) => urlKey(r.url)).filter(Boolean));
  const unreadable = new Set((card.unreadable ?? []).filter((e) => isObj(e) && isWeb(e.url)).map((e) => urlKey(e.url)));
  const urls = cardUrls(card);

  async function readOne(url) {
    if (typeof readPage !== 'function') return null;
    if (isSourceUrl(card, url) && typeof readLinks === 'function') {
      const l = await readLinks(url).catch(() => null);
      // a page of links; one with no link at all (a PDF, a single page) is read as a page below
      if (l?.ok && Array.isArray(l.links) && l.links.length > 0) return { ok: true, original: null, reason: null, links: l.links };
      if (l && ['dead', 'login', 'check'].includes(l.reason)) return { ok: false, original: 'link', reason: l.reason };
    }
    return pageRecord(await readPage(url).catch(() => null));
  }

  // every address once: the samples first (a source's pages are judged by its samples when it has some)
  const order = [...urls].sort((a, b) => Number(isSourceUrl(card, a)) - Number(isSourceUrl(card, b)));
  const toRead = typeof readPage === 'function' ? order.filter((url) => { const k = urlKey(url); return k && !out[k]; }) : [];
  const told = (done) => { if (typeof onCheck === 'function' && toRead.length) { try { onCheck(done, toRead.length); } catch { /* never stops the check */ } } };
  told(0);
  let done = 0;
  for (const url of order) {
    const k = urlKey(url);
    if (!k || out[k]) continue;
    if (typeof stopped === 'function' && stopped()) return { card, problems: [], known: out, stopped: true };
    const rec = await readOne(url);
    if (rec) out[k] = rec;
    if (typeof readPage === 'function') told(++done);
  }
  // a source reached as a page of links: what Streams can keep of its pages — a sample on the same site read, or else one
  // of its own links on the same site read now
  for (const s of [...(card.sources ?? []), ...(card.unreadable ?? [])]) {
    if (!isObj(s) || !isWeb(s.url)) continue;
    const k = urlKey(s.url);
    const rec = out[k];
    if (!rec || !rec.ok || rec.original) continue;
    const host = hostOf(s.url);
    const sample = (card.samples ?? []).map((x) => (isObj(x) && isWeb(x.url) ? out[urlKey(x.url)] : null)).find((r, i) => r && r.ok && r.original && hostOf(card.samples[i].url) === host);
    if (sample) { out[k] = { ok: true, original: sample.original, reason: null }; continue; }
    const link = (rec.links ?? []).find((u) => hostOf(u) === host && urlKey(u) !== k);
    if (link && typeof stopped === 'function' && stopped()) return { card, problems: [], known: out, stopped: true };
    const page = link ? pageRecord(await readPage(link).catch(() => null)) : null;
    out[k] = { ok: true, original: page?.ok && page.original ? page.original : 'link', reason: null };
  }
  for (const k of Object.keys(out)) if (out[k]?.links) { const { links, ...rest } = out[k]; out[k] = rest; }

  const problems = [];
  for (const url of urls) {
    const k = urlKey(url);
    if (unreadable.has(k) || opened.has(k) || out[k]?.ok) continue;
    problems.push({ code: 'not-read', url, reason: out[k]?.reason ?? null });
  }
  const mark = (e) => {
    if (!isObj(e) || !isWeb(e.url)) return e;
    const rec = out[urlKey(e.url)];
    if (!rec) return e;
    const { checked, ...rest } = e;
    return { ...rest, checked: { ok: rec.ok, original: rec.original ?? (rec.ok ? 'read' : 'link'), reason: rec.reason ?? null } };
  };
  const marked = { ...card };
  for (const part of ['sources', 'samples', 'unreadable']) if (Array.isArray(card[part])) marked[part] = card[part].map(mark);
  return { card: marked, problems, known: out };
}

/** What a card already carries of Streams' reads (a card being changed): { [urlKey]: record }. */
export function knownOfCard(card) {
  const out = {};
  for (const part of ['sources', 'samples', 'unreadable']) {
    for (const e of Array.isArray(card?.[part]) ? card[part] : []) {
      if (isObj(e) && isWeb(e.url) && isObj(e.checked) && typeof e.checked.ok === 'boolean') out[urlKey(e.url)] = { ok: e.checked.ok, original: e.checked.original ?? null, reason: e.checked.reason ?? null };
    }
  }
  return out;
}
