// 1.1 W2 (读网页和原文): the three ways of reading a page, where it stops, the original kept in the library folder, how long
// it is kept, a source's six states, and the cleaner original text. Acceptance B5, B6, B7, B8.
// The pages come from a server on 127.0.0.1 written here; the render way is a stand-in that returns what a browser would
// have made of the page (the real hidden window is desktop/test/render.test.mjs). Each test was written against inputs that
// should fail it first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createPageReader, extractOriginal, cleanEdges, humanCheck, signInPage, errorPage,
  saveOriginal, readOriginal, originalFor, originalId, originalPath, pruneOriginals, ORIGINALS_DIR, ORIGINAL_MISSING,
  RETAIN_DISMISSED_DAYS, sourceStateOf, createLibrary, scanLibrary, appendEvent, hintOf,
} from '../src/index.mjs';
import { STATE_WORDS, ADVICE_WORDS } from '../src/agent/words.mjs';
import { caseDir } from './support/tmp.mjs';

const para = (n, word = 'The council approved the new budget after a long debate about schools and roads') => Array.from({ length: n }, (_, i) => `<p>${word}, part ${i + 1}, with enough words to be a real paragraph of the story.</p>`).join('\n');
const ARTICLE = `<html><head><title>Budget passes</title></head><body><nav><a href="/">Home</a> <a href="/news">News</a></nav><article><h1>Budget passes</h1>${para(4)}</article><footer>© Town</footer></body></html>`;
const SHELL = '<html><head><title>Loading</title><script>document.body.innerHTML = "<article>..</article>"</script></head><body><div id="app"></div></body></html>';
const RENDERED = `<html><head><title>Release notes</title></head><body><article>${para(3, 'Version 4 adds offline mode and a faster search')}</article></body></html>`;
const LOGIN = '<html><head><title>Sign in</title></head><body><form action="/session"><input name="user"><input type="password" name="pw"><button>Sign in</button></form></body></html>';
const CAPTCHA = '<html><head><title>Just a moment...</title></head><body><div class="cf-challenge">Checking your browser before accessing the site.</div></body></html>';
const PDF = Buffer.from('%PDF-1.4\n% a stand-in PDF: its text comes from the pdfText given to the reader\n');
const PDF_TEXT = 'Annual report 2026.\n\nRevenue rose by 12 percent to 4.1 million dollars, driven by new subscriptions and lower costs across all three regions of the company.\n\nThe board proposes a dividend of 0.30 dollars per share.';

let server;
let base;
const hits = [];
const ROUTES = {
  '/article': [200, 'text/html; charset=utf-8', ARTICLE],
  '/script': [200, 'text/html', SHELL],
  '/refused': [403, 'text/html', '<html><body>Forbidden</body></html>'],
  '/refused-always': [403, 'text/html', '<html><body>Forbidden</body></html>'],
  '/report.pdf': [200, 'application/pdf', PDF],
  '/report-octet': [200, 'application/octet-stream', PDF],
  '/scan.pdf': [200, 'application/pdf', PDF],
  '/dead': [404, 'text/html', '<html><body>Not here</body></html>'],
  '/gone': [410, 'text/html', ''],
  '/busy': [503, 'text/html', ''],
  '/slow': [429, 'text/html', ''],
  '/nothing': [200, 'text/html', ''],
  '/captcha': [200, 'text/html', CAPTCHA],
  '/challenge': [403, 'text/html', CAPTCHA],
  '/login': [200, 'text/html', LOGIN],
  '/members': [200, 'text/html', LOGIN],
  '/private': [401, 'text/html', ''],
  '/weibo-404': [200, 'text/html', SHELL],
};
// what the browser makes of each page (the render stand-in)
const RENDER = {
  '/script': { status: 200, title: 'Release notes', html: RENDERED },
  '/refused': { status: 200, title: 'Release notes', html: RENDERED },
  '/refused-always': { status: 403, title: '', html: '<html><body>Forbidden</body></html>' },
  '/nothing': { status: 200, title: '', html: '<html><body></body></html>' },
  '/weibo-404': { status: 200, title: '404 页面不存在', html: '<html><head><title>404 页面不存在</title></head><body><p>抱歉，你访问的页面不存在。</p></body></html>' },
  '/script-login': { status: 200, title: 'Sign in', html: LOGIN },
};

before(async () => {
  server = createServer((req, res) => {
    hits.push({ path: req.url, ua: req.headers['user-agent'], at: Date.now() });
    const r = ROUTES[req.url];
    if (!r) { res.writeHead(404); res.end(); return; }
    res.writeHead(r[0], { 'content-type': r[1] });
    res.end(r[2]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function reader({ render = 'stand-in', pdf = true, ...o } = {}) {
  const renders = [];
  const r = createPageReader({
    minGapMs: 0,
    render: render === 'stand-in' ? async (url, opts) => {
      renders.push({ url, ua: opts.userAgent });
      const page = RENDER[new URL(url).pathname];
      if (!page) throw new Error('the page could not be opened');
      return { ...page, finalUrl: url };
    } : render,
    pdfText: pdf ? async (bytes) => {
      if (Buffer.from(bytes).subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
      return Buffer.from(bytes).includes('stand-in') && !pdf.scanned ? PDF_TEXT : '';
    } : null,
    ...o,
  });
  return { r, renders };
}

// ---- tiers (B5) -------------------------------------------------------------------------------------------------------

test('tiers · a page that reads as an article is read directly, nothing rendered', async () => {
  const { r, renders } = reader();
  const out = await r.read(`${base}/article`);
  assert.equal(out.ok, true);
  assert.equal(out.method, 'direct');
  assert.equal(out.title, 'Budget passes');
  assert.match(out.text, /council approved the new budget/);
  assert.ok(!out.text.includes('Home'), 'the menu is not the original');
  assert.deepEqual(out.tried, ['direct']);
  assert.equal(renders.length, 0);
});

test('tiers · a page whose text a script writes: direct gives nothing, the rendered page is read', async () => {
  const { r, renders } = reader();
  const out = await r.read(`${base}/script`);
  assert.equal(out.ok, true);
  assert.equal(out.method, 'render');
  assert.match(out.text, /offline mode/);
  assert.deepEqual(out.tried, ['direct', 'render']);
  assert.equal(renders.length, 1);
});

test('tiers · a page that refuses the direct GET (403) but opens in a browser is read rendered', async () => {
  const { r } = reader();
  const out = await r.read(`${base}/refused`);
  assert.equal(out.ok, true);
  assert.equal(out.method, 'render');
  assert.equal(out.http, 403);
});

test('tiers · a PDF gives its text (by type, or by its first bytes when the type says nothing)', async () => {
  const { r, renders } = reader();
  for (const path of ['/report.pdf', '/report-octet']) {
    const out = await r.read(`${base}${path}`);
    assert.equal(out.ok, true, path);
    assert.equal(out.method, 'pdf');
    assert.deepEqual(out.tried, ['direct', 'pdf']);
    assert.match(out.text, /Revenue rose by 12 percent/);
    assert.equal(out.paragraphs.length, 3);
  }
  assert.equal(renders.length, 0, 'a PDF is not rendered');
  const scanned = reader({ pdf: { scanned: true } }).r;
  const s = await scanned.read(`${base}/scan.pdf`);
  assert.equal(s.ok, false);
  assert.equal(s.reason, 'no-article');
});

test('tiers · only when every way fails is the page unreadable', async () => {
  const { r } = reader();
  const nothing = await r.read(`${base}/nothing`);
  assert.equal(nothing.ok, false);
  assert.equal(nothing.reason, 'no-article');
  assert.deepEqual(nothing.tried, ['direct', 'render']);
  const always = await r.read(`${base}/refused-always`);
  assert.equal(always.ok, false);
  assert.equal(always.reason, 'blocked');
  assert.deepEqual(always.tried, ['direct', 'render']);
  // with no render service at all, the script page is unreadable after the direct way
  const bare = createPageReader({ minGapMs: 0 });
  const shell = await bare.read(`${base}/script`);
  assert.equal(shell.ok, false);
  assert.deepEqual(shell.tried, ['direct']);
  // a render that throws
  const broken = reader({ render: async () => { throw new Error('crashed'); } }).r;
  const b = await broken.read(`${base}/script`);
  assert.equal(b.ok, false);
  assert.match(b.message, /rendering failed: crashed/);
});

// ---- where it stops (guards) ------------------------------------------------------------------------------------------

test('guards · a human check stops at once, marked, never rendered — sent with 200 or with 403', async () => {
  const { r, renders } = reader();
  for (const path of ['/captcha', '/challenge']) {
    const out = await r.read(`${base}${path}`);
    assert.equal(out.ok, false, path);
    assert.equal(out.reason, 'check');
    assert.deepEqual(out.tried, ['direct']);
  }
  assert.equal(renders.length, 0);
  assert.equal(humanCheck(CAPTCHA), true);
  assert.equal(humanCheck(ARTICLE), false);
});

test('guards · a sign-in page stops at once, marked 「要登录」; a 401 too; a rendered sign-in page too', async () => {
  const { r, renders } = reader();
  for (const path of ['/login', '/members', '/private']) {
    const out = await r.read(`${base}${path}`);
    assert.equal(out.ok, false, path);
    assert.equal(out.reason, 'login', path);
    assert.deepEqual(out.tried, ['direct'], path);
  }
  assert.equal(renders.length, 0);
  const viaRender = reader({ render: async () => RENDER['/script-login'] }).r;
  const v = await viaRender.read(`${base}/script`);
  assert.equal(v.reason, 'login');
  assert.equal(signInPage(LOGIN, `${base}/members`), true);
  assert.equal(signInPage(ARTICLE, `${base}/article`), false);
  // an article that mentions signing in is still an article
  assert.equal(signInPage(`<html><body><article>${para(30, 'How to sign in to the new portal and log in safely')}</article></body></html>`, `${base}/a`), false);
});

test('guards · both ways read as Streams (its own User-Agent), and one site is read at most once every minGapMs', async () => {
  const before = hits.length;
  const waits = [];
  let clock = 1_000;
  const renders = [];
  const r = createPageReader({
    minGapMs: 2000, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; },
    render: async (url, opts) => { renders.push(opts.userAgent); return { ...RENDER['/script'], finalUrl: url }; },
  });
  await r.read(`${base}/article`);
  clock += 500;
  await r.read(`${base}/script`);
  const mine = hits.slice(before);
  assert.ok(mine.length >= 2);
  for (const h of mine) assert.match(h.ua, /^Streams\//);
  assert.match(renders[0], /^Streams\//);
  // the second page waited 1.5 s for the first; the render of it waited the full 2 s after its direct GET
  assert.deepEqual(waits, [1500, 2000]);
  // another site is not held back
  const other = createPageReader({ minGapMs: 2000, now: () => clock, sleep: async (ms) => { waits.push(ms); } });
  await other.read(`${base.replace('127.0.0.1', 'localhost')}/article`).catch(() => {});
  assert.deepEqual(waits, [1500, 2000]);
});

// ---- dead addresses ---------------------------------------------------------------------------------------------------

test('dead · 404 and 410 are a dead address (「地址失效」), not unreadable, and not rendered', async () => {
  const { r, renders } = reader();
  for (const path of ['/dead', '/gone']) {
    const out = await r.read(`${base}${path}`);
    assert.equal(out.reason, 'dead', path);
    assert.deepEqual(out.tried, ['direct']);
  }
  assert.equal(renders.length, 0);
  assert.equal((await r.read('not a url')).reason, 'dead');
});

test('dead · an error page once rendered is a dead address, not something read', async () => {
  const { r } = reader();
  const out = await r.read(`${base}/weibo-404`);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'dead');
  assert.equal(errorPage({ title: 'Page not found', text: 'Sorry.' }), true);
  assert.equal(errorPage({ title: 'Search for the missing hikers: bodies not found', text: 'x'.repeat(3000) }), false, 'a long article is not an error page');
});

test('failed · a server saying "later" (503, 429) is tried another time, not rendered now', async () => {
  const { r, renders } = reader();
  for (const path of ['/busy', '/slow']) {
    const out = await r.read(`${base}${path}`);
    assert.equal(out.reason, 'failed', path);
  }
  assert.equal(renders.length, 0);
  const down = await r.read('http://127.0.0.1:1/x');
  assert.equal(down.reason, 'failed');
});

// ---- the six source states (B8) --------------------------------------------------------------------------------------

test('states · six states, each from its own answer of the server; 403 tries the other way before it is reported', async () => {
  const { r } = reader();
  const cases = [
    ['/article', 1, 'ok'],
    ['/nothing', 0, 'empty'],
    ['/dead', 0, 'gap'],
    ['/busy', 0, 'failed'],
    ['/slow', 0, 'failed'],
    ['/refused-always', 0, 'blocked'],
    ['/login', 0, 'login'],
  ];
  for (const [path, newLinks, state] of cases) {
    const read = await r.read(`${base}${path}`);
    const s = sourceStateOf(read, { newLinks });
    assert.equal(s.state, state, path);
    assert.equal(s.hint, hintOf(state));
    if (path === '/refused-always') assert.deepEqual(read.tried, ['direct', 'render'], 'refused: the other way first');
  }
  // the refused page a browser opens is not reported refused at all
  assert.equal(sourceStateOf(await r.read(`${base}/refused`), { newLinks: 1 }).state, 'ok');
  // a human check is a refusal to the user (not 「要登录」)
  assert.equal(sourceStateOf(await r.read(`${base}/captcha`)).state, 'blocked');
});

test('states · 「要登录」 has its words and what to do, in Chinese and English, and says this version cannot read it', () => {
  assert.equal(STATE_WORDS.zh.login, '要登录');
  assert.equal(STATE_WORDS.en.login, 'Sign-in required');
  assert.equal(hintOf('login'), 'login-not-supported');
  assert.match(ADVICE_WORDS.zh['login-not-supported'], /这一版还读不了要登录的网站/);
  assert.match(ADVICE_WORDS.en['login-not-supported'], /cannot read such sites/);
  assert.notEqual(hintOf('login'), hintOf('blocked'));
});

// ---- the original kept (B6) -------------------------------------------------------------------------------------------

test('original · one file per item in _originals, with its header, and the text read back as it was', async () => {
  const lib = caseDir('w2-original');
  createLibrary(lib, { name: 'demo' });
  const { r } = reader();
  const read = await r.read(`${base}/article`);
  const at = new Date('2026-11-20T15:00:00Z');
  const saved = saveOriginal(lib, { url: read.finalUrl, title: read.title, text: read.text, method: read.method, fetchedAt: at });
  assert.equal(saved.id, originalId(read.finalUrl));
  assert.equal(saved.path, join(lib, ORIGINALS_DIR, `${saved.id}.md`));
  const raw = readFileSync(saved.path, 'utf8');
  assert.match(raw, /^---\nurl: "http:\/\/127\.0\.0\.1:\d+\/article"\ntitle: "Budget passes"\nfetched_at: "2026-11-20T15:00:00\.000Z"\nmethod: "direct"\nsha256: "[0-9a-f]{64}"\n---\n/);
  const back = readOriginal(lib, saved.id);
  assert.equal(back.text, read.text);
  assert.equal(back.sha256, createHash('sha256').update(read.text, 'utf8').digest('hex'));
  assert.equal(back.method, 'direct');
  // not in notes/, and nothing written there
  assert.ok(!saved.path.includes(`${join('notes', '')}`));
  assert.deepEqual(existsSync(join(lib, 'notes')) ? readdirSync(join(lib, 'notes')) : [], []);
  // a title with quotes and a line break survives
  const odd = saveOriginal(lib, { url: 'https://x/odd', title: 'A "quoted"\nline', text: 'Body.', method: 'render', fetchedAt: at });
  assert.equal(readOriginal(lib, odd.id).title, 'A "quoted"\nline');
});

test('original · a page that could not be read has no original file, only the mark 「原文没存下来」', async () => {
  const lib = caseDir('w2-original-missing');
  createLibrary(lib, { name: 'demo' });
  const { r } = reader();
  const read = await r.read(`${base}/nothing`);
  const o = originalFor(read);
  assert.deepEqual(o, { saved: false, missing: ORIGINAL_MISSING, reason: 'no-article' });
  assert.throws(() => saveOriginal(lib, { url: read.url, text: read.text, method: 'direct', fetchedAt: new Date() }), /needs text/);
  assert.equal(existsSync(join(lib, ORIGINALS_DIR)), false);
  assert.equal(originalFor(await r.read(`${base}/article`)).saved, true);
  assert.throws(() => saveOriginal(lib, { url: 'https://x', text: 'x', method: 'guess', fetchedAt: new Date() }), /method/);
  assert.equal(readOriginal(lib, '../streams'), null);
});

test('original · an imported library (notes in the library folder) does not take _originals for notes or a folder of its own', () => {
  const lib = caseDir('w2-imported');
  createLibrary(lib, { name: 'demo' });
  const cfgPath = join(lib, 'streams.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, notesDir: '.' }, null, 2));
  saveOriginal(lib, { url: 'https://x/1', title: 't', text: 'Body of the page.', method: 'direct', fetchedAt: new Date() });
  const s = scanLibrary(lib);
  assert.deepEqual(s.skippedDirs.filter((d) => d.startsWith('_')), []);
  assert.equal(s.valid.length + s.pending.length, 0, 'no original is a note or a note to fix');
});

// ---- how long originals are kept (B7) ---------------------------------------------------------------------------------

test('retention · kept items keep their original, dismissed ones lose it after 7 days, 待看 keeps it', () => {
  const lib = caseDir('w2-retention');
  createLibrary(lib, { name: 'demo' });
  const day0 = Date.parse('2026-11-01T10:00:00Z');
  const at = (d) => new Date(day0 + d * 86_400_000).toISOString();
  const urls = { kept: 'https://x/kept', dismissed: 'https://x/dismissed', inbox: 'https://x/inbox', unknown: 'https://x/unknown' };
  for (const [k, url] of Object.entries(urls)) {
    if (k !== 'unknown') appendEvent(lib, { ev: 'seen', url, source: 's', title: k, ts: at(0) });
    saveOriginal(lib, { url, title: k, text: `The ${k} one.`, method: 'direct', fetchedAt: at(0) });
  }
  appendEvent(lib, { ev: 'inbox', url: urls.kept, ts: at(0) });
  appendEvent(lib, { ev: 'kept', url: urls.kept, id: 'kept-note', ts: at(0) });
  appendEvent(lib, { ev: 'inbox', url: urls.dismissed, ts: at(0) });
  appendEvent(lib, { ev: 'dismissed', url: urls.dismissed, ts: at(1) });
  appendEvent(lib, { ev: 'inbox', url: urls.inbox, ts: at(0) });
  const has = (k) => existsSync(originalPath(lib, originalId(urls[k])));

  assert.equal(RETAIN_DISMISSED_DAYS, 7);
  let r = pruneOriginals(lib, { now: () => new Date(at(7.9)) });
  assert.deepEqual(r.removed, [], 'dismissed on day 1: 6.9 days later it is still there');
  r = pruneOriginals(lib, { now: () => new Date(at(8)) });
  assert.deepEqual(r.removed, [originalId(urls.dismissed)]);
  assert.equal(has('dismissed'), false);
  assert.equal(has('kept'), true);
  assert.equal(has('inbox'), true);
  assert.equal(has('unknown'), true, 'an address the ledger does not know is kept');
  r = pruneOriginals(lib, { now: () => new Date(at(400)) });
  assert.deepEqual(r.removed, [], 'a year on, kept and 待看 are still there');
  assert.equal(has('kept') && has('inbox'), true);
});

// ---- the original's text --------------------------------------------------------------------------------------------

test('extract · contact details at the top and related / newsletter / sponsor lines at the end are left out', () => {
  const body = para(5, 'Alibaba Cloud announced a new model family for enterprise customers in Asia and Europe');
  const html = `<html><body><article>
    <p>Media Contact: Jane Doe</p><p>Phone: +1 (555) 010-2030</p><p>press@example.com</p>
    ${body}
    <p>Related articles</p><p>Cloud prices fall again</p><p>Five tips for new users</p>
    <p>Subscribe to our newsletter for weekly updates.</p>
  </article></body></html>`;
  const o = extractOriginal(html);
  assert.equal(o.way, 'article');
  assert.match(o.paragraphs[0], /^Alibaba Cloud announced/);
  assert.match(o.paragraphs.at(-1), /part 5/);
  assert.ok(!/press@example\.com|Media Contact|Related articles|Subscribe/.test(o.text));
  assert.equal(o.paragraphs.length, 5);
  assert.match(o.text, /part 1, with enough words to be a real paragraph of the story\.\n\nAlibaba|story\.\n\n/);
});

test('extract · a "related" line in the middle of a long article is not where the article ends', () => {
  const long = 'x '.repeat(200);
  const ps = ['Intro paragraph of the story.', 'Second.', 'Third.', 'Fourth.', 'Related reading: an older piece on this.', `A long paragraph that goes on ${long}`];
  assert.deepEqual(cleanEdges(ps), ps.map((p) => p.trim()));
  // the lead is cleaned only while it is contact details
  assert.deepEqual(cleanEdges(['Contact: info@x.org', 'Body one.', 'Body two.']), ['Body one.', 'Body two.']);
  assert.deepEqual(cleanEdges(['Body one mentions 2026.', 'Body two.']), ['Body one mentions 2026.', 'Body two.']);
});

test('extract · a page that only gives its whole text (a menu, configuration data) is not an original', () => {
  const page = `<html><body><nav>${'<a href="/x">Menu item</a> '.repeat(80)}</nav><div>{"config":{"theme":"dark","items":[1,2,3]}}</div></body></html>`;
  const o = extractOriginal(page);
  assert.equal(o.way, 'none');
  assert.equal(o.text, '');
  // JSON-LD articleBody keeps its paragraphs
  const ld = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', articleBody: `First paragraph ${'word '.repeat(30)}\n\nSecond paragraph ${'word '.repeat(30)}` })}</script></head><body></body></html>`;
  const l = extractOriginal(ld);
  assert.equal(l.way, 'json-ld');
  assert.equal(l.paragraphs.length, 2);
});

test('extract · short closing lines that only point elsewhere go, whatever they begin with; the same words inside the body stay', () => {
  const body = ['The bank kept its rate at 3 percent and said inflation was close to target this autumn.', 'Lenders expect the next move in the spring, after two more reports on wages and prices.', 'Message-board subscriber reads are now batched into one query, the release notes say.'];
  const tail = ['Stay up to date with the mortgage market by signing up for our free daily newsletter here.', 'Our customer service team is ready to assist you in finding the right products.'];
  assert.deepEqual(cleanEdges([...body, ...tail]), body);
  // a long closing paragraph is the article's own, even when it mentions a newsletter
  const longEnd = `The newsletter industry ${'grew again this year and '.repeat(20)}ended strong.`;
  assert.deepEqual(cleanEdges([...body, longEnd]), [...body, longEnd]);
  // "subscriber" is not "subscribe"
  assert.deepEqual(cleanEdges([...body, 'Batch message-board subscriber reads into one result.']), [...body, 'Batch message-board subscriber reads into one result.']);
});

test('states · a feed address that shows a sign-in page, or answers 401, is 「要登录」 in 试抓 (fetchSource), not a wrong address', async () => {
  const { fetchSource, makeContext } = await import('../src/index.mjs');
  const ctx = makeContext({ timeoutMs: 3000 });
  assert.equal((await fetchSource({ name: 'p', kind: 'rss', url: `${base}/login` }, ctx)).status, 'login');
  assert.equal((await fetchSource({ name: 'p', kind: 'rss', url: `${base}/private` }, ctx)).status, 'login');
  // control: a page that is neither a feed nor a sign-in page is still a wrong address
  assert.equal((await fetchSource({ name: 'p', kind: 'rss', url: `${base}/article` }, ctx)).status, 'gap');
});
