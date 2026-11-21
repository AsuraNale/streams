// What a page is when it is not the article (1.1 W2): Streams stops at a human check or a sign-in page — it marks it and
// touches nothing (no click, no form, no other way of reading) — and an error page is a dead address, not something read.
// humanCheck(html)              -> true for a CAPTCHA / "checking your browser" page
// signInPage(html, url)         -> true for a page that asks to sign in before showing anything
// errorPage({ title, text })    -> true for a "404 / page not found" page (pretest 2: a 404 page of weibo.com was taken as
//                                  read once rendered)
import { stripHtml } from '../fetch/html.mjs';
import { titleOf } from './extract.mjs';

const CHECK = /g-recaptcha|h-captcha|hcaptcha\.com|recaptcha\/api|cf-challenge|challenge-platform|cf_chl_|turnstile|just a moment\.\.\.|checking (if the site connection is secure|your browser)|verify (you are|that you are) (a )?human|are you a robot|请完成安全验证|人机验证|滑动验证|拖动滑块|安全验证/i;
const SIGN_IN_PATH = /\/(login|log-in|signin|sign-in|sign_in|auth\/login|account\/login|accounts\/login|passport|sso)(\/|\?|$|\.)/i;
const SIGN_IN_WORDS = /\b(sign in|log in|login|sign-in|log-in)\b|登录|登入|请先登录/i;
const PASSWORD = /<input\b[^>]*type\s*=\s*["']?password/i;
const ERROR_TITLE = /(^|\D)404(\D|$)|\b410\b|not found|page (does not|doesn'?t) exist|no longer (available|exists)|页面不存在|页面未找到|找不到(该|此)?页面|页面已(删除|失效)|内容已(删除|失效)|已被删除|无法找到/i;
const SHORT = 1500;

export function humanCheck(html) {
  return CHECK.test(String(html ?? ''));
}

export function signInPage(html, url = '') {
  const raw = String(html ?? '');
  const text = stripHtml(raw.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' '));
  const short = Array.from(text).length < SHORT;
  let path = '';
  try { path = new URL(String(url)).pathname + new URL(String(url)).search; } catch { /* no address */ }
  if (SIGN_IN_PATH.test(path) && (PASSWORD.test(raw) || short)) return true;
  return PASSWORD.test(raw) && short && SIGN_IN_WORDS.test(`${titleOf(raw)} ${text}`);
}

export function errorPage({ title = '', text = '' } = {}) {
  const t = String(title ?? '');
  const body = String(text ?? '');
  // only a short page: an article whose title has "not found" in it is still an article
  if (Array.from(body).length >= SHORT) return false;
  return ERROR_TITLE.test(t) || ERROR_TITLE.test(body.slice(0, 200));
}
