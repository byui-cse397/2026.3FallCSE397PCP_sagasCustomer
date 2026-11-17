/**
 * Which database string the app gets when it runs as a Cloudflare Worker.
 *
 * The app reads only `DATABASE_URL`, from `process.env` (`packages/read-model`,
 * and the test Worker's connection check). On Cloudflare that can't be the
 * hosted database's own string: Supabase signs its certificates with its own
 * CA, and a Worker's connections accept only certificates that chain to a
 * public root. Hyperdrive can be given Supabase's CA, so the app connects
 * through Hyperdrive. Its string, though, arrives inside a binding
 * (`env.HYPERDRIVE`), and only string bindings reach `process.env`.
 *
 * With a Hyperdrive binding, `hyperdriveVars` gives:
 * - `DATABASE_URL`: Hyperdrive's string, so every read goes through Hyperdrive;
 * - `SAGAS_DATABASE_ROUTE`: `hyperdrive`, so the connection check can say so;
 * - `SAGAS_DIRECT_DATABASE_URL`: the Worker's own `DATABASE_URL` secret, if it
 *   has one, which only the test Worker's connection check reads.
 *
 * Without a binding it gives nothing, and the env is left as it is. The
 * Worker's entry (`worker.ts`) applies these on every request.
 */

/** What a Hyperdrive binding provides that the app uses. */
export interface HyperdriveBinding {
  readonly connectionString: string;
}

export interface DatabaseVars {
  DATABASE_URL: string;
  SAGAS_DATABASE_ROUTE: 'hyperdrive';
  SAGAS_DIRECT_DATABASE_URL?: string;
}

/** The binding named `HYPERDRIVE` in the Wrangler configuration, if it is there. */
export function hyperdriveOf(env: Readonly<Record<string, unknown>>): HyperdriveBinding | null {
  const binding = env.HYPERDRIVE;
  if (typeof binding !== 'object' || binding === null || !('connectionString' in binding)) {
    return null;
  }
  const { connectionString } = binding;
  return typeof connectionString === 'string' && connectionString !== '' ? { connectionString } : null;
}

/** The database variables for this request, or `null` without a Hyperdrive binding. */
export function hyperdriveVars(env: Readonly<Record<string, unknown>>): DatabaseVars | null {
  const hyperdrive = hyperdriveOf(env);
  if (hyperdrive === null) return null;
  const direct = env.DATABASE_URL;
  return {
    DATABASE_URL: hyperdrive.connectionString,
    SAGAS_DATABASE_ROUTE: 'hyperdrive',
    ...(typeof direct === 'string' && direct !== '' ? { SAGAS_DIRECT_DATABASE_URL: direct } : {}),
  };
}

/** Writes the variables into `target` (`process.env`), removing a direct string the request doesn't have. */
export function setDatabaseVars(vars: DatabaseVars, target: Record<string, string | undefined>): void {
  target.DATABASE_URL = vars.DATABASE_URL;
  target.SAGAS_DATABASE_ROUTE = vars.SAGAS_DATABASE_ROUTE;
  if (vars.SAGAS_DIRECT_DATABASE_URL === undefined) {
    delete target.SAGAS_DIRECT_DATABASE_URL;
  } else {
    target.SAGAS_DIRECT_DATABASE_URL = vars.SAGAS_DIRECT_DATABASE_URL;
  }
}
