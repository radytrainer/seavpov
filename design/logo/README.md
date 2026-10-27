# សៀវភៅ PN — logo

The logo combines the Passerelles Numériques visual language (black circle, heavy slanted
white letters with a grey offset shadow, slanted cyan bar) with the Khmer word **សៀវភៅ**
("book"). Two grey lines under the bar suggest the pages of a closed book.

## Files

| File                                            | Use                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/web/public/brand/logo.svg`                | Full logo (PN + សៀវភៅ). Use at 64 px and larger.                        |
| `apps/web/public/brand/logo-mark.svg`           | Simplified mark without the Khmer word, for 16–48 px (favicon, header). |
| `apps/web/public/brand/logo-{1024,512,192}.png` | Full logo, transparent background (documents, social, app stores).      |
| `apps/web/public/brand/logo-mark-{180,32}.png`  | Mark as PNG (Apple touch icon, legacy favicon).                         |
| `apps/web/src/app/icon.svg`, `apple-icon.png`   | Picked up automatically by Next.js as favicon / touch icon.             |

All text is converted to vector outlines, so the logo looks the same everywhere without fonts.

## Colours

| Role                | Hex                  |
| ------------------- | -------------------- |
| Circle              | `#141414`            |
| Letters, Khmer text | `#FFFFFF`            |
| Bar (PN cyan)       | `#29B5E8`            |
| Shadow              | `#6E6E6E`            |
| Page lines          | `#B9BDC1`, `#8A8F94` |

## Usage

- Keep clear space around the circle of at least ¼ of its diameter.
- Minimum size: full logo 64 px; below that use the mark.
- Do not recolour, stretch, rotate further, add effects, or place the circle on busy images.
- On dark backgrounds the black circle can sit directly on the background; on light
  backgrounds use it as is (no extra outline needed).

## Regenerating

`generate-logo.cjs` shapes the text with HarfBuzz (correct Khmer vowel order) and writes
`logo.svg` and `logo-mark.svg`:

```bash
mkdir -p fonts && npm i harfbuzzjs@0.4
curl -L -o fonts/Anton.ttf https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf
curl -L -o fonts/NotoSansKhmer.ttf "https://github.com/google/fonts/raw/main/ofl/notosanskhmer/NotoSansKhmer%5Bwdth,wght%5D.ttf"
node generate-logo.cjs ./out
```

Fonts: **Anton** and **Noto Sans Khmer** (both SIL Open Font License 1.1), used only to create
the outlines.
