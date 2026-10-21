# packages/read-model — the experience layer's data access

Every read the experience layer does goes through here, and only two things
import it: `apps/web` calls it directly from server components, and
`apps/ui-api` exposes it over HTTP for the browser.

One home for data access means one place to change when the database arrives,
and no chance of the page and the API disagreeing about what a site is.

## What it is today

Two functions, `listSites` and `getSiteState`, read the experience read model
from Postgres. Start the local database from `apps/ui-api`, then seed it with
`pnpm --filter @sagas/ui-api db:seed`. The public functions keep their existing
synchronous signatures: rows are loaded once when this package is initialised,
so the web server and API callers do not change.

## What it becomes

A read model: your own schema, shaped for the two things this layer actually
does, which are drawing a map and rendering an article. That is not the same
shape as the authoritative store the intelligence layer keeps, and it should not
try to be.

Putting Postgres behind these functions is the first infrastructure job on this
layer. Nothing that calls them changes when you do, which is the entire reason
they are here rather than scattered through components.

### Data-model note for Da1

The first local schema is deliberately a read-model snapshot: one row per site
and fixture state, with the contract-shaped `site` and `graph_state` values in
JSONB.

Stored in the local read model:

- the site slug and fixture state id;
- the fixture's site position for stable map/list ordering;
- the map-facing site object; and
- the graph state needed to render the article.

Selected per request/module load:

- which state is requested (`t0`–`t3`);
- which site rows belong in `listSites()`; and
- which graph-state row matches the requested site slug.

This Da1 proposal uses snapshots rather than events. The experience database is
a projection for reads, so snapshots keep map/article queries simple and let the
read model be rebuilt from authoritative data later. It must not become a second
authoritative history.

Weight should remain on the calculated details/graph state supplied by the
Intelligence layer, not be recomputed by this package. The read model stores the
calculated graph state as received and only selects the requested snapshot; it
does not introduce a scoring algorithm.

Do it early. If the whole interface is built against a file and the database
arrives in November, November is when you find out which components assumed data
was free to fetch.

## Things that will bite

**Coordinate order.** `[longitude, latitude]`, which is GeoJSON's order and the
reverse of how everyone says it out loud. Getting Boise's pair backwards gives a
latitude of -116, which Mapbox rejects, but the error appears at the map rather
than where the pair was swapped. See `docs/GIS.md`.

**The bounding box.** `listSites()` returns every place in the fixtures, which
is a handful. With real data the map has to fetch what is on screen rather than
the whole country, and that filter is the argument this still does not take.

**Query count.** `getSiteState()` becomes a join across places, records, claims
and contributions, then a scoring pass. The obvious implementation runs one query
per claim and falls over at any real size.

## Who owns this

The experience layer, specifically whoever holds the back end and database roles
on that team. The intelligence layer owns a different database, and
`apps/graph-api/README.md` explains the split.
