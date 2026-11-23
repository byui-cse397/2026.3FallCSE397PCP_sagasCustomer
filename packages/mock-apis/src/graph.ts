/**
 * A stand-in for the intelligence layer's API (`apps/graph-api`), for anyone who needs it before
 * the real one is released, or when it's down.
 *
 * `POST /score` is the route `apps/graph-api/src/index.ts` already has: send a place's graph, get a
 * score for every claim and detail back, in the contract's shape. The numbers come from
 * `standInGraphScore` below and mean nothing. Don't copy the arithmetic or build on a value.
 *
 * `POST /claims` and `GET /claims/:id` are this mock's own names for S10 ("an endpoint takes a new
 * claim"), which doesn't name its route. The real API may choose differently, and its
 * `ENDPOINTS.md` says so.
 *
 * Claims you send live in memory and disappear when it restarts. That's on purpose.
 */
import { contests, isExcerpt, sameExcerpt } from '@sagas/contracts';
import type { ClaimScore, DetailScore, ScoreTerm, TargetDetail } from '@sagas/contracts';
import { claimNode, detailsOf, repliesTo, scoringGraph } from '@sagas/fixtures/scoring';
import type { ClaimNode, ScoringGraph, ScoringResult } from '@sagas/fixtures/scoring';

import { json, readJson, Router } from './http';
import type { Handler } from './http';

export interface GraphMockOptions {
  /** Where the mock is mounted, for example `/api/mock/graph`. */
  basePath?: string;
}

export function createGraphMock(options: GraphMockOptions = {}): Handler {
  const claims = new Map<string, ClaimNode>();

  return new Router(options.basePath)
    .on('GET', '/health', () => json(200, { ok: true, mock: true }))

    .on('POST', '/score', async (request) => {
      const read = await readJson(request);
      if (!read.ok) return read.response;
      const parsed = scoringGraph.safeParse(read.body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      return json(200, standInGraphScore(parsed.data));
    })

    .on('POST', '/claims', async (request) => {
      const read = await readJson(request);
      if (!read.ok) return read.response;
      const parsed = claimNode.safeParse(read.body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      if (claims.has(parsed.data.id)) {
        return json(409, { error: `A claim with id ${parsed.data.id} already exists.` });
      }
      claims.set(parsed.data.id, parsed.data);
      return json(201, parsed.data);
    })

    .on('GET', '/claims/:id', (_request, { id }) => {
      const claim = claims.get(id ?? '');
      return claim ? json(200, claim) : json(404, { error: `No claim ${id}.` });
    })

    .handler();
}

const t = (family: ScoreTerm['family'], name: string, value: number): ScoreTerm => ({
  family,
  name,
  value,
});

// A score is its terms added up (contract 2.7.2), with no floor.
const sum = (terms: ScoreTerm[]) => terms.reduce((s, x) => s + x.value, 0);

/**
 * An invented score for every claim and detail in a graph, in the shape a real scorer returns.
 *
 * It mirrors the fixtures' own stand-in (`packages/fixtures/src/stand-in-score.ts`) and keeps the
 * model's rules: weight comes from evidence and independent support, "sounds right" adds almost
 * nothing, and nothing depends on language or on where anyone lives. It finds no matches.
 */
export function standInGraphScore(graph: ScoringGraph): ScoringResult {
  const records = new Map(graph.records.map((r) => [r.id, r]));
  const evidenceOf = (claimId: string) =>
    graph.claims.find((c) => c.id === claimId)?.evidence.map((e) => e.recordId) ?? [];

  const scores: ClaimScore[] = graph.claims.map((claim) => {
    const replies = repliesTo(graph, claim.id);
    const extensions = replies.filter((r) => r.relation === 'extension');
    const disputes = replies.filter((r) => r.relation === 'dispute');
    const independent = new Set(
      claim.evidence
        .map((e) => records.get(e.recordId)?.contributorId)
        .filter((who): who is string => who !== undefined && who !== claim.contributorId),
    );
    const soundsRight = graph.passovers.filter(
      (p) => p.claimId === claim.id && p.kind === 'sounds_right',
    ).length;

    const terms: ScoreTerm[] = [
      t('content', 'base', 1),
      t('content', 'evidence attached', 0.5 * claim.evidence.length),
      t('content', 'independent support', 2 * independent.size),
      t('behavior', 'sounds right', 0.05 * Math.min(soundsRight, 6)),
      t('content', 'extensions', 0.75 * Math.min(extensions.length, 4)),
      t('content', 'disputes', -0.5 * disputes.length),
    ];

    const details: DetailScore[] = detailsOf(graph, claim.id).map((d) => {
      const extending = extensions.filter((e) =>
        (e.target.details as TargetDetail[]).some(
          (x) => isExcerpt(x.at) && sameExcerpt(x.at, d.excerpt),
        ),
      );
      const disputing = disputes.filter((e) => contests(e, d.excerpt));
      const dTerms: ScoreTerm[] = [
        t('content', 'base', 1),
        t('content', 'extensions', 0.75 * extending.length),
        t('content', 'disputes', -0.5 * disputing.length),
      ];
      const claimIds = [...disputing, ...extending].map((e) => e.id);
      return {
        detailId: d.id,
        excerpt: d.excerpt,
        score: sum(dTerms),
        terms: dTerms,
        contested: disputing.length > 0,
        claimIds,
        evidenceRecordIds: [...new Set(claimIds.flatMap(evidenceOf))],
      };
    });

    return { claimId: claim.id, score: sum(terms), terms, details };
  });

  return { claims: scores, matches: [] };
}
