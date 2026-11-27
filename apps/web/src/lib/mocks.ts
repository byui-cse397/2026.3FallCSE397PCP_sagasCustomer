import { createCaptureMock, createGraphMock } from '@sagas/mock-apis';

/**
 * The shared mocks of the other two layers' APIs (`packages/mock-apis`), as
 * this site runs them (Da12). The route in
 * `src/app/api/mock/[layer]/[[...path]]/route.ts` serves them to the browser,
 * and `callLayerApi()` in `layer-apis.ts` calls them directly from server code.
 *
 * Each mock keeps what it's sent in memory, and nothing promises that memory is
 * shared. Next.js gives pages and route handlers their own copies of this
 * module, so a place POSTed through the route isn't there for a page reading
 * through `callLayerApi()`, and the reverse (checked under `next start` and in
 * a local Worker, 25 November 2026). A restart, or another running copy of the
 * Worker, starts fresh as well. Every copy starts with the same fixture places
 * and records, so build on those, and treat a write's own response as the only
 * answer it gets. Nothing a mock makes up reaches a database.
 */

export type Layer = 'capture' | 'graph';

/** Where the site mounts each mock, and so the address each setting has by default. */
export const MOCK_CAPTURE_API = '/api/mock/capture';
export const MOCK_GRAPH_API = '/api/mock/graph';

export const mocks = {
  capture: createCaptureMock({ basePath: MOCK_CAPTURE_API }),
  graph: createGraphMock({ basePath: MOCK_GRAPH_API }),
};
