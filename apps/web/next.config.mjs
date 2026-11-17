/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@sagas/contracts', '@sagas/fixtures', '@sagas/read-model'],
  // Left to the Cloudflare build (OpenNext) to bundle, so it picks the Workers
  // socket that `pg` needs there. Bundled by Next instead, every database call
  // fails in a Worker. Plain Node is unaffected.
  serverExternalPackages: ['pg', 'pg-cloudflare'],
};
