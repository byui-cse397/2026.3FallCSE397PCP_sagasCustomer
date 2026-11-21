# De13 brand design

**Status:** Draft; sponsor assets are available, but shared token adoption still
needs team review.

**Story:** De13 — Colour and type from the brand

## Design basis

`packages/brand/` is the single source for the sponsor's Sagas identity. The
landing page, reading site, and contributing app use these assets rather than
copying logo files or color values into individual apps.

The brand idea is an editor's palette: black ink, white paper, and a red pencil.
The red dots in the mark echo the dotted phrase treatment used when a reader can
open the claims behind a passage.

## Decisions

### Palette

| Token | Value | Use |
|---|---|---|
| Ink | `#141414` | Primary text and dark surfaces |
| Paper | `#FAF8F3` | Page backgrounds and light surfaces |
| Red | `#B3001B` | Links, accents, and primary emphasis on Paper |
| Red on ink | `#E0303F` | Marks and large text on Ink only |

Red remains an emphasis color. It should not become a general background, status
color, disagreement warning, score, or ranking signal.

### Logo assets

- `wordmark.svg` is for light backgrounds.
- `wordmark-on-ink.svg` is for dark backgrounds.
- `mark.svg` is for compact or square contexts.
- The favicon and app-icon files are used for browser and home-screen identity.

Use the files from `packages/brand/` directly. Do not redraw or copy them into
`apps/web` or `apps/landing`.

### Type

Use a serif for headings and the wordmark, with a plain sans serif for body
text. The wordmark currently uses Georgia-compatible text in the SVG; no web font
is added until its license is checked.

## Impact on the De designs

- **De1:** shared color, spacing, and type tokens should replace the temporary
  neutral landing tokens in one centrally imported source.
- **De7:** components use the brand tokens and logo/icon assets, while
  disagreement remains represented by content and layout rather than red status
  styling.
- **De8:** contrast, focus, text size, and touch targets must be rechecked after
  token adoption; Red on Paper is approved for normal text, while Red on Ink is
  limited to marks and large text.
- **De11:** map pins and lists may use the brand mark and palette, but the
  neighborhood-level privacy rules do not change.
- **De12:** the terms page and shared footer use the same wordmark, type, and
  palette; the terms wording remains the sponsor's document.

## Acceptance checks

- Both apps import the same token source rather than maintaining separate brand
  values.
- Logo and favicon assets come from `packages/brand/`.
- Normal text and interactive states meet WCAG 2.1 AA contrast.
- Red is reserved for emphasis and is not used to imply agreement, disagreement,
  confidence, or score.
- Keyboard focus remains visible, and older-reader touch targets remain intact.

## Open decisions

- Whether the team should adopt the sponsor palette immediately or wait for a
  formal De1 token review.
- The final shared token names and HSL/RGB representation used by Tailwind and
  the static landing build.
- Whether the map's place icons are separate illustrations or a variation of
  the brand mark; any third-party asset requires license review.
