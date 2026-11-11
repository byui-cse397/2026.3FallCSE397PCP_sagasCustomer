# De11: How the map shows neighbourhoods, and a home inside one

**Status:** Draft; team review and sponsor review pending.

**Story:** De11 — How the map shows neighbourhoods, and a home inside one

**Related stories:** M1 (map and list), M6 (neighbourhood shapes), and Da9
(neighbourhood boundaries in the read model).

## Design basis

This document is the design half of M6. It does not add boundary data, change
the shared contract, or decide who may make a home's location exact. M6 and Da9
provide the boundary geometry and the place-to-neighbourhood relationship; the
renderer applies the display rules here.

The design uses the current neutral values in `apps/landing/src/tokens.css` as
the temporary starting token set, as De7 does. The shared token names, rather
than component-specific colors, control surfaces, borders, text, focus rings,
spacing, and radius. A future token update should not change the privacy
meaning of a marker.

Coordinates remain `[longitude, latitude]`. Boundary geometry is supplied by
the read model and credited on the map itself with its source and licence.

## The central distinction

The map must distinguish a public place shown at its exact location from a home
shown only at neighbourhood level. A marker inside a shaded shape must never
make a reader believe that the marker identifies a home's exact address.

| Place kind | Map treatment | List treatment | Address treatment |
| --- | --- | --- | --- |
| Public place | Exact point marker, inside the neighbourhood shape | Place name and public-place context | May show the public address supplied by the product |
| Home shown at neighbourhood level | Stable area marker with neighbourhood label; never the home's coordinate | Home name or neutral place label plus neighbourhood name | Never show a street address, including in expanded details or accessible labels |

The home marker is deliberately an area indication, not a pin pretending to be
exact. Its display position is chosen once by the read model or display-data
owner and stays the same for every viewer and visit. The client must not add a
new random offset on each render.

## Map composition

```text
┌─────────────────────────────────────────────────────────────┐
│ Places near you                         [search later]       │
│                                                             │
│  · · · · · · · · ·  Oak neighbourhood  · · · · · · · · ·   │
│  ·       ○  home — Oak neighbourhood                       │
│  ·                     ● Corner shop                       │
│  ·              ● Freight depot                            │
│  · · · · · · · · · · · · · · · · · · · · · · · · · · · ·   │
│                                                             │
│  ● Public place   ○ Neighbourhood-level place               │
│  Boundary source: City open data · Licence: CC BY 4.0       │
└─────────────────────────────────────────────────────────────┘
```

- Neighbourhoods use a quiet filled surface and boundary outline from the
  shared tokens. The shape is context, not a score or a warning.
- Public-place markers use a filled site marker and a text label when selected.
- Home markers use a visibly different area symbol and the words
  “neighbourhood-level place” in the legend or equivalent accessible text.
  Color alone never carries this distinction.
- The map keeps the boundary source and licence visible within the map region.
  They are not hidden only in a footer or a hover tooltip.
- Overlapping markers may cluster, but a cluster must not reveal a protected
  home's count, location, or address. Selecting a cluster opens the matching
  list rather than zooming toward a home's precise location.

## Public place state

```text
Normal public place                         Selected public place

      ●                                      ┌──────────────────────┐
  Corner shop                               │ Corner shop           │
  exact public place                        │ Public place          │
                                             │ Main Street           │
                                             └──────────────────────┘
        └─ inside Oak neighbourhood
```

- The exact marker is used only when the place is permitted to be shown at its
  exact location.
- The selected state synchronizes with the list entry and the site-page link.
- The list may include the public address, but it must not imply that every
  marker has the same precision or privacy treatment.

## Home shown at neighbourhood level

```text
Map view                                      List view

  Oak neighbourhood                           Places in Oak neighbourhood
  · · · · · · · · · · · ·                      ┌─────────────────────────┐
  ·      ◇  Oak neighbourhood                 │ ◇ Family home            │
  ·                                           │   Oak neighbourhood       │
  ·        ● Corner shop                      │   Location shown by area  │
  · · · · · · · · · · · ·                      └─────────────────────────┘

  ◇ Location shown by neighbourhood
  No street address is displayed.
```

- The home marker is an area symbol, not the normal public-place pin.
- The list names the neighbourhood and says that the location is shown by
  area. It never shows a street address.
- The same display position is used on every view. The position may be a
  deliberately chosen neighbourhood anchor, but the design must not expose the
  home's source coordinate through the marker, URL, tooltip, accessible name,
  distance, or automatic map centering.
- A selected home opens the site's page or details without zooming to a more
  precise coordinate.
- The home marker can coexist with public-place markers in the same shape; the
  legend and list text explain the difference.

## Loading, empty, and unavailable states

```text
Loading boundaries                         No boundaries available

┌──────────────────────────┐               ┌──────────────────────────┐
│ Loading neighbourhoods…  │               │ Neighbourhood boundaries │
│ Places remain in the list│               │ are not available yet.   │
└──────────────────────────┘               │ Places remain available  │
                                           │ in the list.              │
                                           └──────────────────────────┘

No places in this area

┌─────────────────────────────────────────┐
│ No places in this area yet.              │
│ Try another area or browse the list.     │
└─────────────────────────────────────────┘
```

- A boundary that is loading or unavailable must not make the places appear
  missing or unsafe. The list remains usable, as required by M1.
- An empty map area is not an error and does not imply that a neighbourhood has
  no history anywhere else.
- If a home has no usable neighbourhood assignment, do not fall back to its
  exact coordinate. Show a privacy-preserving unavailable-location state and
  keep the site reachable through the list if the product permits it.

## Long names and small screens

```text
┌───────────────────────────┐
│ The North Main Street     │
│ Community neighbourhood   │
│ 3 places · boundary shown │
└───────────────────────────┘

┌───────────────────────────┐
│ ◇ Family home             │
│ The North Main Street     │
│ Community neighbourhood   │
│ Location shown by area    │
└───────────────────────────┘
```

- Names wrap rather than truncate identifying words.
- The list remains available beside the map or through an immediate toggle on
  a phone; it is not a hidden fallback.
- Map controls, marker selection, list selection, and source/licence details
  have keyboard access and visible focus.
- The public-place/home distinction is communicated by symbol and text as well
  as color, with WCAG 2.1 AA contrast.

## Interaction rules

1. Selecting a public-place marker selects the matching list item and exposes
   its public-place label.
2. Selecting a neighbourhood shape highlights the shape and filters or groups
   the list without changing any site's privacy level.
3. Selecting a home marker keeps the map at neighbourhood level and never
   reveals a more precise coordinate.
4. Keyboard and screen-reader users can reach the same places through the list,
   including when Mapbox is unavailable.
5. A boundary source or licence link can receive focus and remains readable at
   phone widths.

## Data and implementation dependencies

De11 needs the following from M6 and Da9:

- boundary geometry with a source and licence attribution;
- a stable neighbourhood identifier and display name;
- the neighbourhood containing each fixture site's coordinates;
- an explicit privacy/place-kind value distinguishing a public place from a
  home shown at neighbourhood level;
- a stable display location or server-side rule for protected homes.

The current contract does not yet mark a place as a home. Until that exists,
the design must not infer home status from a name, address, or fixture content.
M6 and Da9 should raise the missing contract or read-model field in the
questions issue rather than inventing a client-side convention.

Boundary data is not included in this story. The source, licence, update
cadence, and whether it may be stored must be confirmed before M6 adds it to
the read model.

## Done-when checklist

| De11 requirement | Design coverage | Status |
| --- | --- | --- |
| Show neighbourhood shapes on the map | Map composition and loading/unavailable sketches | Draft; team review |
| Show how a place sits inside a shape | Public-place marker and selected-place sketches | Draft; team review |
| Credit boundary source and licence on the map | Visible attribution line in the map sketch and interaction rules | Draft; sponsor/team review |
| Distinguish a neighbourhood-level home from an exact public place | Comparison table, legend, home map/list sketches, and privacy rules | Draft; sponsor review required |
| Keep protected homes stable and non-identifying | Stable server/display-data position; no address, precision, distance, or zoom leakage | Draft; M6/Da9 dependency |
| Keep map and list consistent on phones and without Mapbox | Loading, empty, long-name, keyboard, and list rules | Draft; team review |

## Questions for review

- Does the proposed home marker communicate “area shown” without suggesting an
  exact point?
- Who provides the stable neighbourhood anchor, and how is it protected from
  becoming an address-recovery signal?
- What field or contract change identifies a home without inferring it from
  names or addresses?
- Which boundary dataset, source wording, and licence may appear on the map?
- Should selecting a neighbourhood filter the list, zoom the map, or do both?
- What should the list say when a boundary is unavailable but a site's privacy
  classification is known?
- Can the sponsor review and approve the protected-home treatment before M6
  receives boundary data?
