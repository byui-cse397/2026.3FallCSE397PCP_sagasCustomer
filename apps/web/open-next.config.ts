// Settings for the Cloudflare build (`opennextjs-cloudflare build`).
//
// Pages built ahead of time are served from the Worker's static assets. That
// cache is read-only: a page changes only on the next deploy, which suits
// fixture data. Nothing here needs another Cloudflare product (KV, R2, D1).
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
