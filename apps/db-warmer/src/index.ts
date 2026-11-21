/**
 * The database warmer's Worker (P8). Cloudflare runs `scheduled` on the
 * Cron Trigger in `wrangler.jsonc`; there is no `fetch` handler, so nothing
 * else can run it.
 *
 * Each run writes one log line: `warmed` with the database's clock and its
 * table count, or `warm-failed` with a kind, a code and a hint. A failed run
 * also throws, so the dashboard's Trigger Events mark it as an exception.
 */
import { Client } from 'pg';
import type { ClientFactory } from './warm';
import { warm, WarmError } from './warm';

/** The parts of Cloudflare's `ScheduledController` this Worker reads. */
export interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
}

/** A fresh `pg` client per run: Hyperdrive needs a connection never reused across invocations. */
const connectWithPg: ClientFactory = (connectionString) =>
  new Client({ connectionString, connectionTimeoutMillis: 10_000, query_timeout: 10_000 });

const worker = {
  async scheduled(controller: ScheduledController, env: Readonly<Record<string, unknown>>): Promise<void> {
    const scheduled = { cron: controller.cron, scheduledTime: new Date(controller.scheduledTime).toISOString() };
    try {
      const result = await warm(env, connectWithPg);
      console.log(JSON.stringify({ event: 'warmed', ...scheduled, ...result }));
    } catch (error) {
      const failure = WarmError.from(error);
      console.error(
        JSON.stringify({ event: 'warm-failed', ...scheduled, kind: failure.kind, code: failure.code, hint: failure.hint }),
      );
      throw failure;
    }
  },
};

export default worker;
