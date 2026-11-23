// 1.1 acceptance C1 (W7b): no relevance / substance judgment is left in the code the product runs. The installer ships core/src
// (and the desktop's src); v1.0's scoring pipeline moved to core/legacy/, which is not shipped. This scan reads every line of
// every .mjs / .js / .cjs file under core/src and desktop/src
// — comments included — and reports each one that names a word of v1.0's scoring: relevance, substance, threshold, strictness,
// rescore, 相关度, 实质, 阈值, 严格程度 (any case). Not scanned: the desktop's word files (texts*: the page's words, which are not
// code) and vendored folders. A line may stay only when it is on ALLOWED below: a line that merely reads data v1.0 wrote, with
// the reason beside it; an entry that matches nothing fails too (the list cannot rot).
// Also here: nothing in core/src or desktop/src imports core/legacy (the one-way rule of core/legacy/index.mjs).
// desktop/src is scanned whenever the repository has the desktop (desktop/package.json): always in the repository itself; a copy
// of core/ alone (core/scripts/mutation-check.mjs breaks such a copy) has none, and its scan is core/src's. The desktop's own
// copies (desktop/scripts/mutation-check.mjs) run this scan over themselves through desktop/test/c1-scan-desktop.test.mjs.
// Each check runs first on a synthetic file it must report (the reverse control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DESKTOP = true; // W7b: the desktop step took v1.0's code out of desktop/src
const HAS_DESKTOP = existsSync(join(REPO, 'desktop', 'package.json'));
const ROOTS = ['core/src', ...(SCAN_DESKTOP && HAS_DESKTOP ? ['desktop/src'] : [])];
const CODE = /\.(mjs|js|cjs)$/;
// the page's words (not code) and vendored code
const SKIP = [/^desktop\/src\/renderer\/texts/, /^desktop\/src\/main\/texts/, /(^|\/)(node_modules|third-party|vendor)(\/|$)/];
const WORDS = /relevance|substance|threshold|strictness|rescore|相关度|实质|阈值|严格程度/i;

// { file, includes: a piece of the one line allowed, why }
const ALLOWED = [
  {
    file: 'core/src/library/ledger.mjs',
    includes: "if (typeof ev.threshold === 'number') s.scores[ev.node].threshold = ev.threshold;",
    why: 'replays a `scored` event of a v1.0 ledger as it was written (an existing library\'s data); nothing in core/src writes one or judges by it',
  },
];

const posix = (p) => p.split('\\').join('/');

export function codeFiles(root, { repo = REPO } = {}) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      const rel = posix(relative(repo, path));
      if (SKIP.some((re) => re.test(rel))) continue;
      if (e.isDirectory()) walk(path);
      else if (CODE.test(e.name)) out.push(rel);
    }
  };
  walk(join(repo, root));
  return out;
}

/** [{ file, line, text }] for each line of `text` that names a word of v1.0's scoring and is not allowed. */
export function scanText(file, text, allowed = ALLOWED, used = new Set()) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!WORDS.test(line)) return;
    const ok = allowed.find((a) => a.file === file && line.includes(a.includes));
    if (ok) { used.add(ok); return; }
    hits.push({ file, line: i + 1, text: line.trim().slice(0, 160) });
  });
  return hits;
}

/** [{ file, line, text }] for each import / export … from / import() in `text` that reaches core/legacy. */
export function legacyImports(file, text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/(?:\bfrom\s*|\bimport\s*\(?\s*)['"][^'"]*\/legacy\//.test(line)) out.push({ file, line: i + 1, text: line.trim() });
  });
  return out;
}

test('sentinel: C1 scan · a line that judges by a score is reported, in any case and in Chinese; an allowed line is not', () => {
  const synthetic = [
    'const ok = true;',
    'if (score.relevance >= threshold) keepIt();',
    '  // SUBSTANCE first, then the rest',
    "const label = '相关度';",
    'return strictness;',
  ].join('\n');
  const hits = scanText('core/src/made-up.mjs', synthetic);
  assert.deepEqual(hits.map((h) => h.line), [2, 3, 4, 5]);
  assert.match(hits[0].text, /score\.relevance >= threshold/);
  // the allow-list is per file and per line: the same text in another file is reported
  const line = ALLOWED[0].includes;
  assert.deepEqual(scanText(ALLOWED[0].file, line), []);
  assert.equal(scanText('core/src/other.mjs', line).length, 1);
});

test('C1 scan · core/src and desktop/src name no relevance / substance / threshold / strictness / rescore (相关度 / 实质 / 阈值 / 严格程度)', () => {
  const used = new Set();
  const files = ROOTS.flatMap(codeFiles);
  assert.ok(files.length > 50, `control: the scan reads the code (${files.length} files)`);
  assert.ok(files.includes('core/src/update/run.mjs') && files.includes('core/src/library/ledger.mjs'), 'control: files 1.1 runs are scanned');
  if (HAS_DESKTOP) assert.ok(files.includes('desktop/src/main/services/pipeline.mjs') && files.includes('desktop/src/renderer/screens/inbox.js'), "control: the desktop's code is scanned");
  assert.ok(!files.some((f) => /^desktop\/src\/(renderer|main)\/texts/.test(f)), 'control: the word files are not');
  const hits = files.flatMap((f) => scanText(f, readFileSync(join(REPO, f), 'utf8'), ALLOWED, used));
  assert.deepEqual(hits, [], hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n'));
  const stale = ALLOWED.filter((a) => !used.has(a));
  assert.deepEqual(stale.map((a) => a.file), [], 'an allowed line that is no longer there is taken off the list');
});

test('C1 scan · nothing in core/src imports core/legacy, nor in desktop/src (the reverse control: such an import is reported)', () => {
  assert.equal(legacyImports('core/src/x.mjs', "import { runRound } from '../../legacy/index.mjs';").length, 1);
  assert.equal(legacyImports('core/src/x.mjs', "const m = await import('../legacy/pipeline/round.mjs');").length, 1);
  assert.equal(legacyImports('core/src/x.mjs', "export { x } from '../legacy/x.mjs';").length, 1);
  assert.equal(legacyImports('core/src/x.mjs', "import { x } from '../library/x.mjs'; // not legacy").length, 0);
  const found = ROOTS.flatMap(codeFiles).flatMap((f) => legacyImports(f, readFileSync(join(REPO, f), 'utf8')));
  assert.deepEqual(found, [], found.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n'));
});
