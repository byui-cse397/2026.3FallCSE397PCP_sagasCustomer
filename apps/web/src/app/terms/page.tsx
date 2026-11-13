import { readTermsMarkdown, renderTermsMarkdown } from '@sagas/terms';
import Link from 'next/link';

export default function TermsPage() {
  const termsHtml = renderTermsMarkdown(readTermsMarkdown());

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 font-sans text-neutral-900">
      <p>
        <Link href="/" className="underline">
          Sagas
        </Link>
      </p>
      <article
        className="prose prose-neutral mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: termsHtml }}
      />
    </main>
  );
}
