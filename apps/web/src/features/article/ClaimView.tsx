import type { ClaimState } from '@sagas/contracts';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { DetailDisputes } from './DetailDisputes';
import { SourcePanel } from './SourcePanel';
import { TranslationPanel } from './TranslationPanel';

/**
 * One claim, with everything the community has done to it.
 *
 * This is the composition: text, how well supported it is, where people
 * disagree, how it's been rendered, and who said it. Replace the pieces one at
 * a time.
 */
export function ClaimView({ claim, detailIds }: { claim: ClaimState; detailIds?: string[] }) {
  const text = claim.claim.awaitingTranslation ? claim.claim.sourceLanguageText : claim.claim.text;
  const excerpts = detailIds?.flatMap((id) => {
    const excerpt = claim.claim.details.find((detail) => detail.id === id)?.excerpt;
    if (!excerpt) return [];
    const start = text.indexOf(excerpt);
    return start < 0 ? [] : [{ start, end: start + excerpt.length }];
  }).sort((a, b) => a.start - b.start) ?? [];
  return (
    <article>
      <p>{excerpts.length === 0 ? text : excerpts.map((part, index) => <span key={part.start}>{text.slice(index === 0 ? 0 : excerpts[index - 1].end, part.start)}<mark>{text.slice(part.start, part.end)}</mark>{index === excerpts.length - 1 ? text.slice(part.end) : null}</span>)}</p>
      <ConfidenceIndicator claim={claim} />
      <DetailDisputes claim={claim} />
      <TranslationPanel claim={claim} />
      <SourcePanel claim={claim} />
    </article>
  );
}
