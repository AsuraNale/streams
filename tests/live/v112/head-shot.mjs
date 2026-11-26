#!/usr/bin/env node
// 1.1.2 P1: the head of 主 Agent's page with a real library's long name (the live run's picture showed the title cut off before
// the fix) — no connection used: the app in development opens the library's conversation page and takes two pictures (the
// start page with its earlier conversation, and 来源与要求's step), then quits.
//   node tests/live/v112/head-shot.mjs --world <a world continue-live.mjs left> --out <folder>
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(here, '..', '..', '..', 'desktop');
const { _electron } = await import(pathToFileURL(join(DESKTOP, 'node_modules', 'playwright-core', 'index.mjs')).href);
const { appEnv, electronExe } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'paths.mjs')).href);
const { closeApp } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'close-app.mjs')).href);
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
const WORLD = arg('world');
const OUT = arg('out');
if (!WORLD || !OUT || !existsSync(join(WORLD, 'libraries'))) { console.error('usage: head-shot.mjs --world <folder> --out <folder>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const lib = join(WORLD, 'libraries', readdirSync(join(WORLD, 'libraries'))[0]);
const app = await _electron.launch({ executablePath: electronExe(), args: ['--force-device-scale-factor=1', DESKTOP], env: appEnv({ appData: join(WORLD, 'app-data'), localData: join(WORLD, 'local-data'), extra: { STREAMS_WINDOW: 'shown', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', STREAMS_DEV_LIBRARY: lib, STREAMS_START_SCREEN: 'inbox' } }), timeout: 60_000 });
const page = await app.firstWindow({ timeout: 60_000 });
const mask = () => [page.locator('.st-path'), page.getByText(/AppData|[A-Z]:\\Users/)];
try {
  await page.waitForFunction(() => document.querySelector('main[data-screen="inbox"]') !== null, null, { timeout: 90_000 });
  await page.click('nav.st-lib-tabs button[data-tab="sources"]');
  await page.waitForFunction(() => document.querySelector('[data-action="change-card"] button') !== null, null, { timeout: 60_000 });
  await page.click('[data-action="change-card"] button');
  await page.waitForFunction(() => document.querySelector('main[data-screen="build"][data-view="start"] [data-part="earlier"] [data-earlier]') !== null, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  const head = await page.evaluate(() => { const h = document.querySelector('main[data-screen="build"] .work-header'); return { title: document.querySelector('#build-title').textContent, cut: h.scrollHeight > h.clientHeight + 1, titleLines: Math.round(document.querySelector('#build-title').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('#build-title')).lineHeight)) } });
  console.log(JSON.stringify(head));
  await page.screenshot({ path: join(OUT, '2b-continue-start-after-fix.png'), mask: mask() });
} finally {
  await closeApp(app, { userDataDir: join(WORLD, 'app-data', 'electron') }).catch(() => {});
}
