# De7 component design draft

**Status:** Draft; team review pending. This is a design artifact, not visitor-facing landing-page copy.

**Story:** De7 — The components the map and a narrative page need

## Design basis

The components use the De1 token direction from `apps/landing/src/tokens.css`:

- `--background` and `--foreground` for the page and primary text.
- `--muted` and `--muted-foreground` for secondary surfaces and text.
- `--border` for boundaries and `--ring` for keyboard focus.
- `--radius` for shared corner treatment.
- Existing spacing and type scale from the Tailwind preset rather than
  component-specific values.

The design must meet WCAG 2.1 AA contrast and keep the list view available for
keyboard and screen-reader users.

## Component sketches and states

### 1. Map pin

```text
  ●  ← site icon / place marker
```

- **Normal:** location marker with a non-numeric site-type icon.
- **Selected:** marker receives the shared focus ring and identifies the
  selected site in the list.
- **Loading:** marker is withheld while its site data is loading; the list
  retains a labeled loading row.
- **Disagreement:** not a pin state. Detail disagreement belongs on the site
  narrative, never as a pin score, color, or warning.

### 2. Site list item

```text
┌──────────────────────────────┐
│ site name                    │
│ place type · short location  │
└──────────────────────────────┘
```

- **Normal:** site name, place context, and the same site icon as the map.
- **Selected:** visible focus/selection treatment and map selection sync.
- **Loading:** labeled skeleton or text state that does not imply failure.
- **Long name:** wraps without truncating the identifying words.

### 3. Narrative-page header

```text
Site name
place context · record status
```

- **Normal:** site identity and place context.
- **Loading:** labeled page-loading state.
- **Long name:** wraps across lines while preserving the full name.
- **Disagreement:** no header warning or score; disagreement appears beside
  the affected detail in the narrative.

### 4. Memory with source

```text
Memory passage
— contributor · source record
```

- **Normal:** memory text, attribution, and source-record link.
- **Loading:** labeled passage-loading state.
- **Long name:** contributor and source labels wrap.
- **Disagreement:** the affected detail can open its competing readings;
  unrelated text remains unchanged.

### 5. Competing detail versions

```text
Detail
┌──────────────┐  ┌──────────────┐
│ reading one  │  │ reading two  │
│ contributor  │  │ contributor  │
└──────────────┘  └──────────────┘
```

- **Normal:** equal-prominence readings with attribution and source links.
- **Loading:** labeled detail-loading state.
- **Long name:** readings remain readable and expand vertically.
- **Disagreement:** this is the disagreement state; no winner, tally, score,
  or settled label is shown.

### 6. Record with contributor

```text
Record title or media
Brought by contributor · collection/source context
```

- **Normal:** record, contributor, and source context.
- **Loading:** labeled record-loading state.
- **Long name:** contributor and collection names wrap.
- **Disagreement:** records remain attributed; disagreement is shown on the
  affected detail rather than on the record as a whole.

## Review questions

- Are the selected states sufficient for each component, especially the map
  pin's lack of a disagreement state?
- Which site-type icons belong in the first implementation?
- Which data needed by these sketches is missing from the current read model?
- Should the selected map/list relationship use the same focus treatment on
  both sides?
