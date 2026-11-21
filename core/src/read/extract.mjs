// The original's text (1.1 W2): what a person reads as the article, kept in paragraphs, with the page around it left out.
// extractOriginal(html) -> { text, paragraphs, way, title }
//   way: 'json-ld' | 'article' | 'paragraphs' — the first of these (the same order as extractArticle, fetch/html.mjs) that
//        gives ARTICLE_MIN characters — or 'none': only the whole page would give text (a menu, a page's configuration), and
//        that is not an original (pretest 5: itch.io and rttnews.com came back as the whole page).
//   Then the edges are cleaned (pretest 5: alibabacloud.com began with the press contact's phone and e-mail and ended with
//   customer-service lines; gamedeveloper.com and mpamag.com ended with related titles and a newsletter line):
//     - leading paragraphs that are contact details (an e-mail, a phone number, 「媒体联系」, "Media contact") are dropped
//     - from the last third: a paragraph that starts a block of related links, a newsletter, a sponsor line or customer
//       service, and everything after it, is dropped — unless a long paragraph (BODY_AFTER characters) follows it
//   Paragraphs are joined with a blank line, so the original reads as it was written and a sentence can be found again.
// Never throws.
import { decodeEntities, stripHtml } from '../fetch/html.mjs';

export const ARTICLE_MIN = 200;
export const PAGE_PARAGRAPH_MIN = 40;
export const BODY_AFTER = 300;
const LEAD_MAX = 5;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const CONTACT_WORDS = /^(media|press|investor)\s+(contact|relations|inquiries)|^contacts?\s*:|^for (more information|media inquiries)|媒体联系|新闻联系|联系人|联系电话|联系方式|媒体垂询/i;
const TAIL_START = /^(related( articles| posts| stories| reading| content)?|read (more|next)|more from|recommended( for you| reading)?|you (may|might) also like|also read|sign up (for|to)|subscribe( to| now)?|newsletter|get (our|the) newsletter|sponsored( by)?|this (post|article|newsletter) is sponsored|our sponsors?|customer (service|support)|contact (us|customer)|相关(文章|阅读|新闻|推荐)|推荐阅读|延伸阅读|猜你喜欢|订阅|赞助|客服|联系我们)/i;

const TAIL_SHORT = 300;
const TAIL_ANY = /newsletter|\bsubscribe\b|\bsubscription\b|sign(ing)? up (for|to)|sponsor(ed|s)?\b|email digest|customer (service|support)|sales (expert|representative|team)|contact (us|our)|follow us|订阅|赞助|客服|关注我们|联系我们/i;

function isContact(p) {
  const t = p.trim();
  if (CONTACT_WORDS.test(t)) return true;
  // a short paragraph that is mostly an e-mail or a phone number
  return Array.from(t).length <= 160 && (EMAIL.test(t) || PHONE.test(t));
}

export function cleanEdges(paragraphs) {
  const ps = paragraphs.map((p) => p.trim()).filter((p) => p !== '');
  let start = 0;
  while (start < Math.min(LEAD_MAX, ps.length - 1) && isContact(ps[start])) start++;
  let end = ps.length;
  const from = Math.max(start + 1, Math.floor(ps.length * 2 / 3));
  for (let i = from; i < ps.length; i++) {
    if (!TAIL_START.test(ps[i])) continue;
    if (ps.slice(i + 1).some((p) => Array.from(p).length >= BODY_AFTER)) continue;
    end = i;
    break;
  }
  // short paragraphs at the very end that only point elsewhere — a newsletter, a sponsor, customer service, a contact line —
  // whatever words they begin with (pretest 5: 「…by signing up for our free daily newsletter here.」, 「…customer service to
  // assist you…」, 「…get a curated email digest…」); taken from the end, one after the other, never from the middle
  while (end - 1 > start && Array.from(ps[end - 1]).length <= TAIL_SHORT && (TAIL_ANY.test(ps[end - 1]) || isContact(ps[end - 1]))) end--;
  return ps.slice(start, end);
}

const total = (ps) => ps.reduce((n, p) => n + Array.from(p).length, 0);

function blocks(html, { min = 1, tags = 'p|h2|h3|h4|li|blockquote|pre' } = {}) {
  const out = [];
  const re = new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)</\\1\\s*>`, 'gi');
  for (let m = re.exec(html); m; m = re.exec(html)) {
    // a block inside a block (a <p> in an <li>) is taken once, as the outer one
    const t = stripHtml(m[2]);
    if (Array.from(t).length >= min) out.push(t);
  }
  return out;
}

function jsonLdBodies(html) {
  const out = [];
  const visit = (v, depth) => {
    if (depth > 8 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    if (typeof v.articleBody === 'string') out.push(v.articleBody);
    for (const k of Object.keys(v)) if (k !== 'articleBody') visit(v[k], depth + 1);
  };
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try { visit(JSON.parse(m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()), 0); } catch { /* a broken block is skipped */ }
  }
  return out.map((b) => decodeEntities(String(b).replace(/<[^>]+>/g, ' ')).split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean));
}

export function titleOf(html) {
  const raw = String(html ?? '');
  const og = /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(raw)
    ?? /<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']og:title["']/i.exec(raw);
  if (og && og[1].trim()) return decodeEntities(og[1]).replace(/\s+/g, ' ').trim();
  const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(raw);
  if (t && stripHtml(t[1])) return stripHtml(t[1]);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(raw);
  return h1 ? stripHtml(h1[1]) : '';
}

export function extractOriginal(html) {
  const raw = String(html ?? '');
  const title = titleOf(raw);
  const done = (ps, way) => ({ text: ps.join('\n\n'), paragraphs: ps, way, title });
  try {
    const ld = jsonLdBodies(raw).sort((a, b) => total(b) - total(a))[0];
    if (ld && total(ld) >= ARTICLE_MIN) {
      const ps = cleanEdges(ld);
      if (total(ps) >= ARTICLE_MIN) return done(ps, 'json-ld');
    }
    const page = raw
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    let best = [];
    const are = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi;
    for (let m = are.exec(page); m; m = are.exec(page)) {
      let ps = blocks(m[1]);
      if (total(ps) < ARTICLE_MIN) ps = [stripHtml(m[1])].filter(Boolean);
      if (total(ps) > total(best)) best = ps;
    }
    if (total(best) >= ARTICLE_MIN) {
      const ps = cleanEdges(best);
      if (total(ps) >= ARTICLE_MIN) return done(ps, 'article');
    }
    const body = page.replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    const ps = cleanEdges(blocks(body, { min: PAGE_PARAGRAPH_MIN, tags: 'p' }));
    if (total(ps) >= ARTICLE_MIN) return done(ps, 'paragraphs');
  } catch {
    // nothing that reads as an article
  }
  return { text: '', paragraphs: [], way: 'none', title };
}
