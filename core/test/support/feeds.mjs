// Feed fixtures. RSS2 and ATOM are the toolkit's test_feed_parsing samples (plus one CDATA item);
// ARXIV_ATOM mirrors what export.arxiv.org really returns; HN_JSON mirrors Algolia.
export const RSS2 = `<?xml version="1.0"?><rss version="2.0"><channel><title>c</title>
  <item><title>Hello  World</title><link>https://x.com/1</link>
    <description>&lt;p&gt;Some &lt;b&gt;html&lt;/b&gt; text&lt;/p&gt;</description>
    <pubDate>Thu, 02 Jul 2026 08:00:00 GMT</pubDate></item>
  <item><title><![CDATA[Second & <em>last</em>]]></title><guid isPermaLink="true">https://x.com/2</guid>
    <description><![CDATA[<p>CDATA body &amp; stuff</p>]]></description></item>
</channel></rss>`;

export const EMPTY_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>c</title></channel></rss>`;

export const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>f</title>
  <entry><title>Atom Entry</title><link rel="alternate" href="https://x.com/2"/>
    <summary>sum</summary><published>2026-07-01T10:00:00Z</published></entry></feed>`;

export const ARXIV_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="http://arxiv.org/api/query?search_query%3Dall%3A%22agent%20memory%22" rel="self" type="application/atom+xml"/>
  <title type="html">ArXiv Query: search_query=all:"agent memory"</title>
  <id>http://arxiv.org/api/abc</id>
  <updated>2026-11-01T00:00:00-04:00</updated>
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">2</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2611.00001v1</id>
    <updated>2026-10-31T17:59:59Z</updated>
    <published>2026-10-31T17:59:59Z</published>
    <title>Memory Blocks for
  Long-Horizon Agents</title>
    <summary>  We propose memory blocks &amp; a benchmark.
  Second line of the abstract.</summary>
    <author><name>A. Author</name></author>
    <link href="http://arxiv.org/abs/2611.00001v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2611.00001v1" rel="related" type="application/pdf"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2611.00002v1</id>
    <updated>2026-10-30T09:00:00Z</updated>
    <published>2026-10-30T09:00:00Z</published>
    <title>Second Paper</title>
    <summary>Short.</summary>
    <author><name>B. Author</name></author>
    <link title="pdf" href="http://arxiv.org/pdf/2611.00002v1" rel="related" type="application/pdf"/>
    <link href="http://arxiv.org/abs/2611.00002v1" rel="alternate" type="text/html"/>
  </entry>
</feed>`;

export const HN_JSON = JSON.stringify({
  hits: [
    { title: 'high', url: 'https://h/1', points: 120, objectID: '1', created_at: '2026-07-13T00:00:00Z' },
    { title: 'low', url: 'https://h/2', points: 10, objectID: '2', created_at: '2026-07-13T00:00:00Z' },
    { title: 'exact fifty', url: null, points: 50, objectID: '3', created_at: '2026-07-12T23:00:00Z' },
    { title: '', url: 'https://h/4', points: 500, objectID: '4', created_at: '2026-07-13T00:00:00Z' },
  ],
  nbHits: 4,
});

// Two items, two urls, same title modulo case / spacing: second-layer dedup material.
export function rssWith(items) {
  const body = items.map((it) => `<item><title>${it.title}</title><link>${it.url}</link>${it.date ? `<pubDate>${it.date}</pubDate>` : ''}<description>${it.summary ?? 's'}</description></item>`).join('\n');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>c</title>\n${body}\n</channel></rss>`;
}
