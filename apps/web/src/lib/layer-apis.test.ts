import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callLayerApi, captureApi, graphApi, MOCK_CAPTURE_API, MOCK_GRAPH_API } from './layer-apis';

beforeEach(() => {
  vi.stubEnv('SAGAS_CAPTURE_API', undefined);
  vi.stubEnv('SAGAS_GRAPH_API', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the other layers' API addresses, for browser code", () => {
  it('point at the mocks the site mounts when nobody has set them', () => {
    expect(captureApi()).toBe('/api/mock/capture');
    expect(graphApi()).toBe('/api/mock/graph');
    expect([MOCK_CAPTURE_API, MOCK_GRAPH_API]).toEqual(['/api/mock/capture', '/api/mock/graph']);
  });

  it('treat an empty setting as unset, so a blank line in a config still means the mock', () => {
    vi.stubEnv('SAGAS_CAPTURE_API', '');
    vi.stubEnv('SAGAS_GRAPH_API', '   ');

    expect(captureApi()).toBe(MOCK_CAPTURE_API);
    expect(graphApi()).toBe(MOCK_GRAPH_API);
  });

  it('use the setting when someone switches to a real API, without a trailing slash', () => {
    vi.stubEnv('SAGAS_CAPTURE_API', 'https://capture.example.org/');
    vi.stubEnv('SAGAS_GRAPH_API', 'https://graph.example.org');

    expect(captureApi()).toBe('https://capture.example.org');
    expect(graphApi()).toBe('https://graph.example.org');
  });

  it('switch one layer at a time: changing one setting leaves the other on its mock', () => {
    vi.stubEnv('SAGAS_CAPTURE_API', 'https://capture.example.org');

    expect(captureApi()).toBe('https://capture.example.org');
    expect(graphApi()).toBe(MOCK_GRAPH_API);
  });

  it("accept the mock's own address, with or without a trailing slash", () => {
    vi.stubEnv('SAGAS_CAPTURE_API', '/api/mock/capture/');
    vi.stubEnv('SAGAS_GRAPH_API', '/api/mock/graph');

    expect(captureApi()).toBe(MOCK_CAPTURE_API);
    expect(graphApi()).toBe(MOCK_GRAPH_API);
  });

  it("refuse any other address that isn't a full http(s) one, naming the setting", () => {
    for (const bad of ['/', '///', '/api/capture', 'capture.example.org', 'ftp://capture.example.org']) {
      vi.stubEnv('SAGAS_CAPTURE_API', bad);
      vi.stubEnv('SAGAS_GRAPH_API', bad);

      expect(() => captureApi()).toThrow(`SAGAS_CAPTURE_API is '${bad}'`);
      expect(() => graphApi()).toThrow(`SAGAS_GRAPH_API is '${bad}'`);
    }
  });

  it('refuse to answer in the browser, where the setting is missing and the mock would be used quietly', () => {
    vi.stubEnv('SAGAS_CAPTURE_API', 'https://capture.example.org');
    vi.stubGlobal('window', {});

    expect(() => captureApi()).toThrow(/read on the server/);
    expect(() => graphApi()).toThrow(/read on the server/);
  });
});

describe('callLayerApi, for server code', () => {
  it('reaches the mocks by default with no address of its own and no network', async () => {
    const network = vi.fn(() => Promise.reject(new Error('no network in this test')));
    vi.stubGlobal('fetch', network);

    for (const layer of ['capture', 'graph'] as const) {
      const response = await callLayerApi(layer, '/health');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, mock: true });
    }
    expect(network).not.toHaveBeenCalled();
  });

  it('keeps the query and the method on the way to the mock', async () => {
    const found = await callLayerApi('capture', '/sites?q=depot');
    const sites = (await found.json()) as { slug: string }[];
    expect(sites.map((s) => s.slug)).toEqual(['freight-depot']);

    const refused = await callLayerApi('graph', '/claims', { method: 'POST', body: 'not json' });
    expect(refused.status).toBe(400);
  });

  it('fetches the full address once the setting names a real API', async () => {
    vi.stubEnv('SAGAS_GRAPH_API', 'https://graph.example.org/');
    const network = vi.fn((_url: URL, _init?: RequestInit) => Promise.resolve(Response.json({ real: true })));
    vi.stubGlobal('fetch', network);

    const response = await callLayerApi('graph', '/claims/cl-1', { method: 'GET' });

    expect(await response.json()).toEqual({ real: true });
    expect(network).toHaveBeenCalledOnce();
    expect(String(network.mock.calls[0]?.[0])).toBe('https://graph.example.org/claims/cl-1');
  });

  it("never falls back to the mock: a real API's error comes back as it is", async () => {
    vi.stubEnv('SAGAS_CAPTURE_API', 'https://capture.example.org');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 503 })));

    const response = await callLayerApi('capture', '/health');
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('down');
  });

  it('never falls back to the mock: a call that fails throws', async () => {
    vi.stubEnv('SAGAS_CAPTURE_API', 'https://capture.example.org');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));

    await expect(callLayerApi('capture', '/health')).rejects.toThrow('fetch failed');
  });

  it('refuses the same addresses the browser-facing functions refuse, without calling anything', async () => {
    const network = vi.fn(() => Promise.resolve(Response.json({ real: true })));
    vi.stubGlobal('fetch', network);
    vi.stubEnv('SAGAS_CAPTURE_API', '/api/capture');
    vi.stubEnv('SAGAS_GRAPH_API', 'graph.example.org');

    await expect(callLayerApi('capture', '/health')).rejects.toThrow("SAGAS_CAPTURE_API is '/api/capture'");
    await expect(callLayerApi('graph', '/health')).rejects.toThrow("SAGAS_GRAPH_API is 'graph.example.org'");
    expect(network).not.toHaveBeenCalled();
  });

  it("refuses a setting of just slashes, rather than reading it as empty and using the mock", async () => {
    vi.stubEnv('SAGAS_CAPTURE_API', '/');
    vi.stubEnv('SAGAS_GRAPH_API', '///');

    await expect(callLayerApi('capture', '/health')).rejects.toThrow("SAGAS_CAPTURE_API is '/'");
    await expect(callLayerApi('graph', '/health')).rejects.toThrow("SAGAS_GRAPH_API is '///'");
  });

  it('wants a path that starts with a slash', async () => {
    await expect(callLayerApi('capture', 'health')).rejects.toThrow(/starts with a slash/);
  });
});
