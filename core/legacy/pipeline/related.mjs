// relatedEntries(index, item, { topic, max }) -> [{ id, title, date }]
// "库里已有的相关条目" for a prompt: index entries sharing the item's topic (the topic of its source in
// streams.json) or title words, best first, at most 5. Title words: Latin / digit runs lower-cased, and
// Han bigrams. Pure function over readIndex() output.
export const RELATED_MAX = 5;

export function titleTokens(title) {
  const s = String(title ?? '').normalize('NFKC').toLowerCase();
  const out = new Set();
  for (const m of s.matchAll(/[a-z0-9]+/g)) if (m[0].length > 1) out.add(m[0]);
  const han = s.match(/\p{Script=Han}+/gu) ?? [];
  for (const run of han) {
    const chars = Array.from(run);
    if (chars.length === 1) out.add(chars[0]);
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i] + chars[i + 1]);
  }
  return out;
}

export function relatedEntries(index, item, { topic, max = RELATED_MAX } = {}) {
  const words = titleTokens(item?.title);
  const scored = [];
  for (const e of Array.isArray(index) ? index : []) {
    if (!e || typeof e.title !== 'string') continue;
    if (e.source === item?.url) continue;
    let score = 0;
    if (topic && Array.isArray(e.topics) && e.topics.includes(topic)) score += 2;
    for (const w of titleTokens(e.title)) if (words.has(w)) score += 1;
    if (score > 0) scored.push({ score, entry: e });
  }
  scored.sort((a, b) => b.score - a.score || String(b.entry.date ?? '').localeCompare(String(a.entry.date ?? '')) || String(a.entry.id).localeCompare(String(b.entry.id)));
  return scored.slice(0, max).map(({ entry }) => ({ id: entry.id, title: entry.title, date: entry.date ?? '' }));
}
