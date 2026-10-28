import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadSiteState } from '@sagas/fixtures/acceptance';
import { PhraseClaims, SelectedPhraseClaims } from './PhraseClaims';

/**
 * Test case documentation
 * Prefix: ID N2-UNIT-01
 * Description/Summary: A passage phrase opens the claims named by its span in weight order.
 * Pre-requisites: Corner shop t3 fixture with a composition and claim weights.
 * Category/component: MVC — View / PhraseClaims
 * Author: Canon Heise
 * Requirement/Story: N2 — Selecting a phrase shows its claims ordered by weight.
 * Test Steps: Some Action followed by Results, until you Verify the requirement.
 * Action: Render the section's phrase control and activate it in the rendered component.
 * Results: The control names the phrase and carries expanded-state semantics; claims are ordered by descending weight.
 * Verify: Confirm the claim text order matches the fixture weights.
 */
describe('PhraseClaims', () => {
  const state = loadSiteState('corner-shop', 't3');
  const composition = state.compositions[0];
  const claims = new Map(state.claims.map((claim) => [claim.claim.id, claim]));

  it('exposes span phrases as keyboard-operable buttons and orders their claims by weight', () => {
    const span = composition.spans.find((candidate) => candidate.claimIds.length > 1)!;
    const ordered = span.claimIds
      .map((id) => claims.get(id)!)
      .sort((a, b) => b.weight - a.weight);
    const html = renderToStaticMarkup(<PhraseClaims composition={composition} claims={claims} />);
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(composition.text.slice(span.start, span.end));
    const selectedHtml = renderToStaticMarkup(
      <SelectedPhraseClaims span={span} claims={claims} />,
    );
    let previous = -1;
    for (const claim of ordered) {
      const position = selectedHtml.indexOf(`data-claim-id="${claim.claim.id}"`);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it('renders detail wording with semantic mark highlighting', () => {
    const span = composition.spans.find((candidate) => candidate.detailIds?.length);
    expect(span).toBeDefined();
    const claim = claims.get(span!.claimIds[0])!;
    const detail = claim.claim.details.find((candidate) => span!.detailIds!.includes(candidate.id));
    expect(detail).toBeDefined();
    const html = renderToStaticMarkup(
      <SelectedPhraseClaims span={span!} claims={claims} />,
    );
    expect(html).toContain(`<mark>${detail!.excerpt}</mark>`);
  });

  it('renders extensions directly under the parent claim', () => {
    const parent = state.claims.find((claim) => claim.extensions.length > 0);
    expect(parent).toBeDefined();
    const span = { start: 0, end: 1, claimIds: [parent!.claim.id] };
    const html = renderToStaticMarkup(<SelectedPhraseClaims span={span} claims={claims} />);
    const parentPosition = html.indexOf(`data-claim-id="${parent!.claim.id}"`);
    const extension = claims.get(parent!.extensions[0])!;
    const extensionPosition = html.indexOf(`data-claim-id="${extension.claim.id}"`);
    expect(parentPosition).toBeGreaterThanOrEqual(0);
    expect(extensionPosition).toBeGreaterThan(parentPosition);
    expect(html).toContain('border-l-2');
  });
});
