#!/usr/bin/env node
// After editing the import map in src/renderer/index.html: its hash is part of the CSP.
//   node scripts/csp.mjs            print the policy (header) and say whether index.html's <meta> is current
//   node scripts/csp.mjs --write    rewrite the <meta> with the current hash
// The app computes the header from index.html at start; test/security.test.mjs fails while the <meta> is stale.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contentSecurityPolicy, importMapOf, metaPolicy, scriptHash } from '../src/main/security.mjs'
import { DESKTOP_DIR } from './lib/paths.mjs'

const file = join(DESKTOP_DIR, 'src', 'renderer', 'index.html')
const html = readFileSync(file, 'utf8')
const hash = scriptHash(importMapOf(html))
const META = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/
const current = META.exec(html)?.[2]
process.stdout.write(`header: ${contentSecurityPolicy(hash)}\nmeta:   ${current === metaPolicy(hash) ? 'current' : 'STALE'}\n`)
if (process.argv.includes('--write') && current !== metaPolicy(hash)) {
  writeFileSync(file, html.replace(META, `$1${metaPolicy(hash)}$3`))
  process.stdout.write('index.html <meta> rewritten\n')
}
