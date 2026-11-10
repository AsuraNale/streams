// K1 设计稿的 token 数据：一处写，两处用——tools/gen-tokens.mjs 由它生成 css/tokens.css 和 README 里的映射表。
// 原型的变量（--paper --bench --panel --well --ink11 --sub11 --accent11 --pick --inverse11）照抄
// themes-source/shared/round11/workbench.css；三套主题 × 浅 / 深共六组。流息的 --st-* 名字照 docs/tokens.md。

export const THEMES = Object.freeze({
  precision: { name: '精密国际主义', proto: 'precision11' },
  glass: { name: '澄明玻璃', proto: 'glass11' },
  research: { name: '研究对话', proto: 'research11' },
})
export const APPEARANCES = Object.freeze({ light: '浅色', dark: '深色' })

// workbench.css 的值（深色的 ink / sub / inverse 是 .r11.r11[data-appearance=dark] 的公共值，三套一样）
export const ROLES = {
  precision: {
    light: { paper: '#FCFCFA', bench: '#F6F6F3', panel: '#F0F0ED', well: '#E9E9E6', ink: '#242424', sub: '#555555', accent: '#363636', pick: '#E4E4E2', inverse: '#FFFFFF' },
    dark: { paper: '#20201F', bench: '#151515', panel: '#1B1B1A', well: '#292928', ink: '#E5E5DF', sub: '#A9ABA8', accent: '#C9CDCE', pick: '#353635', inverse: '#191A19' },
  },
  glass: {
    light: { paper: '#FBFCFF', bench: '#F6F8FC', panel: '#EFF2F8', well: '#E9EDF6', ink: '#27334B', sub: '#53617A', accent: '#495F98', pick: '#E1E8F7', inverse: '#FFFFFF' },
    dark: { paper: '#22262E', bench: '#16191F', panel: '#1B1F26', well: '#292F38', ink: '#E5E5DF', sub: '#A9ABA8', accent: '#B2C5EF', pick: '#303A50', inverse: '#191A19' },
  },
  research: {
    light: { paper: '#FDFCF9', bench: '#F7F7F3', panel: '#F1F2ED', well: '#ECECE5', ink: '#283C40', sub: '#536466', accent: '#395D62', pick: '#E2EAE5', inverse: '#FFFFFF' },
    dark: { paper: '#232724', bench: '#161A19', panel: '#1C201E', well: '#292E2A', ink: '#E5E5DF', sub: '#A9ABA8', accent: '#B3D0C0', pick: '#303E38', inverse: '#191A19' },
  },
}

// 原型没有的状态色：色相沿用流息现有的琥珀 / 绿 / 红 / 紫；浅色的字比河蓝深一档（在浅底上 ≥ 4.5），
// 深色沿用夜间那套；浅底 = 状态色按比例混进这套主题的 paper（浅 12%、深 16%），所以每套主题的浅底都带自己的纸色。
export const STATUS = {
  light: { wait: '#8F5D10', done: '#21714F', danger: '#A93A33', alt: '#5B4FA8' },
  dark: { wait: '#E3B464', done: '#6CC9A6', danger: '#E88A81', alt: '#A79BE8' },
}
export const STATUS_MIX = { light: 0.12, dark: 0.16 }

// 库的颜色：只存名字（core LIBRARY_COLORS），值沿用 docs/tokens.md 的浅 / 深两套，不随主题变（库的身份色）
export const LIB = {
  light: { river: '#1F6E8C', violet: '#5B4FA8', green: '#237A5B', muted: '#56646F', on: '#FFFFFF' },
  dark: { river: '#74B7D3', violet: '#A79BE8', green: '#6CC9A6', muted: '#9CAAB5', on: '#0F161B' },
}

// 形状与字：原型 round9 各主题的 --key-radius、--display-weight 等，换成流息的名字
export const SHAPE = {
  precision: { radius: '0px', radiusS: '0px', radiusXs: '0px', radiusKey: '0px', weightDisplay: 650, trackingDisplay: '-0.035em', weightLabel: 550, fsBody: '14px', iconCap: 'butt', iconJoin: 'miter', iconWeight: 1.6 },
  glass: { radius: '16px', radiusS: '12px', radiusXs: '8px', radiusKey: '20px', weightDisplay: 600, trackingDisplay: '0.025em', weightLabel: 600, fsBody: '15px', iconCap: 'round', iconJoin: 'round', iconWeight: 1.65 },
  research: { radius: '9px', radiusS: '6px', radiusXs: '3px', radiusKey: '3px', weightDisplay: 600, trackingDisplay: '-0.02em', weightLabel: 500, fsBody: '14px', iconCap: 'round', iconJoin: 'round', iconWeight: 1.65 },
}

const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const toHex = a => `#${a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`
/** t of a, the rest of b (sRGB), like color-mix(in srgb, a t, b) */
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v * t + hex(b)[i] * (1 - t)))
const rgba = (h, a) => `rgba(${hex(h).join(', ')}, ${a})`

/**
 * The --st-* tokens of one theme × appearance: [token, value, where it comes from (原型的哪个变量 / 怎么算的)].
 * 名字、顺序照 docs/tokens.md；「新」= 流息现在没有、K2 要加的名字。
 */
export function tokensOf(theme, appearance) {
  const r = ROLES[theme][appearance]
  const s = STATUS[appearance]
  const k = STATUS_MIX[appearance]
  const lib = LIB[appearance]
  const sh = SHAPE[theme]
  const dark = appearance === 'dark'
  const faint = mix(r.sub, r.bench, dark ? 0.8 : 0.78)
  const accentHover = mix(r.accent, r.ink, 0.88)
  const soft = c => mix(c, r.paper, k)
  const rows = [
    // 面
    ['--st-page', r.bench, '--bench'],
    ['--st-surface', r.paper, '--paper'],
    ['--st-surface-2', r.well, '--well'],
    ['--st-card-head', r.well, '--well（原型 .confirm-top）'],
    ['--st-table-head', r.well, '--well'],
    ['--st-row-head', r.panel, '--panel'],
    ['--st-selected', r.pick, '--pick（新：选中的行、标签、条目）'],
    ['--st-active-fill', r.pick, '--pick'],
    // 线
    ['--st-border', rgba(r.ink, 0.12), '--rule11 = ink 12%'],
    ['--st-control-border', rgba(r.ink, 0.18), 'ink 18%（原型控件无边，输入框要能看出边，自算）'],
    ['--st-divider', rgba(r.ink, 0.12), '--rule11'],
    ['--st-divider-soft', rgba(r.ink, 0.07), 'ink 7%（自算）'],
    // 左栏与右栏
    ['--st-sidebar', r.panel, '--panel（左栏、右栏同色）'],
    ['--st-sidebar-text', r.ink, '--ink11'],
    ['--st-sidebar-text-2', r.sub, '--sub11'],
    ['--st-sidebar-divider', rgba(r.ink, 0.12), '--rule11'],
    ['--st-sidebar-button', r.well, '--well'],
    ['--st-sidebar-button-border', 'transparent', '原型 border-color: transparent'],
    ['--st-sidebar-selected-title', r.ink, '--ink11（选中项底是 --pick）'],
    ['--st-sidebar-selected-sub', r.sub, '--sub11'],
    // 字
    ['--st-text', r.ink, '--ink11'],
    ['--st-text-2', r.sub, '--sub11'],
    ['--st-text-3', faint, `sub 往 bench 走 ${dark ? 20 : 22}%（原型没有，自算）`],
    ['--st-text-dark-2', r.sub, '--sub11'],
    ['--st-line-todo', faint, '同 --st-text-3'],
    // 强调色
    ['--st-accent', r.accent, '--accent11'],
    ['--st-accent-hover', accentHover, 'accent 88% + ink（原型主按钮 :hover）'],
    ['--st-on-accent', r.inverse, '--inverse11'],
    ['--st-on-accent-2', mix(r.inverse, r.accent, 0.78), 'inverse 78% + accent（自算）'],
    ['--st-focus', r.accent, '--accent11（新：焦点环，原型 --focus）'],
    // 状态
    ['--st-wait', s.wait, `琥珀（${dark ? '夜间原值' : '比河蓝深一档'}）`],
    ['--st-wait-bg', soft(s.wait), `wait ${k * 100}% + paper`],
    ['--st-wait-border', mix(s.wait, r.paper, dark ? 0.4 : 0.35), `wait ${dark ? 40 : 35}% + paper`],
    ['--st-done', s.done, `绿（${dark ? '夜间原值' : '比河蓝深一档'}）`],
    ['--st-done-bg', soft(s.done), `done ${k * 100}% + paper`],
    ['--st-done-border', s.done, '同 --st-done'],
    ['--st-danger', s.danger, '红'],
    ['--st-danger-bg', soft(s.danger), `danger ${k * 100}% + paper`],
    ['--st-step-todo', r.well, '--well（原型 .progress-line 没到的一段）'],
    ['--st-step-done-past', faint, '同 --st-text-3'],
    ['--st-accent-alt', s.alt, '紫（问库记号、图谱）'],
    ['--st-accent-alt-soft', soft(s.alt), `alt ${k * 100}% + paper`],
    // 五种抓取状态
    ['--st-fetch-ok', s.done, '同 --st-done'],
    ['--st-fetch-ok-bg', soft(s.done), '同 --st-done-bg'],
    ['--st-fetch-empty', r.sub, '--sub11'],
    ['--st-fetch-empty-bg', r.well, '--well'],
    ['--st-fetch-gap', s.wait, '同 --st-wait'],
    ['--st-fetch-gap-bg', soft(s.wait), '同 --st-wait-bg'],
    ['--st-fetch-failed', s.wait, '同 --st-wait'],
    ['--st-fetch-failed-bg', soft(s.wait), '同 --st-wait-bg'],
    ['--st-fetch-blocked', s.danger, '同 --st-danger'],
    ['--st-fetch-blocked-bg', soft(s.danger), '同 --st-danger-bg'],
    // 图表
    ['--st-chart-against', s.danger, '同 --st-danger'],
    ['--st-chart-background', r.well, '--well'],
    ['--st-chart-gap', faint, '同 --st-text-3'],
    ['--st-chart-1', r.accent, 'accent'],
    ['--st-chart-2', mix(r.accent, r.paper, 0.8), 'accent 往 paper 走 20%'],
    ['--st-chart-3', mix(r.accent, r.paper, 0.6), '40%'],
    ['--st-chart-4', mix(r.accent, r.paper, 0.4), '60%'],
    ['--st-chart-5', mix(r.accent, r.paper, 0.2), '80%'],
    // 库的颜色
    ['--st-lib-river', lib.river, '不随主题变（docs/tokens.md 原值）'],
    ['--st-lib-violet', lib.violet, '同上'],
    ['--st-lib-green', lib.green, '同上'],
    ['--st-lib-muted', lib.muted, '同上'],
    ['--st-on-lib', lib.on, '同上'],
    // 衬底与阴影
    ['--st-scrim', dark ? 'rgba(0, 0, 0, 0.55)' : rgba(r.ink, 0.32), dark ? '黑 55%' : 'ink 32%'],
    ['--st-shadow-menu', dark ? '0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)' : `0 1px 2px ${rgba(r.ink, 0.06)}, 0 12px 32px -12px ${rgba(r.ink, 0.28)}`, '菜单与对话框（自算）'],
    ['--st-shadow-card', dark ? '0 6px 22px -13px rgba(0, 0, 0, 0.6)' : '0 6px 22px -13px rgba(26, 32, 48, 0.18)', '--float11（新：卡片浮起）'],
    // 形状与字
    ['--st-radius', sh.radius, '原型 --key-radius 一系（新值）'],
    ['--st-radius-s', sh.radiusS, '按钮、标签'],
    ['--st-radius-xs', sh.radiusXs, '小角标'],
    ['--st-radius-key', sh.radiusKey, '新：主按钮（玻璃更圆、研究对话 3px）'],
    ['--st-font', "'Streams Numerals', 'Streams Noto Sans SC', sans-serif", '原型 --copy：数字走等宽、其余 Noto Sans SC'],
    ['--st-font-mono', "'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace", '原型 --data'],
    ['--st-fs-body', sh.fsBody, '原型 --reading-size'],
    ['--st-weight-body', dark ? 360 : 400, '新：深色字重减一点（原型 --dark-copy 360）'],
    ['--st-weight-display', dark ? sh.weightDisplay - 40 : sh.weightDisplay, '新：原型 --display-weight（深色减 40）'],
    ['--st-tracking-display', sh.trackingDisplay, '新：原型 --display-spacing'],
    ['--st-weight-label', sh.weightLabel, '新：原型 --label-weight'],
    ['--st-icon-cap', sh.iconCap, '新：图标线头（原型 --cap）'],
    ['--st-icon-join', sh.iconJoin, '新：图标拐角（原型 --join）'],
    ['--st-icon-weight', sh.iconWeight, '新：图标线宽（原型 --icon-weight）'],
  ]
  return rows
}

// 两套里都一样、不随主题变的
export const COMMON = [
  ['--st-fs-small', '12px'], ['--st-fs-tiny', '11px'], ['--st-fs-title', '22px'], ['--st-fs-heading', '26px'], ['--st-lh', '1.65'],
  ['--st-control-h', '38px'], ['--st-gutter', '12px'], ['--st-col-sidebar', '232px'], ['--st-col-panel', '380px'],
  ['--st-step', '8px'], ['--st-step-gap', '3px'],
]
