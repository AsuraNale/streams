// The library card (1.1 W4, acceptance A2; contract 「存法」): eight parts in this order, the definition a paragraph and
// seven lines, at most 3 things for the user to decide. The card is structured (card.json); the one people read
// (card.md) is made from it. Only a card that passes checkCard can be confirmed.
//
// checkCard(card, { reads }) -> { ok, problems: [{ code, part?, line?, index?, url? }] }
//   missing-part    one of the eight parts is not there or is empty (unreadable may be an empty list: every source
//                   could be read; it may not be left out)
//   missing-line    a line of the definition (summary, or one of the seven) is not there or is empty
//   too-many-decisions · no-name · not-an-object · bad-entry (a source / sample without a web address, an entry without
//   its words)
//   not-read        a web address on the card that this build never read (reads given: [{ url }] from every turn)
//   reads: null skips the last check (a proposal shown again later: its addresses were checked when it was made)
// cardUrls(card) -> every http(s) address on the card, the entries' own and those written in its words
// sameUrl(a, b) / urlKey(u): host case, a leading www., the scheme, a trailing slash and #… do not count
// renderCard(card, language) -> the Markdown people read
export const CARD_PARTS = Object.freeze(['definition', 'collect', 'skip', 'sources', 'unreadable', 'pick', 'write', 'samples']);
export const DEFINITION_LINES = Object.freeze(['purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard']);
export const MAX_DECISIONS = 3;

export const CARD_WORDS = Object.freeze({
  'zh-CN': {
    definition: '库的定义', collect: '收什么', skip: '不收什么', sources: '读得到的来源和当天的状态', unreadable: '读不到的来源和原因',
    pick: '每次怎么挑', write: '每条怎么写', samples: '样例', decide: '要你定的事',
    purpose: '用途', scope: '边界', exclude: '不要什么', trust: '多可信才算数', rhythm: '节奏', language: '语言', hard: '硬条件',
    none: '（没有）', default: '默认', status: '状态', reason: '原因', sep: '：',
  },
  en: {
    definition: 'What this library is', collect: 'What goes in', skip: 'What stays out', sources: 'Sources that can be read, and how they were that day',
    unreadable: 'Sources that cannot be read, and why', pick: 'How each update picks', write: 'How each item is written', samples: 'Examples',
    decide: 'For you to decide', purpose: 'Purpose', scope: 'Scope', exclude: 'Not wanted', trust: 'How trustworthy', rhythm: 'Rhythm',
    language: 'Language', hard: 'Hard conditions', none: '(none)', default: 'default', status: 'status', reason: 'why', sep: ': ',
  },
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const isWeb = (u) => typeof u === 'string' && /^https?:\/\/[^\s/]+/i.test(u.trim());
// a part written as words: a string, or a list of strings (at least one)
const wordsOk = (v) => filled(v) || (Array.isArray(v) && v.length > 0 && v.every(filled));

export function urlKey(u) {
  let x;
  try { x = new URL(String(u).trim()); } catch { return null; }
  if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
  const host = x.hostname.toLowerCase().replace(/^www\./, '');
  const path = x.pathname.replace(/\/+$/, '');
  return `${host}${path}${x.search}`;
}

export function sameUrl(a, b) {
  const ka = urlKey(a);
  return ka !== null && ka === urlKey(b);
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`（）()「」【】，。；：、｜|]+/g;
const trimUrl = (u) => u.replace(/[.,:;!?*\]]+$/, '');

function stringsOf(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringsOf(x, out));
  else if (isObj(v)) Object.values(v).forEach((x) => stringsOf(x, out));
  return out;
}

export function cardUrls(card) {
  const seen = new Map();
  for (const s of stringsOf(card)) {
    const found = isWeb(s) && !/\s/.test(s.trim()) ? [s.trim()] : (s.match(URL_IN_TEXT) ?? []).map(trimUrl);
    for (const u of found) { const k = urlKey(u); if (k && !seen.has(k)) seen.set(k, u); }
  }
  return [...seen.values()];
}

function checkEntries(card, part, need, problems) {
  const list = card[part];
  list.forEach((e, index) => {
    if (!isObj(e) || !need.every((k) => (k === 'url' ? isWeb(e.url) : filled(e[k])))) problems.push({ code: 'bad-entry', part, index });
  });
}

export function checkCard(card, { reads } = {}) {
  if (!isObj(card)) return { ok: false, problems: [{ code: 'not-an-object' }] };
  const problems = [];
  if (!filled(card.name)) problems.push({ code: 'no-name' });
  for (const part of CARD_PARTS) {
    const v = card[part];
    let ok;
    if (part === 'definition') ok = isObj(v);
    else if (part === 'unreadable') ok = Array.isArray(v);
    else if (part === 'sources' || part === 'samples') ok = Array.isArray(v) && v.length > 0;
    else ok = wordsOk(v);
    if (!ok) problems.push({ code: 'missing-part', part });
  }
  if (isObj(card.definition)) {
    for (const line of ['summary', ...DEFINITION_LINES]) if (!filled(card.definition[line])) problems.push({ code: 'missing-line', line });
  }
  if (card.decide !== undefined && !Array.isArray(card.decide)) problems.push({ code: 'bad-entry', part: 'decide' });
  if (Array.isArray(card.decide)) {
    if (card.decide.length > MAX_DECISIONS) problems.push({ code: 'too-many-decisions' });
    card.decide.forEach((d, index) => { if (!isObj(d) || !filled(d.what)) problems.push({ code: 'bad-entry', part: 'decide', index }); });
  }
  if (Array.isArray(card.sources)) checkEntries(card, 'sources', ['name', 'url', 'status'], problems);
  if (Array.isArray(card.samples)) checkEntries(card, 'samples', ['title', 'url'], problems);
  if (Array.isArray(card.unreadable)) {
    card.unreadable.forEach((e, index) => {
      if (!isObj(e) || !filled(e.name) || !filled(e.reason) || (e.url !== undefined && e.url !== '' && !isWeb(e.url))) problems.push({ code: 'bad-entry', part: 'unreadable', index });
    });
  }
  if (Array.isArray(reads)) {
    const read = new Set(reads.map((r) => urlKey(r?.url)).filter(Boolean));
    for (const url of cardUrls(card)) if (!read.has(urlKey(url))) problems.push({ code: 'not-read', url });
  }
  return { ok: problems.length === 0, problems };
}

const list = (v) => (Array.isArray(v) ? v : filled(v) ? [v] : []);

export function renderCard(card, language = 'zh-CN') {
  const w = CARD_WORDS[language] ?? CARD_WORDS['zh-CN'];
  const out = [`# ${card.name ?? ''}`, ''];
  const d = card.definition ?? {};
  out.push(`## ${w.definition}`, '', d.summary ?? '', '');
  for (const line of DEFINITION_LINES) out.push(`- **${w[line]}**${w.sep}${d[line] ?? ''}`);
  out.push('');
  if (Array.isArray(card.decide) && card.decide.length) {
    out.push(`### ${w.decide}`, '');
    card.decide.forEach((x, i) => out.push(`${i + 1}. ${x.what}${filled(x.default) ? `（${w.default}${w.sep}${x.default}）` : ''}`));
    out.push('');
  }
  const bullets = (part) => {
    out.push(`## ${w[part]}`, '');
    const items = list(card[part]);
    if (items.length === 0) out.push(w.none);
    for (const x of items) out.push(`- ${x}`);
    out.push('');
  };
  bullets('collect');
  bullets('skip');
  out.push(`## ${w.sources}`, '');
  for (const s of card.sources ?? []) out.push(`- [${s.name}](${s.url})${w.sep}${s.status}${filled(s.note) ? ` · ${s.note}` : ''}`);
  out.push('', `## ${w.unreadable}`, '');
  if (!(card.unreadable ?? []).length) out.push(w.none);
  for (const s of card.unreadable ?? []) out.push(`- ${filled(s.url) ? `[${s.name}](${s.url})` : s.name}${w.sep}${s.reason}`);
  out.push('');
  bullets('pick');
  bullets('write');
  out.push(`## ${w.samples}`, '');
  for (const s of card.samples ?? []) out.push(`- [${s.title}](${s.url})${filled(s.date) ? ` · ${s.date}` : ''}${filled(s.why) ? `${w.sep}${s.why}` : ''}`);
  out.push('');
  return out.join('\n');
}
