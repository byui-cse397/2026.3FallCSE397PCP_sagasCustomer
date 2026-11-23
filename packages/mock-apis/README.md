# packages/mock-apis

Stand-ins for the content layer's API and the intelligence layer's API, so the reading site can
work before either layer releases its API, and keep working if one of them is down.

Each mock is a plain function from a web `Request` to a `Response`. The same code runs inside a
Next.js route handler, on Cloudflare Workers, and on its own with Node.

## What's in it

The story ids below come from the other two layers' backlogs: C numbers are in
`apps/capture-api/BACKLOG.md`, and S numbers are in `apps/graph-api/BACKLOG.md`.

**The content layer's API** (`@sagas/mock-apis/capture`), on the routes upstream already names:

| Route | What it does |
| --- | --- |
| `POST /records` | Takes a record without an id, gives it a UUID, answers 201. Answers 400 if its parent record doesn't exist |
| `GET /records/:id` | One record, or 404 |
| `GET /records/:id/transcripts` | Every transcript of a recording (C3) |
| `POST /sites` | Takes a place without an id or slug, makes both (C13) |
| `GET /sites?q=…` | Places whose name or other names contain the text. Never matches an address |
| `GET /sites/:id` | One place, or 404 |

None of the sites routes return an address. "Addresses stay private" below says why.

It passes the same rules the real API has to pass: `src/capture.test.ts` runs
`@sagas/fixtures/capture/rules` against it over HTTP.

**The intelligence layer's API** (`@sagas/mock-apis/graph`):

| Route | What it does |
| --- | --- |
| `POST /score` | Takes a place's graph, returns a score for every claim and detail |
| `POST /claims` | Takes a claim, checks it against `claimNode`, answers 201. Answers 409 if a claim with that id already exists |
| `GET /claims/:id` | One claim, or 404 |

The mock makes up its scores, and they mean nothing, the same as the fixtures' own stand-in. Build on the
shape, never on a value. `POST /claims` is this mock's own name, because S10 doesn't name its
route. The real API's `ENDPOINTS.md` says which name it uses.

The content layer's mock starts with the fixture places and records. The intelligence layer's starts
empty. Both keep whatever you send them in memory, so it disappears when they restart. Nothing they
make up ever reaches a database.

## Using it in the reading site

Mount both mocks on one route handler. Add `@sagas/mock-apis` to `apps/web`'s dependencies
(`workspace:*`) and to `transpilePackages` in `apps/web/next.config.mjs`, then create
`src/app/api/mock/[layer]/[[...path]]/route.ts`:

```ts
import { createCaptureMock, createGraphMock } from '@sagas/mock-apis';

const capture = createCaptureMock({ basePath: '/api/mock/capture' });
const graph = createGraphMock({ basePath: '/api/mock/graph' });

async function handle(request: Request, { params }: { params: Promise<{ layer: string }> }) {
  const { layer } = await params;
  if (layer === 'capture') return capture(request);
  if (layer === 'graph') return graph(request);
  return Response.json({ error: `No mock called ${layer}.` }, { status: 404 });
}

export { handle as GET, handle as POST };
```

Then read each API's address from a setting, and point it at the mock until that layer's release is
merged:

```
SAGAS_CAPTURE_API=/api/mock/capture
SAGAS_GRAPH_API=/api/mock/graph
```

These names are new on purpose. `CAPTURE_API_URL` already means the real content API's address in
that layer's own tests.

Moving to the real API means changing the address. If the real one has a problem, change it back.
The experience layer switches it on purpose. Don't fall back automatically when a call fails, because then a reader could
see invented places as if they were real ones, without anyone noticing.

## Using it on its own

Any team can run either mock on its own, on the same port as the real API: 3001 for the content
layer's, 3002 for the intelligence layer's.

```bash
pnpm --filter @sagas/mock-apis serve:capture
```

```bash
pnpm --filter @sagas/mock-apis serve:graph
```

`PORT` changes the port.

## What's deliberately missing

- Upload links. They come with the storage work.
- The request queues (C7, C8) and transcript coverage (C4).
- Matches between claims. `POST /score` always returns an empty list.
- Anything persistent. That's the point of a mock.

## Addresses stay private

The sites routes never return a place's `address`. The mock still keeps it. The site never shows a
place's address (M8, in the experience layer's backlog), and an API anyone can call shows whatever it
returns. That makes the mock differ from the contract's `site` and from C13, which both include
`address`, until a later contract version changes how Sagas shares a place's location.
