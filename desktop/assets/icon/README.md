# 流息 app icon (desktop/assets/icon)

The mark is **五流** ("five streams"), designed by 赞妮 (an independent design agent) on 2026-11-10 and chosen by 维护者 the same
day (round 1, option B; colours black and white with the red / blue 3D edges). Five lines in two steps merge into one: the
sources, arriving at different times, filtered one gate after another into the one line that enters your library. It is
drawn on a 13 × 9 grid: line width one cell, gaps one cell, only 0° / 90° / 45°, every open end cut at 45°. The app icon is
the black mark on a white rounded square, a red copy (`#E53935`) shifted left and a blue one (`#1E88E5`) shifted right under
it — half a cell at 512, one whole pixel at 48 / 32 / 24, and none at 16 (black and white only).

The design's final files are in the repository as they came, byte for byte: `docs/design/logo/source/流息/` (with the design
notes `docs/design/logo/source/设计说明.md`; where they came from and every file's sha256: `docs/design/logo/来源.md`). The
mark's geometry and the script that wrote those files are in 赞妮's `Logo设计\tools\` and were not copied.

## Files

| File | What it is | Where it comes from |
|---|---|---|
| `icon-512.svg` | The white rounded square (rx 112.64) with the mark at 24 px a cell, red / blue at ±12 px | The design's `icon-512.svg`, byte for byte |
| `icon-48.svg` | 3 px a cell, red / blue ±1 px | The design's `icon-48.svg`, byte for byte |
| `icon-32.svg` | 2 px a cell, red / blue ±1 px | The design's `icon-32.svg`, byte for byte |
| `icon-24.svg` | 1.5 px a cell (the design's choice: the grid does not fit 24 in whole pixels), red / blue ±1 px | The design's `icon-24.svg`, byte for byte |
| `icon-16.svg` | 1 px a cell, black and white only | The design's `icon-16.svg`, byte for byte |
| `png/icon-16.png` … `png/icon-48.png` | The renders the .ico packs, 16 · 24 · 32 · 48 | `icon-<size>.svg` rendered 1:1 (at 8× density, brought down with lanczos3) |
| `png/icon-256.png` | The large render | `icon-512.svg` at 72 dpi, brought down to 256 with lanczos3 |
| `streams.ico` | The Windows icon: 16, 24, 32, 48 as 32-bpp DIBs with alpha, 256 as a PNG entry | Packed from the five PNGs by the script below |

`streams.ico` is the one file of the set the app reads (`desktop/src/main/icon.mjs`): the window's title bar and the taskbar,
the reading window, and the tray icon. The installer gives its shortcuts and uninstall entry the same file — the installer
built before the new logo still carries the old icon; the next installer build (round R6) takes this one.

Every render here is pixel for pixel the design's own PNG of the same size (`docs/design/logo/source/流息/png/`):
`node desktop/scripts/compare-icon.mjs` prints, per size, how many pixels differ and the largest channel difference (all 0
when the icon was replaced, 2026-11-12), for the PNGs and for the .ico's entries read back. The small PNG files differ from
the design's in their bytes only by the resolution written in the pHYs chunk (the renders here are made at 8× density).

In the app itself (the sidebar's brand, 问库's avatar) the mark is drawn from `mark-black.svg`'s one path in the theme's ink,
not from these files: `desktop/src/renderer/lib/brand-mark.js`, and why in `docs/desktop.md` §4.18.

## Regenerate

```
node desktop/scripts/build-icon.mjs            # renders png/ and packs streams.ico, in place
node desktop/scripts/build-icon.mjs --check    # renders into a temporary folder and compares with the committed files
node desktop/scripts/compare-icon.mjs          # the renders against the design's PNGs, pixel by pixel (reads only)
```

To take a new version of the design: copy its `icon-512/48/32/24/16.svg` over the ones here (and the whole final folder into
`docs/design/logo/source/`, with a new `来源.md` and `source-sha256.txt`), then run the first command.

sharp (the renderer, a native module) is not a dependency of this repository: `scripts/lib/icon.mjs` `loadSharp` takes it
from the folder `STREAMS_SHARP_DIR` names, else from `installer/icon-tools` (an `npm install sharp` there; not in git). The
renders of 2026-11-12 used sharp 0.35.5 from the Yunzhi desktop checkout's `engine\node_modules` (borrowed, read only) —
the same sharp the design's own PNGs were made with. The same sources give the same bytes every run, so the committed
`streams.ico` and `png/` are exactly what the script writes; `desktop/test/icon.test.mjs` rebuilds into a temporary folder
and compares (skipped, and it says so, when sharp is nowhere to be found; a failure, not a skip, when `STREAMS_SHARP_DIR` is
set and holds no sharp).
