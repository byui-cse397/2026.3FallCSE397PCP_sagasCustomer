import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { scoringGraph, scoringResult } from '@sagas/fixtures/scoring';

import { createGraphMock } from './graph';

const example = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../apps/graph-api/${name}`, import.meta.url), 'utf8'),
  ) as unknown;

const post = (path: string, body: unknown) =>
  createGraphMock()(
    new Request(`http://mock${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /score', () => {
  for (const name of ['corner-shop-graph.json', 'example-graph.json', 'cases-graph.json', 'cat-graph.json']) {
    it(`scores every claim in ${name}, in the contract's shape`, async () => {
      const graph = scoringGraph.parse(example(name));
      const res = await post('/score', graph);
      expect(res.status).toBe(200);
      const result = scoringResult.parse(await res.json());
      expect(result.claims.map((c) => c.claimId).sort()).toEqual(
        graph.claims.map((c) => c.id).sort(),
      );
    });
  }

  it('marks a disputed detail as contested', async () => {
    const graph = scoringGraph.parse(example('corner-shop-graph.json'));
    const result = scoringResult.parse(await (await post('/score', graph)).json());
    const disputed = graph.claims.some((c) => c.relation === 'dispute');
    const contested = result.claims.some((c) => c.details.some((d) => d.contested));
    expect(contested).toBe(disputed);
  });

  it('gives every claim and detail a score that is its terms added up', async () => {
    const graph = scoringGraph.parse(example('corner-shop-graph.json'));
    const result = scoringResult.parse(await (await post('/score', graph)).json());
    const total = (terms: { value: number }[]) => terms.reduce((s, t) => s + t.value, 0);
    for (const c of result.claims) {
      expect(c.score).toBeCloseTo(total(c.terms), 9);
      for (const d of c.details) expect(d.score).toBeCloseTo(total(d.terms), 9);
    }
  });

  it('refuses a graph that fails the contract, with a 400', async () => {
    expect((await post('/score', { siteId: 'x' })).status).toBe(400);
  });
});

describe('claims', () => {
  it('stores a valid claim, refuses a repeat, and gives it back', async () => {
    const mock = createGraphMock();
    const graph = scoringGraph.parse(example('corner-shop-graph.json'));
    const claim = graph.claims[0]!;
    const send = () =>
      mock(
        new Request('http://mock/claims', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(claim),
        }),
      );
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(409);
    expect((await mock(new Request(`http://mock/claims/${claim.id}`))).status).toBe(200);
  });

  it('refuses a claim that fails the contract, with a 400', async () => {
    expect((await post('/claims', { id: 'c1' })).status).toBe(400);
  });
});
