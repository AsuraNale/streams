// 1.1.1 P14: what the script side of the motion reads from styles/motion.css — the same variables the style sheet uses, so a
// duration or a curve is written in one place only (motion.css :root).
//   moMs('--mo-in')      the variable in milliseconds (200ms → 200, .9s → 900); `fallback` when it is not there
//   moEase()             the shared curve (--mo-ease)
//   stillMotion()        the system asks for reduced motion (then nothing moves: callers skip their animation)

function varOf(name) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() } catch { return '' }
}

export function moMs(name, fallback) {
  const v = varOf(name)
  const m = /^(-?\d*\.?\d+)(ms|s)$/.exec(v)
  if (!m) return fallback
  return m[2] === 's' ? Math.round(Number(m[1]) * 1000) : Math.round(Number(m[1]))
}

export function moEase(fallback = 'cubic-bezier(.2, .7, .2, 1)') {
  return varOf('--mo-ease') || fallback
}

export function stillMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
