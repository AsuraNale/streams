#!/usr/bin/env node
/**
 * v2 package N: is Streams' uninstall entry (or its toast activator key) in the REAL registry — the one Windows Settings →
 * Apps and a double-clicked unins000.exe see? (docs/installer.md §十一)
 *
 *   node installer/real-registry.mjs
 *
 * A shell inside the Claude desktop app (its tool shells: Bash, PowerShell) reads and writes HKCU through the Claude
 * package's private registry view (…\Packages\Claude_<id>\SystemAppData\Helium\User.dat): what such a shell installs is
 * only in that view, and what it reads may be only there (the entry of 2026-11-09 was). So this script asks a process that
 * Explorer starts — outside the package — to run `reg query` for the two keys, and prints both answers next to what this
 * process sees. It writes two small files in C:\Users\Public (a .cmd and its answer, removed afterwards); a console window
 * shows for a moment. Read only: nothing in the registry is changed. Exit code 0 when neither view has either key, 1 when one
 * does, 2 when Explorer's process did not answer.
 * @module installer/real-registry
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = JSON.parse(readFileSync(join(REPO, 'installer', 'setup', 'release.json'), 'utf8'))
const { TOAST_ACTIVATOR_CLSID } = await import(new URL('../desktop/src/main/app-id.mjs', import.meta.url))
const BS = String.fromCharCode(92)
const KEYS = {
  entry: ['HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Uninstall', `{${RELEASE.app_guid}}_is1`].join(BS),
  toastKey: ['HKCU', 'Software', 'Classes', 'CLSID', TOAST_ACTIVATOR_CLSID].join(BS),
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const REG = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')

/** What this process sees: { entry: bool, toastKey: bool }. */
export function hereHas() {
  return Object.fromEntries(Object.entries(KEYS).map(([k, key]) => [k, spawnSync(REG, ['query', key], { windowsHide: true }).status === 0]))
}

/** What a process Explorer starts sees: { entry: bool, toastKey: bool }, or null when it did not answer in `waitMs`. */
export async function realHas({ waitMs = 30_000 } = {}) {
  const pub = process.env.PUBLIC ?? 'C:\\Users\\Public'
  const id = randomBytes(4).toString('hex')
  const cmd = join(pub, `streams-real-registry-${id}.cmd`)
  const out = join(pub, `streams-real-registry-${id}.txt`)
  const lines = ['@echo off']
  // (the redirection first: `echo x=0>>f` would read 0>> as a handle number)
  for (const [k, key] of Object.entries(KEYS)) lines.push(`"${REG}" query "${key}" >nul 2>&1`, `if errorlevel 1 (>>"${out}" echo ${k}=0) else (>>"${out}" echo ${k}=1)`)
  lines.push(`>>"${out}" echo done=1`)
  writeFileSync(cmd, `${lines.join('\r\n')}\r\n`)
  try {
    spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'), [cmd], { windowsHide: true })
    for (let t = 0; t < waitMs && !(existsSync(out) && readFileSync(out, 'utf8').includes('done=1')); t += 250) await sleep(250)
    if (!existsSync(out) || !readFileSync(out, 'utf8').includes('done=1')) return null
    const got = Object.fromEntries(readFileSync(out, 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => l.trim().split('=')))
    return Object.fromEntries(Object.keys(KEYS).map(k => [k, got[k] === '1']))
  } finally {
    await sleep(300)
    for (const f of [cmd, out]) rmSync(f, { force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = hereHas()
  const real = await realHas()
  process.stdout.write(`${JSON.stringify({ keys: KEYS, thisProcess: here, startedByExplorer: real }, null, 2)}\n`)
  process.exitCode = real === null ? 2 : (Object.values(here).some(Boolean) || Object.values(real).some(Boolean) ? 1 : 0)
}
