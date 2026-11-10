// v2 package K2: the word / ground pairs every one of the six sets is held to (docs/checks/2026-11-10-wp-k2/contract.md: 正文 /
// 次要文字 / 按钮文字 对底色 ≥ 4.5 / ≥ 3 / ≥ 4.5; the K1 draft's README §六 adds the state words on their own tints at 4.5).
// test/theme.test.mjs computes them from tokens.css; scripts/gen-tokens.mjs --doc writes the table in docs/tokens.md.
// [words, ground, the floor, what it is]
export const CONTRAST_PAIRS = Object.freeze([
  // 正文 (body text) ≥ 4.5
  ['text', 'page', 4.5, '正文 / 主区底'],
  ['text', 'surface', 4.5, '正文 / 卡片'],
  ['sidebar-text', 'sidebar', 4.5, '正文 / 左栏'],
  ['sidebar-selected-title', 'selected', 4.5, '正文 / 选中底（左栏当前的库）'],
  ['text', 'selected', 4.5, '正文 / 选中底（待看当前的卡、当前标签）'],
  ['text', 'surface-2', 4.5, '正文 / 灰底（提示框、改前）'],
  // 次要文字 (secondary text) ≥ 3
  ['text-2', 'page', 3, '次要 / 主区底'],
  ['text-2', 'surface', 3, '次要 / 卡片'],
  ['sidebar-text-2', 'sidebar', 3, '次要 / 左栏'],
  ['text-2', 'surface-2', 3, '次要 / 灰底'],
  ['text-2', 'selected', 3, '次要 / 选中底'],
  ['text-3', 'page', 3, '更淡的说明 / 主区底'],
  ['text-3', 'surface', 3, '更淡的说明 / 卡片'],
  // 按钮文字 (button words) ≥ 4.5
  ['on-accent', 'accent', 4.5, '主按钮字 / 强调色'],
  ['text', 'surface-2', 4.5, '次要按钮字 / 按钮底'],
  ['accent', 'surface', 4.5, '链接、安静按钮字 / 卡片'],
  // 状态字 on their tints ≥ 4.5
  ['wait', 'wait-bg', 4.5, '琥珀字 / 琥珀浅底'],
  ['done', 'done-bg', 4.5, '绿字 / 绿浅底'],
  ['danger', 'danger-bg', 4.5, '红字 / 红浅底'],
  ['accent-alt', 'accent-alt-soft', 4.5, '紫字 / 紫浅底'],
])
