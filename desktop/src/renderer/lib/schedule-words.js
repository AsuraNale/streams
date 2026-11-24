// 1.1.1 P11a (A10, A11): a library's schedule in words — 「每天」 · 「工作日」 · 「每周二、五」 · 「每月 15 号」, and the tag on 库架's
// card (「每周二、五 08:30 自动运行」 / 「未开定时」). The schedule is the main process's view (getLibrarySchedule) or the overview's
// row: { enabled, time, every?, days?, day? }; no `every` is every day.
import { fmt } from './format.js'
import { SCHEDULE } from '../texts/common.js'

export function scheduleWhen(s, W = SCHEDULE) {
  const every = s?.every ?? 'day'
  if (every === 'week' && Array.isArray(s.days) && s.days.length) return fmt(W.week, { days: s.days.map(d => W.weekdays[d] ?? String(d)).join(W.daysSep) })
  if (every === 'month' && Number.isInteger(s.day)) return fmt(W.month, { n: s.day })
  return W.every[every] ?? W.every.day
}

export function scheduleTag(s, W = SCHEDULE) {
  if (!s || !s.enabled) return W.tagOff
  return fmt(W.tagOn, { when: scheduleWhen(s, W), time: s.time })
}
