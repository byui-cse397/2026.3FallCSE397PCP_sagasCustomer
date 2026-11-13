# 0003 · The fork moves to Next.js 16 before the full app is published

**Date:** 13 November 2026 · **Workstream:** Platform · **Story:** P4 (#34), before P7
**Status:** Approved by the sponsor at the 6 November meeting, and in #11 on
8 November: "go ahead on the fork, in its own pull request". Upstream follows in
a later release.

## What was decided

`apps/web` moves from Next.js 15 to 16 in its own pull request, before P7
publishes the full app. Section 5 of the P4 proposal planned it.

- `next` goes from `^15.1.6` (locked at 15.5.23) to `^16.4.6`, and
  `@next/eslint-plugin-next` in `tooling/eslint` moves with it.
- No application code or configuration had to change. The code already awaits
  `params` and `searchParams`, and nothing uses what 16 removed or changed:
  middleware, `cookies()`, `headers()`, `draftMode()`, `next/image`, metadata
  image or sitemap functions, runtime configuration, AMP, parallel routes, a
  custom webpack configuration, or `next lint`.
- React stays at 19.0.0 from the `react19` catalog. Next.js 16.4.6 accepts any
  `^19.0.0`. In the App Router, Next.js renders with
  the React canary it ships, which is 19.3.0-canary in 16.4.6, on the server and
  in the browser. The catalog's React is what the unit tests run on, and what
  other tools see.
- `apps/web/AGENTS.md` is new. It holds only the block that Next.js writes
  there when `next dev` runs under a coding agent. Committing it keeps
  everyone's working tree clean.
- The Cloudflare adapter isn't part of this change. The P4 test Worker pull
  request runs the Cloudflare build and deploy on this exact Next.js version
  before P7 publishes anything.

## What else was considered

- **Stay on 15 and keep it patched.** Moving to 15.5.29 or later would also
  clear the advisories against `main` and suit the adapter. But the full app
  goes live this semester and is handed over in December. Next.js 15 gets
  security releases only until 31 January 2027, so the move to 16 would fall
  to whoever takes the project over, on a live app.
- **Wait for upstream to move first.** No lockfile conflicts on syncs, but
  upstream has no date yet, and P7 shouldn't wait for one.
- **Move together with the Cloudflare adapter.** One pull request fewer, but a
  framework change that touches every workstream would be mixed with deployment
  work, and would be harder to review and to revert.
- **Raise React to 19.3 as well.** Not required, and it doesn't change the React
  the pages render with. It would change `pnpm-workspace.yaml`, an upstream
  file, and many more lockfile lines, so syncs would conflict more. It's worth
  doing when upstream moves to 16, so that the tests run the same React line as
  the pages.

## Why

- **Support.** Next.js 16 is in Active LTS, which gets features, bug fixes and
  security patches. Next.js 15 is in Maintenance LTS: critical bug fixes and
  security releases until 31 January 2027, and nothing promised after that.
- **Security.** On 13 November 2026, `pnpm audit --prod` (pnpm 9.15.4) reported
  six advisories against `next` 15.5.23, the version `main` locks, three of them
  critical. All six are fixed in later 15.5 releases too, so they are a reason
  to leave 15.5.23 rather than a reason for 16 on their own. With 16.4.6 it
  reported none against `next`, and none against `postcss`, which Next.js 15
  pins at 8.4.31 even in 15.5.29. Nothing deployed runs Next.js today: the
  landing page is static HTML.
- **The deployment target.** P7 deploys with `@opennextjs/cloudflare`. Version
  1.20.17 accepts Next.js 15.5.29 or later on 15, or 16.4.5 or later, so
  `main` has to move either way.
- **Now, before P7.** The test Worker, the CI database job and P7 are then built
  and measured on the version that will be deployed, and no live app has to be
  upgraded later.

## What it costs

- **Lockfile conflicts on upstream syncs,** until upstream moves to 16. The
  upgrade changes `pnpm-lock.yaml` wherever Next.js appears, so a sync whose
  lockfile changes touch those lines will conflict there. Keep the fork's
  Next.js lines in `package.json`, let `pnpm install` rewrite the lockfile, and
  review the result. The pull request description has the steps.
- **Next.js and the adapter are bumped together.** An adapter release can raise
  the lowest Next.js it accepts: 1.20.16 did on 3 November, the day 16.4.5 came
  out. So a Next.js security release may need an adapter bump in the same pull
  request, and the other way round.
- **Newer browsers only.** Next.js 16 supports Chrome and Edge 111, Firefox 111
  and Safari 16.4 or later. Next.js 15 built for Chrome 64 and Safari 12. A
  phone or tablet that can't update past iOS 16.3 is outside what Next.js
  supports. A `browserslist` setting changes what the build targets, but it
  doesn't make Next.js support older browsers, so it would need testing on
  those devices first.
- **Small changes in development.** `next build` uses Turbopack and no longer
  runs lint, which CI already runs on its own. `next dev` writes to
  `.next/dev`. Prefetches cut short by leaving a page show as cancelled in the
  browser's developer tools.

## What would change it

If a Next.js 16 problem blocks P7, revert this change and move to Next.js
15.5.29 or later instead, which the adapter also accepts, until the problem is
fixed. Once upstream moves to 16, the next sync settles the lockfile and the
conflicts stop.
