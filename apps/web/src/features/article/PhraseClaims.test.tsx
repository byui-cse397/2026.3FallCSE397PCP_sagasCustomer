import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadSiteState } from '@sagas/fixtures/acceptance';
import { PhraseClaims, SelectedPhraseClaims } from './PhraseClaims';

const state = loadSiteState('corner-shop', 't3');
const composition = state.compositions[0];
if (!composition) throw new Error('corner shop t3 fixture has no composition');
const claims = new Map(state.claims.map((claim) => [claim.claim.id, claim]));

describe('PhraseClaims', () => {
  it('renders phrases as collapsed native buttons', () => {
    const html = renderToStaticMarkup(<PhraseClaims composition={composition} claims={claims} />);
    expect(html).toContain('<button');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Mr. Ferris');
  });

  it('orders claims by weight and nests extensions under their parent', () => {
    const span = composition.spans.find((candidate) => candidate.claimIds.length > 1);
    if (!span) throw new Error('fixture has no span naming multiple claims');
    const html = renderToStaticMarkup(<SelectedPhraseClaims span={span} claims={claims} />);
    const expectedIds = [...span.claimIds].sort(
      (left, right) => (claims.get(right)?.weight ?? 0) - (claims.get(left)?.weight ?? 0),
    );
    const positions = expectedIds.map((id) => {
      expect(html.split(`data-claim-id="${id}"`).length - 1).toBe(1);
      return html.indexOf(`data-claim-id="${id}"`);
    });
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    const parent = state.claims.find((claim) => claim.extensions.includes('cl-cs-uncle'));
    if (!parent) throw new Error('fixture has no parent for cl-cs-uncle');
    expect(html.indexOf(`data-claim-id="${parent.claim.id}"`)).toBeLessThan(
      html.indexOf('data-claim-id="cl-cs-uncle"'),
    );
    expect(html).toContain('border-l-2');
  });

  it('shows a named extension even when its parent is not named by the span', () => {
    const span = composition.spans.find((candidate) =>
      candidate.claimIds.some((id) =>
        state.claims.some(
          (claim) => claim.extensions.includes(id) && !candidate.claimIds.includes(claim.claim.id),
        ),
      ),
    );
    if (!span) throw new Error('fixture has no span naming an extension alone');
    const html = renderToStaticMarkup(<SelectedPhraseClaims span={span} claims={claims} />);
    for (const id of span.claimIds) expect(html).toContain(`data-claim-id="${id}"`);
  });
});
