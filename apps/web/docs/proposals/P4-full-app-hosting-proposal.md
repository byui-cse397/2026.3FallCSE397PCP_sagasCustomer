# P4: Hosting the full app

- **Project:** Sagas experience layer
- **Status:** Draft. Not ready for the sponsor (see "Before this goes to the sponsor")
- **Workstream:** Platform. **Issue:** #34. **Address:** P6, #35
- **Research date:** 30 October 2026
- **Currency:** USD; taxes and currency conversion excluded

## Where this stands

**Can Cloudflare serve the full app's dynamic pages? Very likely, after five small changes to the app, and with no framework upgrade.** On 30 October the app on `main` was built with the OpenNext adapter for Cloudflare Workers and run in `workerd`, Cloudflare's runtime, on a local machine. It read the seeded read model from Postgres.

- **Every route answered,** once the changes below were made.
- **Twelve simultaneous first requests** to a fresh Worker all succeeded.
- **In a browser it behaved exactly like the same app under plain Node.**

It has not run on Cloudflare itself yet, so the CPU figures below are local estimates.

What is still open:

- The real CPU time on Cloudflare.
- Today's traffic, without which the cost at 1× and 100× can't be given.
- The hosted database's provider and access rules.
- The re-check of the other two hosts.

**Provisional choice:**

- **Where:** a second Worker on the sponsor's existing Cloudflare account, next to `sagas-landing`.
- **How it's deployed:** only by GitHub Actions.
- **Which plan:** it starts on the Free plan, with site pages built ahead of time. Workers Paid ($5/month) is only for the case where the CPU time measured on Cloudflare says so.

## What the app needs to change

None of these are made in this proposal. They belong to P7, or to the workstream named.

| #   | Change                                                                                                                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Size                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Next.js 15.5.28 or later, with adapter `@opennextjs/cloudflare` 1.20.13 or later**                                                                 | The adapter needs Next.js 15.5.28 or later; `main` has 15.5.23. Adapter 1.20.12 wrongly refused every Next.js 15 release as unsupported. 1.20.13 fixed this: it treats a major as supported until two majors later. With 15.5.28 and 1.20.13 the build passed without any override.                                                                                                                                                                                                                                  | One patch bump and one dev dependency |
| 2   | **Make `pg` reachable from the app:** add `pg` and `pg-cloudflare` to `apps/web`'s dependencies and to `serverExternalPackages` in `next.config.mjs` | `pg` reaches the database in Workers through `pg-cloudflare`. That package only gives its socket code to Cloudflare's own build; anywhere else it gives an empty file. Without this change every database read failed with `TypeError: … is not a constructor`.                                                                                                                                                                                                                                                      | Three lines and the lockfile          |
| 3   | **`/dev` must not load the fixture index from the repository at request time**                                                                       | `/dev` calls `loadIndex()` from `@sagas/fixtures/acceptance`, which reads `packages/fixtures/states/index.json` from disk on every request. A Worker's file system only holds the modules in its own bundle, so the deployed bundle doesn't have that path, and `/dev` returned 500. Bundling the JSON fixed it. Reading the list from the read model would too.                                                                                                                                                     | A few lines                           |
| 4   | **Serve pages built ahead of time from the static-assets cache** (OpenNext's static-assets incremental cache)                                        | Without it the Worker rendered the home page on every request: about 16 ms each. With it, the Worker serves the stored page in about 2 ms. Each page request still runs the Worker, so it still counts as a request. Only files that match a path, like `/_next/static/…`, skip the Worker and are free. This cache is read-only and doesn't support revalidation, so changed pages need a rebuild and a redeploy. That suits fixture data. If pages later need revalidation, OpenNext's R2-based cache replaces it. | A config file                         |
| 5   | **Keep the build output out of git and lint** (`.open-next/`, `.wrangler/`)                                                                          | ESLint scanned the adapter's output and failed. Lint passed once those folders were ignored.                                                                                                                                                                                                                                                                                                                                                                                                                         | Two ignore entries                    |

**Next.js 16 is not needed for hosting.** It is a later, separate decision. On 16.4.2 (with adapter 1.20.12) the app built, typechecked, linted, passed its 14 web tests and answered every route in `workerd`, so the upgrade looks feasible. Before taking it, check:

- browser behaviour on 16;
- cold starts;
- the whole workspace's CI.

Node is not a concern: CI uses 22.10.0 from `.nvmrc`, and 16.4.2 needs 20.9 or later. Moving to 16 affects every workstream, so it gets a decision record.

Two things already planned also apply:

- **The build needs a database.** `next build` renders the home page from Postgres. The preview uses fixture data only (P7), so CI can start its own Postgres and seed it, as locally. CI's database disappears after the job, so it serves the build only. At runtime the Worker needs a database it can reach (see "Reaching the hosted database"). This is the CI database job already on the Platform plan.
- **The read model's startup load works on Workers as it is.** The module first loads inside a request, runs one query and closes its connection before the request ends. Twelve simultaneous first requests didn't break it. If the read model later queries on each request (Da5), it has to create its client inside each request. OpenNext's guidance says not to keep a global client.

## Measurements

All measured in local `workerd`, against Postgres 16 seeded with the 24 fixture states. Each figure is the wall time of 50 warm requests (60 for `/dev`, spread over t0 to t3).

These are preliminary. Wall time on a shared cloud machine isn't Cloudflare's CPU time, so they show where the risks are, not what Cloudflare will measure. That needs a deployed Worker.

| Route                                                | What it does                                          | Next.js 15.5.28, adapter 1.20.13: median / p95 | Next.js 16.4.2, adapter 1.20.12: median / p95 | Against Free's 10 ms CPU                    |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| `/`                                                  | Home page, built ahead of time, served from the cache | 2.5 / 4 ms (16 / 20 ms rendered each time)     | 2 / 4 ms                                      | Promising; deployed CPU measurement pending |
| `/api/sites`                                         | All sites, from the read model                        | 3 / 4 ms                                       | 2 / 4 ms                                      | Promising; deployed CPU measurement pending |
| `/api/sites/[slug]`                                  | One site's state                                      | 3 / 5 ms                                       | 2 / 5 ms                                      | Promising; deployed CPU measurement pending |
| `/dev`                                               | A full article, rendered on every request             | 15 / 22 ms                                     | 18 / 22 ms                                    | Risk of exceeding Free's CPU limit          |
| Twelve simultaneous first requests to a fresh Worker | Load the code and run the one read-model query        | All succeeded, 0.25–0.43 s each                | One request: 0.33 s                           | Mostly waiting on the database              |

| Bundle                        | Next.js 15.5.28 | Next.js 16.4.2 | Limit, Free and Paid            |
| ----------------------------- | --------------- | -------------- | ------------------------------- |
| Uncompressed (`Total Upload`) | 4,579 KiB       | 5,186 KiB      | 64 MiB                          |
| gzip, for reference           | 936 KiB         | 1,082 KiB      | No limit since 4 September 2026 |

**Repeated on a second machine** (WSL, with the team's Docker database), from the same setup on `main` after the 2.4.0 sync. The times are from Wrangler's request log, over about 12 refreshes each, after the first request:

| Route                                             | First request | Then: median (range) |
| ------------------------------------------------- | ------------- | -------------------- |
| `/`                                               | 26 ms         | 4–6 ms               |
| `/dev`, freight depot at t3 (the richest fixture) | 38 ms         | 13 ms (11–16)        |
| `/dev`, corner shop at t0 (the lightest state)    | —             | 12 ms (11–14)        |
| `/api/sites/freight-depot`                        | 32 ms         | 5 ms (4–6)           |

**Browser check** (Chromium, against the local Worker on the Next.js 15.5.28 build, compared with the same pages under plain `next start` on `main`):

- **Pages and links:** the home page and `/dev` render, with query parameters choosing the site and state.
- **Navigation:** clicking to another state stays client-side, and refresh and the back button work.
- **Missing pages:** a missing page and an unknown site both give 404, not 500.
- **Same as Node:** both runs showed the same 404s for prefetched `/sites/<slug>` links. The app already links to site pages that aren't built yet (M4 adds them), so that isn't a hosting issue.

**What it means:**

- **Data calls and pages built ahead of time look comfortable on the Free plan.**
- **An article rendered on every request is a risk:** 15 to 22 ms on one machine, 11 to 16 ms on the other. Cloudflare allows occasional overruns, but ends a Worker that keeps going over 10 ms.
- **The cost is mostly drawing the page at all, not the data in it.** The lightest article (corner shop at t0) took nearly as long as the richest (freight depot at t3): 12 ms against 13 ms. Trimming data won't bring an article under 10 ms; building it ahead of time would.
- **That justifies a measurement on Cloudflare, but doesn't yet show that Paid is needed.**

If it is a problem, there are two ways forward:

- **Build site pages ahead of time.** Fixture data only changes when the app is deployed, so this keeps the Free plan.
- **Use Workers Paid.** It costs $5/month, and the CPU limit goes from 10 ms to 30 s by default.

## Cost on Cloudflare

| Plan                                     | Price                                   | Included                                                                                                             | What makes it stop being free, or cost more                                                                                             |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Workers Free                             | $0                                      | 100,000 requests a day to Workers; 10 ms CPU per request. Requests that match a static asset are free and unlimited. | More than 100,000 requests a day that run a Worker (page requests do, even from the cache), or requests that keep going over 10 ms CPU  |
| Workers Paid                             | $5/month minimum, for the whole account | 10 million requests and 30 million CPU-milliseconds a month, shared by every Worker on the account                   | $0.30 per extra million requests; $0.02 per extra million CPU-milliseconds                                                              |
| Hyperdrive (optional connection pooling) | Included in Free and Paid               | Free: 100,000 database queries a day                                                                                 | Today's read model runs one query per fresh Worker, far below the limit. Per-request queries would make it about one query per request. |

**Worked example on Paid,** if every request averaged 18 ms of CPU:

- **CPU runs out first,** at about 1.7 million requests a month. The request allowance lasts to 10 million.
- **From there to 10 million,** each extra million costs about $0.36, for the CPU alone.
- **Above 10 million,** about $0.66: $0.30 for the requests plus $0.36 for the CPU.

Requests served from the cache use far less CPU than that. The allowance is per account, so anything else the sponsor runs on Workers shares it.

**A page view is several Worker requests, not one.**

- **What happens today:** opening `/dev` also made Next.js prefetch the six `/sites/<slug>` links on the page, so one view was 7 Worker requests. The JavaScript and CSS files are static assets and don't count.
- **Effect on the free limit:** at 7 requests a view, Free's 100,000 requests a day is about 14,000 page views.
- **Later:** once the site pages exist and are built ahead of time, those prefetches become cache hits of about 2 ms, but they still count as requests. Turning prefetch off for a link is the app's choice, not a hosting one.

So traffic has to be turned into requests per page view before it can be priced.

**At today's traffic and at 100×:** to fill in. The landing page's daily requests are in the sponsor's Cloudflare dashboard. That figure, labelled as a stand-in for an app that isn't published yet, or an agreed assumption, goes here.

## Reaching the hosted database

- **Build:** CI's own Postgres, seeded from the fixtures, as above. The build needs no access to the hosted database.
- **Runtime:** the API routes, and any page rendered on every request, read Postgres. The test setup's `DATABASE_URL` points at `127.0.0.1`, so it only works locally.
- **Two ways a deployed Worker connects, and they differ:**
  - **Direct TCP** (`pg` over a Worker socket) connects from addresses that are _not_ in Cloudflare's published IP ranges. It can't reach private network addresses or localhost.
  - **Hyperdrive** connects from Cloudflare's published IP ranges. A database with an IP allow-list can allow those ranges. A private database needs a Cloudflare Tunnel or Workers VPC.

  So the database's access rules decide the connection method. They have to be known first.

- **Credentials:** at runtime the connection string goes in a Worker secret, or in a Hyperdrive configuration. That's in addition to any GitHub secret CI uses. The pipeline's token can only edit Workers, so who creates the secret or the Hyperdrive configuration is a question for the sponsor.
- **Facts needed from the sponsor** (asked in #11):
  - the provider (the region was given at a meeting as `us-west-2`);
  - whether the database is public or private;
  - whether it requires an allow-list or TLS;
  - whether PostGIS is enabled;
  - who can provide access for Data and the pipeline.

## The other options

Vercel is excluded by the story. The story allows three or four options; a fourth is optional. The Netlify and Render rows come from P2 (#5, researched 8 October) and still have to be re-checked against this app.

|                            | Cloudflare Workers                                                                                                                                      | Netlify                                                                                                                             | Render                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runs this app              | **Tested locally** with OpenNext, after the changes above                                                                                               | Next.js adapter supports SSR and route handlers (P2). To check against this app                                                     | As a plain Node server (`next start`), so no adapter is needed (P2). To check                         |
| Reaches Postgres           | Direct TCP or Hyperdrive, depending on the database's access rules                                                                                      | Node functions with `pg` (P2). To test                                                                                              | `DATABASE_URL`, as locally (P2)                                                                       |
| How GitHub Actions deploys | Build with the adapter, then `wrangler deploy` with the existing Workers-only token, as for the landing page. Runtime secret or Hyperdrive set up once. | To check                                                                                                                            | To check                                                                                              |
| What ends free             | 100,000 Worker requests a day; 10 ms CPU per request                                                                                                    | 300 credits a month across deploys, bandwidth and compute; a production deploy is 15 credits; Free projects pause at the limit (P2) | Free web services sleep after 15 idle minutes and take about a minute to wake; 750 hours a month (P2) |
| Next paid step             | $5/month for the account                                                                                                                                | Personal $9/month, Pro $20/month (P2)                                                                                               | From $7/month per service (P2)                                                                        |
| Cost at 1× and 100×        | To fill in                                                                                                                                              | To fill in                                                                                                                          | To fill in                                                                                            |

## Before this goes to the sponsor

- [ ] Today's traffic from the sponsor, and whether the account already uses Workers Paid. Then convert page views to Worker requests (about 7 per view today), and give the cost at 1× and 100× for each option, with the assumptions labelled.
- [ ] The database facts from the sponsor (#11), then the connection method.
- [ ] Re-check Netlify and Render against this app, including how GitHub Actions would deploy to each.
- [ ] The real CPU time on Cloudflare. #34 says nothing is deployed in P4, so a temporary test Worker needs the sponsor's explicit approval as an exception; otherwise it belongs to P7. It would be on `workers.dev`, with fixture data and no route, deployed from GitHub Actions, and it needs a database it can reach.

## How the test was run

On a clean copy of `main` (`cf27878`):

1. Started Postgres 16 on port 5435 and ran `pnpm --filter @sagas/ui-api db:seed`.
2. Moved `apps/web` to Next.js 15.5.28 and added `@opennextjs/cloudflare@1.20.13` and `wrangler@4.151.0` as dev dependencies. Also added `open-next.config.ts` and a local-only `wrangler.jsonc` (flags `nodejs_compat` and `global_fetch_strictly_public`). The landing page's lockfile resolves Wrangler to 4.151.1, so P7 should use the same version for both.
3. Made changes 2 to 5 above.
4. Ran `opennextjs-cloudflare build` (no override flag) and `opennextjs-cloudflare populateCache local`.
5. Measured the bundle with `wrangler deploy --dry-run --outdir`, which uploads nothing.
6. Served the app with `wrangler dev`. Timings came from its local request traces; the browser check used Playwright's Chromium.
7. Ran CI on the result: a clean install, the fixtures, typecheck, lint, acceptance and tests for the whole workspace, and the landing page's build, release build and dry run. All passed.

The whole Next.js 15 run was repeated on `main` after the contract 2.4.0 sync (`3e40453`), with the database re-seeded. The results:

- the same changes applied, and CI passed;
- all twelve simultaneous first requests succeeded;
- the freight depot, the richest fixture, rendered on `/dev` in a median of 16 ms (p95 21 ms).

The same setup was then applied on a second machine, in its own git worktree and local branch, never pushed. It was built and served there with the same commands, giving the second-machine table above.

The Next.js 16.4.2 run used adapter 1.20.12 and the same changes. Nothing was deployed, and no account was used.

## Sources

- **Cloudflare:**
  - [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): 64 MiB uncompressed, no compressed limit, 10 ms CPU on Free.
  - [The 4 September 2026 change](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/) that removed the compressed limit.
  - [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
  - [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
  - [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/): where direct connections come from, and what they can't reach.
  - [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/).
  - [Hyperdrive firewall and networking](https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/).
  - [Workers file system](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).
- **OpenNext:**
  - [Release 1.20.13](https://github.com/opennextjs/opennextjs-cloudflare/releases/tag/@opennextjs%2Fcloudflare@1.20.13): the Next.js 15 fix.
  - [Cloudflare adapter overview](https://opennext.js.org/cloudflare). Its 3 MiB and 10 MiB limits predate Cloudflare's 4 September change.
  - [Performance](https://opennext.js.org/cloudflare/perf): the static-assets cache is read-only, with no revalidation.
  - [Databases](https://opennext.js.org/cloudflare/howtos/db): create a client per request.
  - [Packages with workerd-specific code](https://opennext.js.org/cloudflare/howtos/workerd).
- **Next.js support:** the [support policy](https://nextjs.org/support-policy), which couldn't be read from the test machine. [One reading of it](https://endoflife.ai/nextjs/15) gives Next.js 15's maintenance end as 31 January 2027; [another](https://www.digitalapplied.com/blog/nextjs-15-end-of-support-october-21-upgrade-options) gave 21 October 2026.
- **Netlify and Render:** the sources listed in P2, `apps/web/docs/proposals/P2-hosting-and-domain-proposal.md`.
