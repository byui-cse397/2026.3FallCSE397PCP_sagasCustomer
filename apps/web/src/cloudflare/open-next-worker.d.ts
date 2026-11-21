/**
 * The handler `opennextjs-cloudflare build` writes to `.open-next/worker.js`.
 *
 * `#open-next/worker` in `apps/web/package.json` points TypeScript here and
 * Wrangler's bundler at the generated file, so `worker.ts` type-checks before
 * anything is built.
 */
declare const openNextWorker: {
  fetch(request: Request, env: Readonly<Record<string, unknown>>, ctx: unknown): Promise<Response>;
};

export default openNextWorker;
