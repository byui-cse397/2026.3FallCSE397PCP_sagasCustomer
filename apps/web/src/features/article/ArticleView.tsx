import type {
  ClaimState,
  Collection,
  Composition,
  Contributor,
  DetailStatus,
  GraphState,
  Section,
  SourceRecord,
} from '@sagas/contracts';
import { SiteHeader } from '../site/SiteHeader';
import { PhraseClaims } from './PhraseClaims';

/** Renders one section and the disputed readings named by its composition. */
function NarrativeSection({
  section,
  composition,
  claims,
  contributors,
}: {
  section: Section;
  composition: Composition | undefined;
  claims: Map<string, ClaimState>;
  contributors: Map<string, Contributor>;
}) {
  const details = new Map<string, DetailStatus>();
  const claimAuthors = new Map<string, Contributor>();

  for (const span of composition?.spans ?? []) {
    for (const claimId of span.claimIds) {
      const claim = claims.get(claimId);
      if (!claim) continue;
      claimAuthors.set(claim.contributor.id, claim.contributor);

      const relevantDetails = span.detailIds
        ? claim.detailStatuses.filter((status) => span.detailIds?.includes(status.detail.id))
        : claim.detailStatuses;

      for (const status of relevantDetails) {
        if (status.disputes.length > 0) details.set(status.detail.id, status);
      }
    }
  }

  return (
    <section aria-labelledby={`section-${section.id}`} className="space-y-3">
      <h2 id={`section-${section.id}`} className="text-lg font-semibold">
        {section.heading}
      </h2>
      {composition ? (
        <>
          <PhraseClaims composition={composition} claims={claims} />
          {claimAuthors.size > 0 && (
            <p className="text-xs text-neutral-600">
              Based on claims by{' '}
              {[...claimAuthors.values()]
                .map((contributor) =>
                  contributor.fictional
                    ? `${contributor.displayName} (invented)`
                    : contributor.displayName,
                )
                .join(', ')}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-600">There is no passage for this section yet.</p>
      )}

      {[...details.values()].map((status) => (
        <aside
          key={status.detail.id}
          aria-label={`Different readings of “${status.detail.excerpt.text}”`}
          className="space-y-2 rounded border border-neutral-300 p-3"
        >
          <h3 className="text-sm font-medium">
            Different readings of “{status.detail.excerpt.text}”
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {status.competingValues.map((reading) => {
              // Contract 2.6.0: a dispute names the words that replace this detail in `to`.
              const reason = status.disputes.find(
                (dispute) => dispute.to?.text === reading.value,
              )?.reasoning;
              const names = reading.contributorIds
                .map((id) => {
                  const contributor = contributors.get(id);
                  return contributor
                    ? `${contributor.displayName}${contributor.fictional ? ' (invented)' : ''}`
                    : `Contributor ${id}`;
                })
                .join(', ');

              return (
                <li key={reading.value} className="space-y-1 rounded bg-neutral-50 p-3">
                  <p className="font-medium">{reading.value}</p>
                  <p className="text-xs text-neutral-600">Given by {names}</p>
                  {reason && <p className="text-sm">{reason}</p>}
                </li>
              );
            })}
          </ul>
        </aside>
      ))}
    </section>
  );
}

/** Records remain visible whether or not a site has composed sections. */
function RecordsSection({
  records,
  collections,
  claims,
  contributors,
}: {
  records: SourceRecord[];
  collections: Collection[];
  claims: ClaimState[];
  contributors: Map<string, Contributor>;
}) {
  const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const recordRoles = new Map<string, Set<string>>();
  for (const { claim } of claims) {
    const sourceRoles = recordRoles.get(claim.sourceRecordId) ?? new Set<string>();
    sourceRoles.add('Source record');
    recordRoles.set(claim.sourceRecordId, sourceRoles);

    for (const { recordId } of claim.evidence) {
      const evidenceRoles = recordRoles.get(recordId) ?? new Set<string>();
      evidenceRoles.add('Evidence record');
      recordRoles.set(recordId, evidenceRoles);
    }
  }

  return (
    <section aria-labelledby="site-records" className="space-y-3">
      <h2 id="site-records" className="text-lg font-semibold">
        Records
      </h2>
      {records.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {records.map((record) => {
            const contributor = contributors.get(record.contributorId);
            const description = record.note ?? record.text;

            return (
              <li
                id={`record-${record.id}`}
                key={record.id}
                className="space-y-1 rounded border border-neutral-200 p-3"
              >
                <p className="text-sm font-medium">
                  {record.media.map((media) => media.kind).join(', ') || 'Written record'}
                </p>
                <p className="text-xs text-neutral-600">
                  {[...(recordRoles.get(record.id) ?? ['Nothing claimed yet'])].join(' · ')}
                </p>
                {description && <p className="text-sm">{description}</p>}
                <p className="text-xs text-neutral-600">
                  Profile{' '}
                  {contributor
                    ? `${contributor.displayName}${contributor.fictional ? ' (invented)' : ''}`
                    : `contributor ${record.contributorId}`}
                </p>
                {record.collectionId && collectionsById.has(record.collectionId) && (
                  <p className="text-xs">
                    Collection:{' '}
                    <a className="underline" href={`#collection-${record.collectionId}`}>
                      {collectionsById.get(record.collectionId)?.note ?? 'View this collection'}
                    </a>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-neutral-600">No records have been shared yet.</p>
      )}
      {collections.length > 0 && (
        <section aria-labelledby="site-collections" className="space-y-3">
          <h3 id="site-collections" className="text-base font-medium">
            Collections
          </h3>
          {collections.map((collection) => {
            const contributor = contributors.get(collection.contributorId);
            const profile = contributor
              ? `${contributor.displayName}${contributor.fictional ? ' (invented)' : ''}`
              : `contributor ${collection.contributorId}`;

            return (
              <article
                id={`collection-${collection.id}`}
                key={collection.id}
                className="space-y-2 rounded border border-neutral-200 p-3"
              >
                <h4 className="font-medium">{collection.note ?? 'Untitled collection'}</h4>
                <p className="text-xs text-neutral-600">Handed over by profile {profile}</p>
                <ul className="list-inside list-disc space-y-1">
                  {collection.recordIds.map((recordId) => {
                    const member = recordsById.get(recordId);
                    return (
                      <li key={recordId}>
                        {member ? (
                          <a className="underline" href={`#record-${recordId}`}>
                            {member.note ??
                              member.text ??
                              (member.media.map((media) => media.kind).join(', ') ||
                                `Record ${recordId}`)}
                          </a>
                        ) : (
                          <span>Record {recordId} (not shown on this site)</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}

/** The site narrative, rendered from the read model's site state. */
export function ArticleView({ state }: { state: GraphState }) {
  const claims = new Map(state.claims.map((claim) => [claim.claim.id, claim]));
  const contributors = new Map(
    state.contributors.map((contributor) => [contributor.id, contributor]),
  );
  const compositions = new Map(
    state.compositions.map((composition) => [composition.sectionId, composition]),
  );

  return (
    <main className="space-y-6">
      <SiteHeader state={state} />
      <RecordsSection
        records={state.records}
        collections={state.collections}
        claims={state.claims}
        contributors={contributors}
      />
      {state.sections.length > 0 ? (
        <div className="space-y-6">
          {state.sections.map((section) => (
            <NarrativeSection
              key={`${state.asOf}:${section.id}`}
              section={section}
              composition={compositions.get(section.id)}
              claims={claims}
              contributors={contributors}
            />
          ))}
        </div>
      ) : (
        <section
          aria-labelledby="site-narrative-status"
          className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-4"
        >
          <h2 id="site-narrative-status" className="text-lg font-semibold">
            Narrative
          </h2>
          <p className="text-sm text-neutral-700">
            {state.claims.length === 0
              ? 'No claims have been shared about this site yet. Its records are listed above.'
              : 'No narrative sections have been composed for this site yet. Its records are listed above.'}
          </p>
        </section>
      )}
    </main>
  );
}
