import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GraphState } from '@sagas/contracts';
import { loadSiteState } from '@sagas/fixtures/acceptance';
import { ArticleView } from './ArticleView';

function renderArticle(stateId: 't0' | 't1' | 't2' | 't3', records?: GraphState['records']) {
  const state = loadSiteState('corner-shop', stateId);
  return renderToStaticMarkup(
    <ArticleView state={records ? { ...state, records } : state} />,
  );
}

describe('ArticleView', () => {
  it('renders sections in state order with their headings and passages', () => {
    const page = renderArticle('t3');
    const readablePage = page.replace(/<[^>]*>/g, '');
    const shopHeading = readablePage.indexOf('The shop on the corner');
    const shopPassage = readablePage.indexOf('The shop stood on the corner');
    const signHeading = readablePage.indexOf('The sign');
    const signPassage = readablePage.indexOf('A sign reading FERRIS GROCERY');

    expect(shopHeading).toBeGreaterThanOrEqual(0);
    expect(shopPassage).toBeGreaterThan(shopHeading);
    expect(signHeading).toBeGreaterThan(shopPassage);
    expect(signPassage).toBeGreaterThan(signHeading);
  });

  it('shows both disputed date readings with attribution and the supplied reasoning', () => {
    const page = renderArticle('t2');

    // Contract 2.6.0: the first reading is the claim's own words, not a normalized value.
    expect(page).toContain('Different readings of “around 1950”');
    expect(page).toContain('1956 or later');
    expect(page).toContain('Ray Okafor (invented)');
    expect(page).toContain('Owen Pike (invented)');
    expect(page).toContain('It can&#x27;t be 1950. The awning in the photo went up in 1956.');
    expect(page).not.toContain('vote');
    expect(page).not.toContain('>1<');
  });

  it('keeps t0 records visible and explains that no claims have been shared yet', () => {
    const page = renderArticle('t0');

    expect(page).toContain('Records');
    expect(page).toContain('My grandmother&#x27;s shop, I think.');
    expect(page).toContain('Brought by June Alder (invented)');
    expect(page).toContain('No claims have been shared about this site yet.');
    expect(page).toContain('Its records are listed above.');
    expect(page).not.toContain('TODO');
  });

  it('shows the corner shop record and links visible collection members', () => {
    const state = loadSiteState('corner-shop', 't3');
    const record = state.records.find((item) => item.id === 'rec-cs-photo');
    expect(record).toBeDefined();
    if (!record) return;

    const collectionId = 'collection-june-family';
    const collection = {
      id: collectionId,
      contributorId: record.contributorId,
      recordIds: [record.id, 'rec-cs-family-album'],
      note: 'June’s family photographs',
      createdAt: '2026-01-12T17:14:00Z',
    };
    const page = renderToStaticMarkup(
      <ArticleView
        state={{
          ...state,
          records: state.records.map((item) =>
            item.id === record.id ? { ...item, collectionId } : item,
          ),
          collections: [collection],
        }}
      />,
    );

    expect(page).toContain('Brought by June Alder (invented)');
    expect(page).toContain('href="#collection-collection-june-family"');
    expect(page).toContain('June’s family photographs');
    expect(page).toContain('Brought by June Alder (invented)');
    expect(page).toContain('href="#record-rec-cs-photo"');
    expect(page).toContain('A collection member is not shown on this page.');
    expect(page).not.toContain('rec-cs-family-album');
  });

  it('shows the real freight depot collection at t1 and t3', () => {
    for (const [stateId, expectedMembers] of [
      ['t1', 1],
      ['t3', 2],
    ] as const) {
      const state = loadSiteState('freight-depot', stateId);
      const collection = state.collections.find((item) => item.id === 'col-fd-luis');
      expect(collection).toBeDefined();
      if (!collection) continue;

      const page = renderToStaticMarkup(<ArticleView state={state} />);
      const collectionMarkup = /<article id="collection-col-fd-luis"[\s\S]*?<\/article>/
        .exec(page)?.[0];

      expect(collectionMarkup).toBeDefined();
      expect(collection.recordIds).toHaveLength(expectedMembers);
      expect(collectionMarkup).toContain('Two photos from my uncle&#x27;s album');
      expect(collectionMarkup).toContain('Brought by Luis (invented)');
      expect(collectionMarkup).not.toContain('(invented) (invented)');
      expect(page).not.toContain('Luis (invented) (invented)');
      for (const recordId of collection.recordIds) {
        expect(collectionMarkup).toContain(`href="#record-${recordId}"`);
      }
    }
  });

  it('shows a valid page when there are no sections, claims, or records', () => {
    const page = renderArticle('t0', []);

    expect(page).toContain('The corner shop');
    expect(page).toContain('No records have been shared yet.');
    expect(page).toContain('No claims have been shared about this site yet.');
    expect(page).not.toContain('TODO');
  });
});
