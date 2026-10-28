'use client';

import { useRef, useState } from 'react';
import type { ClaimState, Composition } from '@sagas/contracts';
import { ClaimView } from './ClaimView';

export function PhraseClaims({
  composition,
  claims,
}: {
  composition: Composition;
  claims: Map<string, ClaimState>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const phraseRef = useRef<HTMLButtonElement>(null);
  const spans = composition.spans;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">
        {spans.length === 0 ? composition.text : spans.map((span, index) => (
          <span key={`${span.start}-${span.end}`}>
            {index === 0 && composition.text.slice(0, span.start)}
            <button
              ref={selected === index ? phraseRef : undefined}
              type="button"
              aria-expanded={selected === index}
              aria-controls={`phrase-claims-${composition.id}`}
              onClick={() => setSelected(selected === index ? null : index)}
              className="rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {composition.text.slice(span.start, span.end)}
            </button>
            {composition.text.slice(span.end, spans[index + 1]?.start ?? composition.text.length)}
          </span>
        ))}
      </p>
      {selected !== null && spans[selected] && (
        <section id={`phrase-claims-${composition.id}`} aria-label="Claims behind this phrase" className="space-y-3 rounded border border-neutral-200 p-3">
          <button type="button" onClick={() => { setSelected(null); phraseRef.current?.focus(); }} className="text-sm underline focus-visible:outline focus-visible:outline-2">
            Back to passage
          </button>
          <SelectedPhraseClaims span={spans[selected]} claims={claims} />
        </section>
      )}
    </div>
  );
}

export function SelectedPhraseClaims({
  span,
  claims,
}: {
  span: Composition['spans'][number];
  claims: Map<string, ClaimState>;
}) {
  return <div className="space-y-3">
    {[...span.claimIds]
      .map((id) => claims.get(id))
      .filter((claim): claim is ClaimState => Boolean(claim))
      .sort((a, b) => b.weight - a.weight)
      .map((claim) => (
        <div key={claim.claim.id} data-claim-id={claim.claim.id}>
          <ClaimView claim={claim} detailIds={span.detailIds} />
          {claim.extensions.map((id) => {
            const extension = claims.get(id);
            return extension ? <div key={id} data-claim-id={extension.claim.id} className="ml-4 border-l-2 border-neutral-200 pl-3"><ClaimView claim={extension} /></div> : null;
          })}
        </div>
      ))}
  </div>;
}
