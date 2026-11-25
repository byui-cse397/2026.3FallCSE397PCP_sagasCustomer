/**
 * The Worker's entry point: the Wrangler configuration's `main`.
 *
 * It wraps the handler OpenNext generates, the way OpenNext's "Custom Worker"
 * guide shows (https://opennext.js.org/cloudflare/howtos/custom-worker), and
 * adds one thing. With a Hyperdrive binding, the app's `DATABASE_URL` is
 * Hyperdrive's string (`database-env.ts`). Without one, requests go to
 * OpenNext's handler untouched.
 *
 * The variables go two ways, on every request:
 * - into the env passed on, because OpenNext copies that env's strings into
 *   `process.env` on an instance's first request;
 * - into `process.env` directly, because OpenNext doesn't copy them again, and
 *   the read model reads `DATABASE_URL` when it first loads, which can be a
 *   later request. It then gets that request's string, not the first one's.
 *
 * The read model opens its connection, queries and closes it inside the
 * request that loads it, which is what Hyperdrive needs: a connection is never
 * reused across requests.
 */
import openNextWorker from '#open-next/worker';
import { hyperdriveVars, setDatabaseVars } from './database-env';

const worker = {
  fetch(request: Request, env: Readonly<Record<string, unknown>>, ctx: unknown): Promise<Response> {
    const vars = hyperdriveVars(env);
    if (vars === null) return openNextWorker.fetch(request, env, ctx);
    setDatabaseVars(vars, process.env);
    return openNextWorker.fetch(request, { ...env, ...vars }, ctx);
  },
};

export default worker;
