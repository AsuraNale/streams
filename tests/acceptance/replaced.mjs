// 1.1.1 P12 (待办 D2): the four 1.0 standards whose tests check 1.0's screens and pipeline, which 1.1 replaced. Their standards
// stand in standards.mjs as the maintainer wrote them (only he changes that table); their tests moved to legacy/, and the runner says
// which 1.1 item checks the same thing now instead of showing them red. The mapping is the 1.1 acceptance review's
// (docs/checks/2026-11-20-1.1/w9/evidence/acceptance-review.md, 「留意」): V3 → B8, V5 → B13, V6 → B12, V10 → B11.
export const REPLACED = Object.freeze({
  V3: Object.freeze({ by: 'B8', file: 'legacy/v03-five-fetch-states.test.mjs', why: '来源状态由 1.1 的六种状态取代（多一种「要登录」）' }),
  V5: Object.freeze({ by: 'B13', file: 'legacy/v05-bad-output-retry.test.mjs', why: '1.0 的格式退回重试由 1.1 更新的「摘要没写出来」取代' }),
  V6: Object.freeze({ by: 'B12', file: 'legacy/v06-login-expired.test.mjs', why: '登录过期由 1.1 更新的「没登录不开始」取代' }),
  V10: Object.freeze({ by: 'B11', file: 'legacy/v10-round-cap.test.mjs', why: '每轮上限由 1.1 更新的额度（来源数、新链接数）取代' }),
})
