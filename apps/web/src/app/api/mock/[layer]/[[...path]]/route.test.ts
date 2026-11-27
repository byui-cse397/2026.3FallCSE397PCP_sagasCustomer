import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureApi, graphApi } from '@/lib/layer-apis';

import { GET, POST } from './route';

// Calls the route the way Next.js does: the request, plus the `[layer]` part of its path.
function call(address: string, init?: RequestInit): Promise<Response> {
  const url = new URL(address, 'http://localhost:3000');
  const layer = url.pathname.split('/')[3] ?? '';
  const handler = init?.method === 'POST' ? POST : GET;
  return handler(new Request(url, init), { params: Promise.resolve({ layer }) });
}

beforeEach(() => {
  vi.stubEnv('SAGAS_CAPTURE_API', undefined);
  vi.stubEnv('SAGAS_GRAPH_API', undefined);
  return () => vi.unstubAllEnvs();
});

describe('/api/mock', () => {
  it("is where the site's addresses lead by default: both mocks answer there", async () => {
    for (const api of [captureApi(), graphApi()]) {
      const response = await call(`${api}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, mock: true });
    }
  });

  it("serves the content layer's mock, starting with the fixture places and never their addresses", async () => {
    const response = await call('/api/mock/capture/sites');
    expect(response.status).toBe(200);

    const sites = (await response.json()) as Record<string, unknown>[];
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) expect(site).not.toHaveProperty('address');
  });

  it("serves the intelligence layer's mock, which starts empty", async () => {
    const response = await call('/api/mock/graph/claims/no-such-claim');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No claim no-such-claim.' });
  });

  it('passes POST through to the mocks', async () => {
    const response = await call('/api/mock/graph/claims', { method: 'POST', body: 'not json' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'The body has to be JSON.' });
  });

  it('answers 404 for a layer that has no mock', async () => {
    const response = await call('/api/mock/content/sites');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No mock called content.' });
  });
});
