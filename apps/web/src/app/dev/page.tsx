import { notFound } from 'next/navigation';
import { devSandboxEnabled } from '@/lib/dev-sandbox';

/**
 * `/dev`, the component sandbox (`sandbox.tsx`).
 *
 * The sandbox is a development tool. Where `SAGAS_DEV_SANDBOX` turns it off
 * (see `src/lib/dev-sandbox.ts`), this page answers 404 before the sandbox, the
 * read model or any fixture is loaded: the sandbox is imported only after the
 * check passes.
 */
export default async function DevPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; site?: string }>;
}) {
  // Reading the request first keeps the page rendered per request. Checked
  // before it, the setting would be read once at build time, where it is unset,
  // and `next build` would save a 404 in its place.
  const { state, site } = await searchParams;
  if (!devSandboxEnabled()) notFound();

  const { DevSandbox } = await import('./sandbox');
  return <DevSandbox requested={state} requestedSite={site} />;
}
