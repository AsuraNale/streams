# 流息 app icon (desktop/assets/icon)

2026-11-02, a first mark made in the shell round (under the fifteen minutes the plan allows; a design round may replace
it): three white waves — a stream — on a river-blue tile (`#1F6E8C`, the product's identity colour, `--st-sidebar` /
`--st-accent` in `desktop/src/renderer/styles/tokens.css`), the lower two waves at 72% and 44% so the mark reads as
depth, the tile's corners rounded (rx 112 of 512). Nothing here is a stock image or a font glyph.

## Files

| File | What it is |
|---|---|
| `icon-512.svg` | The mark on the tile, 512 x 512. The source of every size today: brought down with lanczos3 to 256, 48, 32, 24 and 16 (rendered at 2× density first for the small ones). Hand-placed whole-pixel forms for the small sizes (`icon-48.svg` … `icon-16.svg`, as the earlier shell had) are a later round: when one of those files exists, `scripts/lib/icon.mjs` renders it 1:1 instead. |
| `png/icon-{16,24,32,48,256}.png` | The renders the .ico packs (written by the script below). |
| `streams.ico` | The Windows icon: 16, 24, 32, 48 as 32-bpp DIBs with alpha, 256 as a PNG entry. The one file the app (`desktop/src/main/icon.mjs`) and the installer read. |

## Regenerate

```
node desktop/scripts/build-icon.mjs            # renders png/ and packs streams.ico, in place
node desktop/scripts/build-icon.mjs --check    # renders into a temporary folder and compares with the committed files
```

sharp (the renderer, a native module) is not a dependency of this repository: `scripts/lib/icon.mjs` `loadSharp` takes
it from the folder `STREAMS_SHARP_DIR` names, else from `installer/icon-tools` (an `npm install sharp` there; not in
git). The first render used a sharp 0.35.5 already on the build machine. The same sources give the same bytes every
run, so the committed `streams.ico` and `png/` are exactly what the script writes; `desktop/test/icon.test.mjs` rebuilds
into a temporary folder and compares (skipped, and it says so, when sharp is nowhere to be found).
