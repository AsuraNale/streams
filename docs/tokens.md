# token 名单（作废）

> **2026-11-11 重设计 R1 起作废。** 维护者 11-11（`docs/design/redesign/source/04-要维护者定的事.md` 第 19–21 题）：应用的主题直接用丽芙模板的样式表与部件 class，不再转写成另一套 token；v2 包 K2 的三套主题与它们的 `desktop/src/renderer/styles/tokens.css`、`desktop/scripts/gen-tokens.mjs`、对比度测试一并移除。

现在的做法见 `docs/desktop.md` §4.13：

- **主题来自模板**：四套（精密国际主义 · 澄明玻璃 · 研究对话（默认）· 单线黑白），每套加载模板自己的样式表与 `<body>` class，见 `desktop/src/shared/themes.mjs THEME_TEMPLATE`；模板文件原样放在 `desktop/src/renderer/template/`，sha256 清单 `template/manifest.json`。颜色、圆角、字重都是模板的变量（round 11 的 `--bench --panel --paper --well --ink11 --sub11 --accent11 --pick --inverse11 --rule11 --float11` 等），应用不定义颜色。
- **过渡**：还没换到模板部件的页面仍写 `var(--st-…)`；`desktop/src/renderer/styles/interim.css` 把这些名字指到模板的变量上（不定义颜色），R2–R4 把各页换成模板部件后整文件删除。
- **窗口首帧底色**：`desktop/src/shared/themes.mjs THEME_PAGE`，八种组合从真窗口读出（`node desktop/scripts/theme-colours.mjs`）。
- **字体**：随包的 Noto Sans SC（`desktop/src/renderer/fonts/NotoSansSC-VF.ttf`），由模板的 `design.css` 声明，`app://` 把模板要的 `template/shared/fonts/NotoSansSC-VF.ttf` 指到这一份。

K2 时的名单与六组取值见本文件的 git 历史（2026-11-10 的版本）。
