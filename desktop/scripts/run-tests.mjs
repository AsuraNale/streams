#!/usr/bin/env node
// `npm test`: `node --test` over test/*.test.mjs, one file at a time (each file with Electron starts its own app).
// Arguments go to `node --test` (test files, --test-name-pattern …).
import { spawnSync } from 'node:child_process'
import { DESKTOP_DIR } from './lib/paths.mjs'

const extra = process.argv.slice(2)
const files = extra.some(a => !a.startsWith('-')) ? [] : ['test/*.test.mjs']
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...extra, ...files], {
  cwd: DESKTOP_DIR, stdio: 'inherit', env: process.env,
})
process.exit(r.status ?? 1)
