import { mocks } from '@/lib/mocks';

/**
 * The shared mocks of the other two layers' APIs, mounted in the site (Da12):
 *
 * - `/api/mock/capture/…` stands in for the content layer's API.
 * - `/api/mock/graph/…` stands in for the intelligence layer's API.
 *
 * `packages/mock-apis/README.md` lists their routes and what each one answers.
 * This file is the mount that README shows; the mocks themselves are made in
 * `src/lib/mocks.ts`, which also says what they remember and for how long. A
 * change to a mock goes upstream, not here.
 *
 * Browser code reaches these through `SAGAS_CAPTURE_API` and `SAGAS_GRAPH_API`
 * (`src/lib/layer-apis.ts`), never by writing these paths into a page. Server
 * code doesn't come through here at all: `callLayerApi()` calls the mock
 * directly.
 */
async function handle(request: Request, { params }: { params: Promise<{ layer: string }> }) {
  const { layer } = await params;
  if (layer === 'capture') return mocks.capture(request);
  if (layer === 'graph') return mocks.graph(request);
  return Response.json({ error: `No mock called ${layer}.` }, { status: 404 });
}

export { handle as GET, handle as POST };
