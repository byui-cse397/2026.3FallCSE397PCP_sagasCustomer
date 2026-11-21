# De13 brand design

**Status:** Ready; sponsor assets are available, but shared token adoption still
needs team review.

**Story:** De13 — Colour and type from the brand

## Design basis

`packages/brand/README.md` is the source of truth for the sponsor's Sagas
identity, including the palette, contrast ratios, type guidance, and asset
names. The
landing page, reading site, and contributing app use these assets rather than
copying logo files or color values into individual apps.

The brand idea is an editor's palette: black ink, white paper, and a red pencil.
The red dots in the mark echo the dotted phrase treatment used when a reader can
open the claims behind a passage.

## Decisions

### Palette

The values below summarize the README for implementation planning; if this
document and the README ever differ, the README wins.

| Token | Value | Use |
|---|---|---|
| Ink | `#141414` | Primary text and dark surfaces |
| Paper | `#FAF8F3` | Page backgrounds and light surfaces |
| Red | `#B3001B` | Links, accents, and primary emphasis on Paper; 6.75:1 contrast |
| Red on ink | `#E0303F` | Marks and large text on Ink only; 4.09:1 contrast |

The reds do not swap backgrounds: `#B3001B` on Ink is 2.57:1, and `#E0303F`
on Paper is 4.24:1. Neither pairing is approved for normal text.

Red remains an emphasis color. It should not become a general background, status
color, disagreement warning, score, or ranking signal.

### Logo assets

- `wordmark.svg` is for light backgrounds.
- `wordmark-on-ink.svg` is for dark backgrounds.
- `mark.svg` is for compact or square contexts.
- The favicon and app-icon files are used for browser and home-screen identity.

Use the files from `packages/brand/` directly. Do not redraw or copy them into
`apps/web` or `apps/landing`. Since `packages/brand/` is currently an asset
folder rather than a package, the eventual app build step may copy or bundle
the selected files from that folder; the mechanism must preserve one source and
must not create hand-maintained duplicates.

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
- When the tokens land, extend the existing landing contrast tests to cover the
  brand pairs, the web app, links, and keyboard-focus states.
- Red is reserved for emphasis and is not used to imply agreement, disagreement,
  confidence, or score.
- Keyboard focus remains visible, and older-reader touch targets remain intact.

## Open decisions

- Whether the team should adopt the sponsor palette immediately or wait for a
  formal De1 token review.
- Ask Stanton in [#11](https://github.com/byui-cse397/2026.3FallCSE397PCP_sagasCustomer/issues/11)
  whether the palette, logo use, and the proposed `Sponsored by Civum, Inc.`
  credit are approved for the landing page and full app.
- The final shared token names and HSL/RGB representation used by Tailwind and
  the static landing build.
- Whether the map's place icons are separate illustrations or a variation of
  the brand mark; any third-party asset requires license review.
