import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { site } from '@sagas/contracts';
import { runCaptureRules } from '@sagas/fixtures/capture/rules';

import { createCaptureMock } from './capture';
import { listen } from './serve';

// The same rules the real content layer's API has to pass, over HTTP.
const port = 39301;
const base = `http://localhost:${port}`;
let server: Server;
beforeAll(async () => {
  server = await listen(createCaptureMock(), port);
});
afterAll(() => {
  server.close();
});

runCaptureRules('capture mock', base);

const call = (path: string, init?: RequestInit) =>
  createCaptureMock()(new Request(`http://mock${path}`, init));

const postJson = (path: string, body: unknown) =>
  call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the sites routes (C13)', () => {
  it('starts with every fixture place, each in the contract shape apart from the address', async () => {
    const res = await call('/sites');
    expect(res.status).toBe(200);
    const sites = (await res.json()) as Record<string, unknown>[];
    expect(sites.length).toBeGreaterThan(1);
    for (const s of sites) {
      expect(site.omit({ address: true }).strict().safeParse(s).success).toBe(true);
      expect(s).not.toHaveProperty('address');
    }
  });

  it('finds a place by another name, ignoring case', async () => {
    const res = await call('/sites?q=FERRIS');
    const found = (await res.json()) as { id: string }[];
    expect(found.map((s) => s.id)).toContain('site-corner-shop');
  });

  it('never matches on an address', async () => {
    // The corner shop's address is "N 4th St and W Main St"; nothing in its names says Main.
    const res = await call('/sites?q=main st');
    const found = (await res.json()) as { id: string }[];
    expect(found.map((s) => s.id)).not.toContain('site-corner-shop');
  });

  it('makes an id and a unique slug for a new place, and gives it back by id', async () => {
    const mock = createCaptureMock();
    const place = {
      name: 'The corner shop',
      aka: [],
      coordinates: [-116.2, 43.6],
      address: 'somewhere',
      city: 'Boise, Idaho',
      coordinatePrecision: 'approximate',
    };
    const created = (await (
      await mock(
        new Request('http://mock/sites', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(place),
        }),
      )
    ).json()) as { id: string; slug: string };
    expect(created.slug).toBe('the-corner-shop');
    expect(created).not.toHaveProperty('address');
    const fetched = await mock(new Request(`http://mock/sites/${created.id}`));
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).not.toHaveProperty('address');
  });

  it('refuses a place that fails the contract, with a 400', async () => {
    expect((await postJson('/sites', { name: 'No coordinates' })).status).toBe(400);
  });

  it('answers 404 for a place that does not exist', async () => {
    expect((await call('/sites/nowhere')).status).toBe(404);
  });
});

describe('transcripts of a recording (C3)', () => {
  it('lists every transcript of a recording, and 404s for an unknown one', async () => {
    const mock = createCaptureMock();
    const post = (body: unknown) =>
      mock(
        new Request('http://mock/records', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    const record = {
      siteId: 'site-corner-shop',
      contributorId: 'guest-abc',
      text: 'A recording, standing in.',
      submission: 'submitted',
      choices: {
        rightToShare: true,
        studentAccess: false,
        public: 'later',
        location: 'remove',
        mentionsPeople: 'not_sure',
      },
      termsVersion: 'provisional-0.1',
      createdAt: new Date().toISOString(),
    };
    const { id } = (await (await post(record)).json()) as { id: string };
    await post({ ...record, text: 'One stretch of it.', parent: { role: 'transcript', recordId: id } });
    await post({ ...record, text: 'The same stretch, by someone else.', parent: { role: 'transcript', recordId: id } });
    const res = await mock(new Request(`http://mock/records/${id}/transcripts`));
    expect(((await res.json()) as unknown[]).length).toBe(2);
    expect((await mock(new Request('http://mock/records/nothing/transcripts'))).status).toBe(404);
  });
});

describe('mounting', () => {
  it('answers under a base path, the way the site mounts it', async () => {
    const mock = createCaptureMock({ basePath: '/api/mock/capture' });
    const res = await mock(new Request('http://site/api/mock/capture/health'));
    expect(await res.json()).toEqual({ ok: true, mock: true });
  });
});
