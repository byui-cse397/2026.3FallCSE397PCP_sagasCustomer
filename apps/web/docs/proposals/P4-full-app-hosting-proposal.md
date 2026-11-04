# P4: Hosting the full app

- **Project:** Sagas experience layer
- **Status:** Draft for team review. The recommendation is conditional: database access, and a CPU measurement on Cloudflare itself, wait on the sponsor (see "Still open").
- **Workstream:** Platform. **Issue:** #34. **Address:** P6, #35
- **Research dates:** local tests from 30 October 2026; the sponsor's facts and the comparison updated 2–3 November 2026
- **Currency:** USD; taxes and currency conversion excluded

## Recommendation

**Cloudflare Workers, as a second Worker next to `sagas-landing` on the sponsor's existing account, deployed only by GitHub Actions, with site pages built ahead of time where the data allows.**

It starts on Workers Free only once two checks pass, and both can only happen once a database is reachable:

- the CPU time measured on Cloudflare itself;
- a Worker reaching the hosted Supabase database.

If CPU is the problem, Workers Paid ($5/month for the account) is the fallback, and it needs the sponsor's approval. If the database can't be reached from a Worker, the fallback is Render.

Reads stay in `packages/read-model`, on standard Postgres, with host settings kept out of feature code, so a plain Node or container host stays possible either way.

| What P4 asks for                    | Cloudflare Workers                                                                                                        | Netlify                                                                                                                                                                       | Render                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Free while it's being built         | **$0** at today's traffic, with pages built ahead of time                                                                 | $0 at today's pace of deploys; every project pauses if the credits run out                                                                                                    | Free sleeps when idle, and Render says not to use it for production; $7/month to stay awake                                               |
| Low cost and sustainable after that | **About $5–6/month at 100×.** Bandwidth and static files are free                                                         | About $60/month at 100×, mostly bandwidth and requests                                                                                                                        | About $30/month at 100×, mostly bandwidth                                                                                                 |
| Not on Vercel                       | Yes                                                                                                                       | Yes                                                                                                                                                                           | Yes                                                                                                                                       |
| Uses what already exists            | **Yes:** the sponsor's account, the Workers-only token, the domain's DNS, and the same deploy pattern as the landing page | A new account, token and DNS record                                                                                                                                           | A new account, deploy hook and DNS record                                                                                                 |
| Deployed only by GitHub Actions     | Build with the adapter, then `wrangler deploy` with the existing token, as for the landing page                           | Build in Actions, then `netlify deploy --prod --no-build`, with `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` as repository secrets and Netlify's own builds from Git not linked | Build a container image in Actions, then deploy it with a deploy hook stored as a repository secret, with Render's Auto-Deploy set to Off |
| Database allow-list possible        | Not for direct Worker sockets; yes through Hyperdrive, from Cloudflare's published ranges                                 | No: function addresses change, and fixed ones are an Enterprise add-on                                                                                                        | Yes: services use regional outbound ranges, shown in the dashboard                                                                        |
| Runs our Next.js app                | After five small changes, tested on Next.js 15 (no migration)                                                             | Netlify's adapter supports Next.js 13.5 and later; not tested here                                                                                                            | As it is, a plain Node server; tested under Node locally                                                                                  |
| Reaches the Supabase database       | **To test:** the pooler over TCP, or Hyperdrive                                                                           | The pooler, from Node functions                                                                                                                                               | The pooler, as locally; Render has an Oregon region, next to `us-west-2`                                                                  |

The table's "today" and "100×" figures use the sponsor's 30-day account traffic as a stand-in. See "Cost at today's traffic and at 100×" for the assumptions, and for a second reading of the same figures that lowers every cost but doesn't change the order.

**Every host builds in GitHub Actions,** because `next build` needs a database, and only CI's own seeded Postgres has one. So Netlify and Render ship a build made in Actions rather than building on their side. A Render source build would need database access during its own build.

## Can Cloudflare serve the app?

**Very likely, after five small changes, and with no framework upgrade.** On 30 October the app on `main` was built with the OpenNext adapter for Cloudflare Workers and run in `workerd`, Cloudflare's runtime, on a local machine, reading the seeded read model from Postgres. "Every route" below means every route `apps/web` has today: `/`, `/dev`, `/api/sites` and `/api/sites/[slug]`. The site pages (`/sites/<slug>`) aren't built yet, so they couldn't be tested.

- **Every route answered,** once the changes below were made.
- **Twelve simultaneous first requests** to a fresh Worker all succeeded.
- **In a browser it behaved exactly like the same app under plain Node.**
- **It was repeated on a second machine** with the same results.

It has not run on Cloudflare itself, so the CPU figures are local estimates. The sponsor has approved a temporary test Worker to measure them, once a database is reachable.

### What the app needs to change

None of these are made in this proposal. They belong to P7, or to the workstream named.

| #   | Change                                                                                                                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Size                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Next.js 15.5.28 or later, with adapter `@opennextjs/cloudflare` 1.20.13 or later**                                                                 | The adapter needs Next.js 15.5.28 or later; `main` has 15.5.23. Adapter 1.20.12 wrongly refused every Next.js 15 release as unsupported. 1.20.13 fixed this: it treats a major as supported until two majors later. With 15.5.28 and 1.20.13 the build passed without any override.                                                                                                                                                                                                                                  | One patch bump and one dev dependency |
| 2   | **Make `pg` reachable from the app:** add `pg` and `pg-cloudflare` to `apps/web`'s dependencies and to `serverExternalPackages` in `next.config.mjs` | `pg` reaches the database in Workers through `pg-cloudflare`. That package only gives its socket code to Cloudflare's own build; anywhere else it gives an empty file. Without this change every database read failed with `TypeError: … is not a constructor`.                                                                                                                                                                                                                                                      | Three lines and the lockfile          |
| 3   | **`/dev` must not load the fixture index from the repository at request time**                                                                       | `/dev` calls `loadIndex()` from `@sagas/fixtures/acceptance`, which reads `packages/fixtures/states/index.json` from disk on every request. A Worker's file system only holds the modules in its own bundle, so the deployed bundle doesn't have that path, and `/dev` returned 500. Bundling the JSON fixed it. Reading the list from the read model would too.                                                                                                                                                     | A few lines                           |
| 4   | **Serve pages built ahead of time from the static-assets cache** (OpenNext's static-assets incremental cache)                                        | Without it the Worker rendered the home page on every request: about 16 ms each. With it, the Worker serves the stored page in about 2 ms. Each page request still runs the Worker, so it still counts as a request. Only files that match a path, like `/_next/static/…`, skip the Worker and are free. This cache is read-only and doesn't support revalidation, so changed pages need a rebuild and a redeploy. That suits fixture data. If pages later need revalidation, OpenNext's R2-based cache replaces it. | A config file                         |
| 5   | **Keep the build output out of git and lint** (`.open-next/`, `.wrangler/`)                                                                          | ESLint scanned the adapter's output and failed. Lint passed once those folders were ignored.                                                                                                                                                                                                                                                                                                                                                                                                                         | Two ignore entries                    |

**Next.js 16 is not needed for hosting.** It is a later, separate decision, but one with a date: Next.js 15's support was extended from 21 October 2026, and its security releases end on 31 January 2027. So the move to 16 belongs before then, in its own pull request. On 16.4.2 (with adapter 1.20.12) the app built, typechecked, linted, passed its 14 web tests and answered every route in `workerd`, so the upgrade looks feasible. Before taking it, check:

- browser behaviour on 16;
- cold starts;
- the whole workspace's CI.

Node is not a concern: CI uses 22.10.0 from `.nvmrc`, and 16.4.2 needs 20.9 or later. Moving to 16 affects every workstream, so it gets a decision record.

Two things already planned also apply:

- **The build needs a database.** `next build` renders the home page from Postgres. The preview uses fixture data only (P7), so CI can start its own Postgres and seed it, as locally. CI's database disappears after the job, so it serves the build only; at runtime the app needs the hosted database. This is the CI database job already on the Platform plan.
- **The read model's startup load works on Workers as it is.** The module first loads inside a request, runs one query and closes its connection before the request ends. Twelve simultaneous first requests didn't break it. If the read model later queries on each request (Da5), it has to create its client inside each request. OpenNext's guidance says not to keep a global client.

### Measurements

All measured in local `workerd`, against Postgres 16 seeded with the 24 fixture states. Each figure is the wall time of 50 warm requests (60 for `/dev`, spread over t0 to t3).

These are preliminary. Wall time on a shared cloud machine isn't Cloudflare's CPU time, so they show where the risks are, not what Cloudflare will measure.

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

**Repeated on a second machine** (WSL, with the team's Docker database), from the same setup on `main` after the 2.4.0 sync. Times are from Wrangler's request log, over about 12 refreshes each, after the first request:

| Route                                             | First request | Then: median (range) |
| ------------------------------------------------- | ------------- | -------------------- |
| `/`                                               | 26 ms         | 4–6 ms               |
| `/dev`, freight depot at t3 (the richest fixture) | 38 ms         | 13 ms (11–16)        |
| `/dev`, corner shop at t0 (the lightest state)    | —             | 12 ms (11–14)        |
| `/api/sites/freight-depot`                        | 32 ms         | 5 ms (4–6)           |

**For comparison, the sponsor's account on Cloudflare** (#11, 2 November) shows CPU time at p90 of 0.569 ms over the last 30 days. That is the static landing page and anything else on the account, not this app, but it shows real Cloudflare CPU for a simple Worker is well under these local figures.

**Browser check** (Chromium, against the local Worker on the Next.js 15.5.28 build, compared with the same pages under plain `next start` on `main`):

- **Pages and links:** the home page and `/dev` render, with query parameters choosing the site and state.
- **Navigation:** clicking to another state stays client-side, and refresh and the back button work.
- **Missing pages:** a missing page and an unknown site both give 404, not 500.
- **Same as Node:** both showed the same 404s for prefetched `/sites/<slug>` links. The app already links to site pages that aren't built yet (M4 adds them), so that isn't a hosting issue.

**What it means:**

- **Data calls and pages built ahead of time look comfortable on the Free plan.**
- **An article rendered on every request is a risk:** 15 to 22 ms on one machine, 11 to 16 ms on the other. Cloudflare allows occasional overruns, but ends a Worker that keeps going over 10 ms.
- **The lightest and richest articles took nearly the same time:** 12 ms for the corner shop at t0, against 13 ms for the freight depot at t3. That suggests most of the cost is rendering the page, not its data. Two cases don't show which change would get an article under Cloudflare's limit, though.
- **That justifies a measurement on Cloudflare, but doesn't yet show that Paid is needed.**

If it is a problem, there are two ways forward:

- **Build site pages ahead of time.** Fixture data only changes when the app is deployed, so stored pages cut the rendering work. Free still depends on the measured CPU and the daily request count.
- **Use Workers Paid.** It costs $5/month for the account, and the CPU limit goes from 10 ms to 30 s by default.

## Cost at today's traffic and at 100×

### The traffic stand-in

The app isn't published, so "today's traffic" needs a stand-in. The sponsor gave the figures his dashboard has (#11, 2 November), with two warnings:

- **Account-wide figures:** Cloudflare doesn't show metrics for `sagas-landing` alone, so they cover the whole account.
- **Pre-launch peak:** the busiest day, about 1,090 requests on 11 October, was before the landing page went live on 19 October, so it doesn't stand in for the page. It isn't used here.

| Last 30 days, whole account (Free plan) |        |
| --------------------------------------- | ------ |
| Total requests                          | 12.11k |
| Worker invocations                      | 4.99k  |
| Errors                                  | None   |
| CPU time, p90                           | 569 µs |

**What these figures are not:**

- **Not page views or demand for the app.** They are account totals for a static landing page.
- **Not an average CPU.** The 569 µs is a p90 for today's workload, so it can't be multiplied by requests to price the app.
- **Incomplete.** They give no response sizes, future peaks or function durations.

**Assumption:** each of the 12,110 requests counts as one page view of the full app. That is about 400 views a day at 1×, and about 40,000 a day at 100×. It is generous, because the landing page's own file requests are counted as views too. The real demand is unknown until the preview is published.

### What one page view costs

All measured locally on 30 October to 2 November:

- **Worker requests:** 7 on `/dev`: the page, plus Next.js prefetching the six `/sites/<slug>` links on it. 8 on the home page, which also prefetches `/dev`. The JavaScript and CSS are static files, which don't run a Worker. The model uses 7.
- **All requests:** 14 on a first visit (8 page and file requests plus the 6 prefetches). Netlify bills these.
- **Bytes on a first visit:** about 129 KiB. That's 118.5 KiB for `/dev` (106 KiB of it JavaScript), plus six prefetches of about 1.7 KB each. A repeat visit is 0.4 to 10 KiB, because the browser keeps the files, but the cost model uses the first-visit figure throughout.
- **CPU per view, upper bound:** 35 ms if every request is a cache hit or an API call (5 ms each), or 46 ms if the article is rendered on each request (16 ms plus six cache hits).
- **Deploys:** 7 merges to `main` changed app code in the last month (3 October to 2 November, documentation excluded). Sprint three will add more, so 20 a month is also shown.

### Results

|                                     | Cloudflare Workers                                                                                                                                                                                    | Netlify                                                                                                                                                               | Render                                                                                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1× (about 400 views a day)**      | **$0.** About 2,800 Worker requests a day, against Free's 100,000. If articles are rendered on each request and go over 10 ms, Workers Paid at $5                                                     | **$0** at 7 deploys (183 of 300 credits). **$9** (Personal) at 20 deploys (378 credits)                                                                               | **$7.** One always-on instance; bandwidth of 1.6 GB, inside the 5 GB included                                                                                                                                                                                      |
| **100× (about 40,000 views a day)** | **$5.25–5.51.** About 283,000 Worker requests a day is over Free, so Paid. 8.5 million requests, inside the 10 million included, and 42–56 million CPU-milliseconds, of which 30 million are included | **About $60.** About 7,900–8,100 credits: bandwidth 3,192, requests 3,391, compute 1,177, deploys 105–300. That's Pro's 3,000 credits plus four packs of 1,500 at $10 | **About $30.** $7, plus 160 GB of bandwidth against 5 GB included, at $0.15 per GB. Whether one 0.5 CPU instance keeps up at peaks is untested                                                                                                                     |
| Where the free tier stops           | At about 30–35× today's traffic (100,000 Worker requests a day, at 7–8 a view), or with requests that keep going over 10 ms CPU                                                                       | When the month's 300 credits run out. Deploys alone use 15 each, and then every project on the account pauses until the next month                                    | Free sleeps after 15 idle minutes and takes about a minute to wake, and Render may suspend a Free service that sends an uncommonly high volume of traffic over the internet, such as to an external database. So the paid instance is the realistic starting point |

Netlify's compute assumes 1 GB of memory (its default) and 50 ms per function call, which hasn't been measured. Workers Paid is per account, so the landing page would share it, at no extra cost. The arithmetic is reproducible from the inputs above.

**A second reading of the same figures.** Treat the 12,110 as the app's HTTP requests rather than its page views, with the following inputs:

- 100 KiB each;
- every request running the server;
- 4 deploys a month;
- Netlify functions at 1 GB for 100 ms.

Every cost falls, but the order doesn't change:

- **Cloudflare:** Free holds even at 100×, at about 40,000 Worker requests a day. Paid would be $5 flat.
- **Netlify:** 91 credits at 1×, which is Free. 3,119 credits at 100×, which is Pro's $20 plus one $10 pack, so $30.
- **Render:** $7 at 1×, and $24.85 at 100×, with 124 GB of bandwidth.

The first reading is the one used above, because it counts what a page view was measured to cost: 7 Worker requests, not 1. The cap on Free's 100,000 requests a day is reached sooner than a requests-only reading suggests. Either way, recalculate once the preview gives real requests, response sizes and durations.

## Reaching the hosted database

What the sponsor said (#11, 2 November):

- **Provider:** Supabase, in `us-west-2`, with PostGIS enabled.
- **How to connect:** through Supabase's connection pooler, with a URL and a password, like any Postgres database.
- **Not checked yet:** whether it needs an allow-list or TLS, and whether a Worker can connect.

What Supabase documents:

- **The shared pooler (Supavisor) works over IPv4 on every plan:**
  - transaction mode (port 6543), recommended for serverless and edge code;
  - session mode (port 5432), for persistent servers.
- **The direct connection is IPv6** on the Free and Pro plans, unless the IPv4 add-on is bought.
- **Prepared statements:** the shared pooler doesn't support them in transaction mode. The read model's one query has no parameters. Da2's seed script uses parameters, so it should seed through session mode.
- **Owner settings:** SSL enforcement and network restrictions are settings the project owner turns on in the dashboard. Whether they're on is the open allow-list and TLS question.

What that means for each host:

- **Cloudflare:** to test with the test Worker, in this order:
  1. **`pg` over a Worker socket to the transaction pooler.** Worker sockets connect from addresses outside Cloudflare's published ranges, so this only works if network restrictions are off.
  2. **Hyperdrive,** which connects from Cloudflare's published ranges, so a restricted database can allow them. Cloudflare's Supabase guide asks for the direct connection string, which is IPv6 on Supabase's Free and Pro plans, so whether Hyperdrive reaches it is part of the test.
- **Netlify:** Node functions with `pg` to the transaction pooler.
  - **Region:** functions run in Ohio by default, and changing the region needs Pro.
  - **Addresses:** their outbound addresses change as Netlify scales, and fixed ones are an Enterprise add-on, so this only works if the database has no allow-list.
  - **Connection string:** it must be set in Netlify's UI, CLI or API, not in `netlify.toml`, which functions can't read. By default a variable reaches every scope, including functions; on Pro, if scopes are narrowed, they must include Functions. A changed value needs a new deploy.
- **Render:** the session pooler URL in `DATABASE_URL`, exactly as locally, from the Oregon region. Render services send outbound traffic from regional IP ranges shown in the dashboard, so a database allow-list can include them.

So a restrictive database policy could change which option is viable. Its access rules decide the method, and have to be known first.

**Left open, at the sponsor's request:** how Data gets database access, and how the connection details reach the pipeline. He'll post in #11 when he knows. The likely shape is:

- **CI:** the pooler URL as a GitHub secret.
- **Runtime:** a Worker secret or a Hyperdrive configuration on his account. The pipeline's token can only edit Workers.

**One more question for later:** which Supabase plan the project is on. Free projects pause after 7 days of low activity. A preview that only queries when a fresh Worker starts may not keep it awake, and a paused database would take the preview down. Paid projects don't pause.

## The contract update

Upstream released contract 2.5.0 on 1 November and 2.6.0 on 3 November. The fork is still on 2.4.0 (#46). The evidence here is for 2.4.0.

Neither release changes anything this proposal depends on:

- dependencies, the lockfile or Next.js;
- the app's configuration;
- `/dev` or the fixture loader;
- the Platform and Data stories.

The sync belongs in its own pull request, with the database re-seeded afterwards. The hosting checks are then repeated on the result, using the same test setup, which still applies. P4 does none of that itself.

## Still open

**Before asking the sponsor to agree to the choice:**

- [x] Record the sponsor's database and traffic facts, with his warnings.
- [x] Compare the three hosts, with a 1×/100× cost model and its assumptions stated.
- [x] Scope the local evidence to the routes that exist today.
- [ ] Team review of the assumptions, the evidence and the conditional recommendation.

**Before P7 publishes anything, or for the approved test Worker:**

- [ ] **Database access, and how the details reach the pipeline.** The sponsor asked to leave them open; he'll post in #11.
- [ ] **Whether the database needs an allow-list or TLS.** The sponsor hasn't checked; it decides the connection method.
- [ ] **CPU time on Cloudflare itself.** The sponsor approved a temporary test Worker on `workers.dev`, with fixture data and no route, deployed from GitHub Actions and removed afterwards. It waits on database access, so it shouldn't be asked for again.
- [ ] **Which Supabase plan the project is on** (pausing, above).
- [ ] **The checks repeated on the version to be published,** including the site pages once they exist and the contract sync.
- [ ] **The account's daily headroom confirmed.** If Free can't carry the workload, ask for approval for Paid or reconsider the fallback.

Netlify and Render are compared from their current documentation and our local tests, not by deploying to them. Deploying would need accounts, and sign-ups are the sponsor's. #34 also says nothing is deployed in P4.

Netlify's Free plan and Render's Hobby workspace each allow one dashboard member. That fits a sponsor-owned account with deploys from Actions, as on Cloudflare. Team dashboard access would need a paid plan, for example Render Pro at $25/month plus compute.

Three options cover the three ways to run this app: an adapter at the edge (Cloudflare), serverless functions (Netlify), and a plain Node server (Render). The story allows three or four, so a fourth wasn't added.

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

Page weight was measured with Playwright's Chromium against plain `next start` on `main` (`3e40453`). It recorded:

- a first and a repeat visit to `/` and to `/dev?site=freight-depot&state=t3`;
- the size of a `/sites/<slug>` prefetch.

The Next.js 16.4.2 run used adapter 1.20.12 and the same changes. Nothing was deployed, and no account was used.

## Sources

- **Sponsor:** answers in #11 on 2 November 2026: the database provider and connection, the account traffic, and the test Worker.
- **Cloudflare:**
  - [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
  - [The 4 September 2026 change](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/) that removed the compressed limit.
  - [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
  - [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
  - [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/).
  - [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/).
  - [Hyperdrive firewall and networking](https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/).
  - [Hyperdrive with Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/supabase).
  - [Workers file system](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).
- **OpenNext:**
  - [Release 1.20.13](https://github.com/opennextjs/opennextjs-cloudflare/releases/tag/@opennextjs%2Fcloudflare@1.20.13).
  - [Cloudflare adapter overview](https://opennext.js.org/cloudflare). Its 3 MiB and 10 MiB limits predate Cloudflare's 4 September change.
  - [Performance](https://opennext.js.org/cloudflare/perf).
  - [Databases](https://opennext.js.org/cloudflare/howtos/db).
  - [Packages with workerd-specific code](https://opennext.js.org/cloudflare/howtos/workerd).
- **Netlify:**
  - [Pricing](https://www.netlify.com/pricing/).
  - [Credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), updated 30 October 2026.
  - [Paused projects](https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/).
  - [Next.js on Netlify](https://docs.netlify.com/frameworks/next-js/overview).
  - [Functions configuration](https://docs.netlify.com/build/functions/configuration/): 1,024 MB default memory, Ohio as the default region, region changes on Pro.
  - [CLI in CI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).
  - [CLI v21](https://www.netlify.com/changelog/2025-05-06-cli-v21-0-0/): `netlify deploy` builds by default, and `--no-build` skips it.
  - [Environment variables with functions](https://docs.netlify.com/build/functions/environment-variables/): scopes, and why `netlify.toml` values don't reach functions.
  - [Private connectivity](https://docs.netlify.com/security/private-connectivity): function addresses change by default, and static ones are an Enterprise add-on.
- **Render:**
  - [Pricing](https://render.com/pricing).
  - [New workspace plans](https://render.com/docs/new-workspace-plans): Hobby bandwidth 5 GB, down from 100 GB, from 1 August 2026.
  - [Free instances](https://render.com/docs/free): sleeping, monthly limits, and suspension of Free services that send unusually high traffic, including to an external database.
  - [Deploy hooks](https://render.com/docs/deploy-hooks).
  - [Deploys](https://render.com/docs/deploys): Auto-Deploy set to Off.
  - [Regions](https://render.com/docs/regions).
  - [Outbound IP addresses](https://render.com/docs/static-outbound-ip-addresses): regional ranges, shown in the dashboard.
- **Supabase:**
  - [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting/connecting-to-postgres).
  - [Project pausing](https://supabase.com/docs/guides/platform/project-pausing).
  - [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
- **Next.js support:** the [support policy](https://nextjs.org/support-policy). Next.js 15's Maintenance LTS was extended beyond its original end date of 21 October 2026, with security releases until 31 January 2027.
