#!/usr/bin/env node
// Redesign R1: writes src/renderer/template/manifest.json — every file of the design's template the app carries, with the
// path it has in the design (docs/design/redesign/source/, the design folder as copied) and its sha256; refuses when the
// app's copy and the design's file differ in a single byte. test/theme.test.mjs checks the manifest against both.
//   node scripts/template-manifest.mjs
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from './lib/paths.mjs'

const TEMPLATE = join(DESKTOP_DIR, 'src', 'renderer', 'template')
const SOURCE = join(REPO_DIR, 'docs', 'design', 'redesign', 'source')
// the one folder the app's copy renames (no Chinese path in the app's code); its files are unchanged
export const RENAMED = Object.freeze([['templates/precision-detail/', 'templates/精密国际主义-精修/']])
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

const files = []
const walk = d => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (n !== 'manifest.json') files.push(relative(TEMPLATE, p).replace(/\\/g, '/'))
  }
}
walk(TEMPLATE)
files.sort()
const rows = files.map(app => {
  const source = `07-模板版/${RENAMED.reduce((s, [a, b]) => s.replace(a, b), app)}`
  const h = sha(join(TEMPLATE, app))
  const d = sha(join(SOURCE, source))
  if (h !== d) throw new Error(`${app}: not the design's ${source}`)
  return { app, source, sha256: h }
})
const manifest = {
  about: 'Redesign R1: the files of the design\'s template the app uses, each byte for byte the design\'s. app: the path under src/renderer/template/; source: the path under docs/design/redesign/source/ (the design folder as copied, see docs/design/redesign/来源.md); sha256: of both. The app\'s copy renames one folder (templates/精密国际主义-精修 → templates/precision-detail) so its code names no Chinese path; the files are unchanged. Written by scripts/template-manifest.mjs; test/theme.test.mjs checks every hash.',
  files: rows,
}
writeFileSync(join(TEMPLATE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`${rows.length} files, each the design's`)
