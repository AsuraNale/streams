#!/usr/bin/env node
// 1.1.3 material: the situation the maintainer is stuck in on 1.1.2 (11-26), in pictures — a conversation of 1.1.1 still going (opened
// from 主 Agent as a new library, never tied to one; no card, so no 不建了), and his library's conversation then refused with
// 「另一段对话正在进行」. No connection used: the app in development on a world with his library copied and his going
// conversation file copied (both read only from where they are), three pictures, then quit.
//   node tests/live/v112/stuck-shot.mjs --world <a world continue-live.mjs left> --build <his build.json> --out <folder>
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(here, '..', '..', '..', 'desktop');
const { _electron } = await import(pathToFileURL(join(DESKTOP, 'node_modules', 'playwright-core', 'index.mjs')).href);
const { appEnv, electronExe } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'paths.mjs')).href);
const { closeApp } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'close-app.mjs')).href);
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
const WORLD = arg('world');
const BUILD = arg('build');
const OUT = arg('out');
if (!WORLD || !BUILD || !OUT || !existsSync(BUILD)) { console.error('usage: stuck-shot.mjs --world <folder> --build <build.json> --out <folder>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
mkdirSync(join(WORLD, 'app-data', 'build'), { recursive: true });
copyFileSync(BUILD, join(WORLD, 'app-data', 'build', 'build.json'));
const lib = join(WORLD, 'libraries', readdirSync(join(WORLD, 'libraries'))[0]);
const app = await _electron.launch({ executablePath: electronExe(), args: ['--force-device-scale-factor=1', DESKTOP], env: appEnv({ appData: join(WORLD, 'app-data'), localData: join(WORLD, 'local-data'), extra: { STREAMS_WINDOW: 'shown', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', STREAMS_DEV_LIBRARY: lib, STREAMS_START_SCREEN: 'inbox' } }), timeout: 60_000 });
const page = await app.firstWindow({ timeout: 60_000 });
const mask = () => [page.locator('.st-path'), page.getByText(/AppData|[A-Z]:\\Users/)];
const shot = (n) => page.screenshot({ path: join(OUT, n), mask: mask() });
try {
  await page.waitForFunction(() => document.querySelector('main[data-screen="inbox"]') !== null, null, { timeout: 90_000 });
  await page.click('.st-sidebar [data-nav="chat"]');
  await page.waitForFunction(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null, null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  await shot('stuck-1-going-conversation.png');
  const ends = await page.evaluate(() => ({ drop: Boolean(document.querySelector('[data-action="drop"]')), restart: Boolean(document.querySelector('[data-action="restart"]')) }));
  await page.click('nav[data-part="conversations"] [data-conv-library]');
  await page.waitForFunction(() => document.querySelector('main[data-screen="build"][data-view="other"]') !== null, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await shot('stuck-2-library-refused.png');
  await page.click('nav.st-lib-tabs button[data-tab="sources"]').catch(() => {});
  console.log(JSON.stringify({ endButtonsInGoingConversation: ends }));
} finally {
  await closeApp(app, { userDataDir: join(WORLD, 'app-data', 'electron') }).catch(() => {});
}
