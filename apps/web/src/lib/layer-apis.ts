/**
 * Where the site finds the other two layers' APIs (Da12).
 *
 * Each address is a setting:
 *
 * - `SAGAS_CAPTURE_API` is the content layer's API.
 * - `SAGAS_GRAPH_API` is the intelligence layer's API.
 *
 * Unset or empty, each one points at the mock this site mounts (`mocks.ts`),
 * so no page waits on another layer. When the sponsor merges a
 * layer's release, that layer's setting changes to its real API, and changes
 * back to the mock if the real one has a problem. A person makes that switch,
 * on purpose. Nothing here falls back to a mock when a call fails, because a
 * reader could then see invented places as if they were real ones
 * (`packages/mock-apis/README.md`).
 *
 * The settings are read on the server, so they belong to the deployment, like
 * `SAGAS_DEV_SANDBOX`. There are two ways to use them:
 *
 * - **Server code** calls `callLayerApi('capture', '/sites?q=depot')`.
 * - **Browser code** gets `captureApi()` or `graphApi()` from a server
 *   component, as a prop, and fetches `${address}/sites`. The browser doesn't
 *   have the settings, so reading them there would quietly use the mock even
 *   after the switch.
 *
 * Server code never fetches `${captureApi()}/…` itself. The default address is
 * relative (`/api/mock/capture`), which a browser resolves against the page
 * but the server has nothing to resolve it against.
 */

import type { Layer } from './mocks';
import { MOCK_CAPTURE_API, MOCK_GRAPH_API, mocks } from './mocks';

export { MOCK_CAPTURE_API, MOCK_GRAPH_API };
export type { Layer };

/** The content layer's API, for browser code: `SAGAS_CAPTURE_API`, or the mock. */
export function captureApi(): string {
  return address('SAGAS_CAPTURE_API', process.env.SAGAS_CAPTURE_API, MOCK_CAPTURE_API);
}

/** The intelligence layer's API, for browser code: `SAGAS_GRAPH_API`, or the mock. */
export function graphApi(): string {
  return address('SAGAS_GRAPH_API', process.env.SAGAS_GRAPH_API, MOCK_GRAPH_API);
}

/**
 * Calls another layer's API from server code. `path` starts with a slash and
 * can carry a query: `/sites?q=depot`.
 *
 * While the setting points at the mock, the call goes straight to the mock in
 * this process, with no network and no address of the site's own to know.
 * Otherwise it's an ordinary `fetch` to the real API. Whatever the real API
 * answers comes back as it is, and a call that fails throws. Neither one ever
 * tries the mock instead.
 */
export async function callLayerApi(layer: Layer, path: string, init?: RequestInit): Promise<Response> {
  if (!path.startsWith('/')) throw new Error(`An API path starts with a slash: '/${path}', not '${path}'.`);

  const mock = layer === 'capture' ? MOCK_CAPTURE_API : MOCK_GRAPH_API;
  const base = layer === 'capture' ? captureApi() : graphApi();

  if (base === mock) {
    // The mock only reads the path, so any origin does to make the URL whole.
    return mocks[layer](new Request(new URL(`${base}${path}`, 'http://mock.invalid'), init));
  }
  return fetch(new URL(`${base}${path}`), init);
}

/**
 * The address a setting names. It's either this site's mock or a full
 * `http(s)://` address. Anything else (another relative path, or a host with no
 * `https://`) throws, naming the setting, for browser and server code alike:
 * a browser would resolve it against the page, and the server can't resolve it
 * at all.
 */
function address(name: string, setting: string | undefined, mock: string): string {
  if ('window' in globalThis) {
    throw new Error(
      "The other layers' API addresses are read on the server. Pass the address to browser code as a prop.",
    );
  }
  // Empty or blank counts as unset, so a blank line in a config still means the
  // mock. This is checked before the slashes come off, so `/` isn't mistaken
  // for empty.
  const given = setting?.trim();
  if (!given) return mock;
  // A trailing slash would double up once a path is added.
  const chosen = given.replace(/\/+$/, '');
  if (chosen === mock) return mock;
  if (!URL.canParse(chosen) || !/^https?:$/.test(new URL(chosen).protocol)) {
    throw new Error(`${name} is '${given}'. It needs a full address, https://…, or this site's mock, ${mock}.`);
  }
  return chosen;
}
