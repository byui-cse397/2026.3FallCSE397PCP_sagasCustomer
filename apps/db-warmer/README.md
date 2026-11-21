# Database warmer

Keeps the hosted database from pausing (backlog story **P8**).

## What it does

The project's hosted database is a Supabase project on the Free plan. Supabase
pauses a Free project that shows too little database activity over seven days,
and only the project's owner, the sponsor, can resume it. Between semesters, or
in a quiet week, nobody would notice until the site stopped loading.

So a small Cloudflare Worker, **`sagas-db-warmer`**, visits the database four
times a day. Its Cron Trigger is `17 */6 * * *`: at 00:17, 06:17, 12:17 and
18:17 UTC. Each run:

1. connects through the Hyperdrive configuration **`sagas-supabase`**, the same
   one the full app uses;
2. starts a read-only transaction and runs one query, which reads Postgres's
   catalog and the database's clock;
3. commits, closes the connection, and writes one log line: `warmed`, with the
   database's time and how many tables it has.

Supabase doesn't say which queries count as activity, so each run sends a real
one, not just a connection. Supabase says a few requests a day over the week is
typically enough; four a day keeps a margin.

It runs on the sponsor's Cloudflare account, not on GitHub, so it keeps going
between semesters without anyone pushing to the repository. GitHub turns off
scheduled workflows in a public repository after 60 days without activity; a
Cron Trigger has no such rule.

## What it doesn't do

- **It never writes.** The query only reads, and it runs inside a `READ ONLY`
  transaction, so Postgres refuses a write even if the query were edited into
  one. It reads no layer's data, only the catalog, so it works on an empty
  database and when a layer moves its tables.
- **It has no public address.** No route, `workers.dev` is off, and the Worker
  has no `fetch` handler. Only Cloudflare's scheduler runs it.
- **It has no secret of its own.** The connection string, password included,
  lives in the Hyperdrive configuration, which never gives it back. The Worker
  only gets Hyperdrive's own local string.
- **It isn't monitoring or a backup.** It doesn't alert anyone when the database
  is down. Those are outside P8.

## What it costs

Nothing on the Free plans:

| Allowance                                | Free plan               | This Worker                           |
| ---------------------------------------- | ----------------------- | ------------------------------------- |
| Cron Triggers per Cloudflare account     | 5                       | 1                                     |
| Worker invocations                       | 100,000 a day           | 4 a day                               |
| Hyperdrive queries                       | 100,000 a day           | 12 a day (3 per run)                  |
| CPU per Cron Trigger run                 | 10 ms                   | Shown per run in the logs             |
| Supabase storage                         | 500 MB                  | Stores nothing                        |

`now()` in the query also keeps Hyperdrive from answering it from a cache. The
configuration has caching off today, but the full app shares it, and if caching
is turned on later, a cached answer would never reach the database.

## Where things live

| Piece                           | Where                                   | Notes                                                                    |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| The Worker's code               | `src/index.ts`, `src/warm.ts`           | `warm.ts` holds the query and the read-only transaction                  |
| Worker name, schedule, bindings | `wrangler.jsonc`                        | Wrangler manages the schedule: see "Turning it off"                      |
| The pipeline                    | `.github/workflows/db-warmer.yml`       | Manual only, from `main`: `deploy` or `delete`                           |
| The deploy token                | Repository secret `CLOUDFLARE_API_TOKEN` | The same token as the landing page. It expires at the end of the semester |
| The connection string           | Hyperdrive configuration `sagas-supabase` | In the sponsor's account. Not in this repository, the Worker or a secret |

## Deploying

Actions → **Database warmer** → **Run workflow**, on `main`, with `deploy`. It
runs this package's tests, deploys `sagas-db-warmer`, and checks that
Cloudflare holds the schedule in `wrangler.jsonc`, or none if the list is
empty. Changes to a schedule can take up to 15 minutes to reach Cloudflare's
network.

Deploy again only when this folder changes. Merging to `main` doesn't deploy it.

## Checking that it runs

- **Cloudflare:** Workers & Pages → `sagas-db-warmer` → Settings → Trigger
  Events → View events. Cloudflare keeps the 100 most recent runs, each with
  its outcome. The Worker's Logs tab shows each run's log line and its CPU time.
  Anyone with Workers access to the sponsor's account can see both.
- **That the database answered:** a `warmed` line's `at` is the database's own
  clock, read by `now()`. Hyperdrive never answers a query that uses `now()`
  from its cache, so a `warmed` line means Postgres ran the query at that time.
- **Hyperdrive:** Hyperdrive → `sagas-supabase` → Metrics shows the queries at
  each run's time, and none of them is a cache hit.
- **Supabase:** don't look for the query in the Postgres logs. Supabase logs
  only schema changes by default (`log_statement` is `ddl`), so a successful
  `SELECT` never appears there, and this Worker doesn't need that changed.
  Use `pg_stat_statements` instead, which is on in every Supabase project: the
  dashboard's Query Performance report reads it. The warmer's query is the one
  starting `SELECT now() AS at`, and its call count goes up by one with each
  run. Or, in the SQL editor:

  ```sql
  select calls
  from extensions.pg_stat_statements
  where query like 'SELECT now() AS at, count(*)::int AS tables%';
  ```

  Run it twice, a few hours apart.
- **The real test:** Supabase emails the project's owner before it pauses a
  project. If the sponsor gets that email while this Worker is running, the
  query isn't counting as activity. Tell the Platform owner, or whoever has
  this folder now.

## When a run fails

A failed run shows as an exception in Trigger Events, and its log line is
`warm-failed`, with a kind, a Postgres error code when there is one, and a hint.
It never logs the connection string or the database's own error message.

| Kind             | Usually means                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `network`, `timeout` | The Supabase project is already paused. Only its owner can restore it, from the Supabase dashboard.                |
| `authentication` | The database password changed. Update it in the Hyperdrive configuration `sagas-supabase`, in the Cloudflare dashboard. |
| `no-hyperdrive`  | The Worker was deployed without the Hyperdrive binding. Check `wrangler.jsonc`.                                        |
| `exceededCpu` (Cloudflare's outcome, not a log line) | The run used more than the Free plan's 10 ms of CPU. Say so on the P8 issue; the options are Workers Paid, which is the sponsor's decision, or a scheduled GitHub Actions workflow, with its 60-day rule. |

Deleting `sagas-supabase` would also break the full app, so it stays even if
this Worker goes.

## Turning it off

Choose by how long you want it off. Each way leaves the database and the
Hyperdrive configuration as they are.

**Stop it, keep the Worker (anyone with Workers access to the account):**
Workers & Pages → `sagas-db-warmer` → Settings → Triggers → Cron Triggers →
the `⋯` menu next to `17 */6 * * *` → Delete. It stops within about 15 minutes. The
schedule comes back the next time the pipeline deploys, because Wrangler
manages it.

**Keep it off (through the repository):** set `"crons": []` in
`wrangler.jsonc` in a pull request, then run the pipeline with `deploy`. The
checks accept an empty list, and the pipeline confirms that Cloudflare holds no
schedule. Keep the `crons` line itself: without it, a deploy leaves whatever
schedule Cloudflare already has, so the tests refuse a configuration without
one. To turn it back on, put the schedule back the same way.

**Remove it entirely, from the repository:** Actions → Database warmer → Run
workflow, on `main`, with `delete`. It deletes `sagas-db-warmer` and confirms
it's gone. This needs `CLOUDFLARE_API_TOKEN`, which expires at the end of the
semester.

**Remove it entirely, from the dashboard (the sponsor, any time):** Workers &
Pages → `sagas-db-warmer` → Settings → Delete.

Once it's off, the database pauses after about a week with no other activity.

## After the semester

The Worker keeps running on the sponsor's account. It doesn't depend on this
repository, the deploy token or any student's access, so nothing here has to
be renewed for it to keep working. Deploying a change or deleting it from the
pipeline needs a new token in `CLOUDFLARE_API_TOKEN`; the dashboard works
without one.

## Run it locally

Against the experience layer's local database, never the hosted one:

```bash
pnpm --filter @sagas/ui-api db:up
cd apps/db-warmer
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://sagas:sagas@localhost:5435/sagas_read \
  pnpm dev
# in another terminal: run the scheduled handler once
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=17+*/6+*+*+*&format=json"
```

The curl prints `{"outcome":"ok",...}` and the first terminal shows the
`warmed` line. Stop the database and run the curl again to see a failed run:
`"outcome":"exception"` and a `warm-failed` line. `pnpm --filter @sagas/db-warmer test`
runs the tests, which need no database.
