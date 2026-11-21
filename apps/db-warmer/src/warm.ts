/**
 * One run of the database warmer (P8): a short, read-only visit to the hosted
 * database.
 *
 * Supabase pauses a Free project that shows too little database activity over
 * seven days, and only the project's owner can resume it. Supabase doesn't
 * publish which queries count, so each run sends a real one: Postgres plans
 * and runs it, reading the catalog. It doesn't depend on any layer's tables,
 * so it works before the fixtures are loaded and keeps working when a layer
 * moves its tables to another schema.
 *
 * Read-only twice over: the query only reads, and it runs inside a
 * `READ ONLY` transaction, so Postgres would refuse a write even if someone
 * later edited the query into one.
 *
 * Never served from a cache: the configuration has caching off today, and
 * `now()` keeps Hyperdrive from caching the query even if caching is turned on
 * later for the full app, which shares the configuration. A cached answer
 * would never reach the database.
 */

/** The one query each run sends. */
export const WARM_QUERY = `SELECT now() AS at, count(*)::int AS tables
FROM pg_catalog.pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`;

/** What a run reports. Nothing from the connection string or the database's data. */
export interface WarmResult {
  /** The database's own clock when the query ran. */
  at: string;
  /** Tables outside Postgres's own schemas, across every layer. */
  tables: number;
  /** Connect, query and commit, as the Worker saw it. */
  ms: number;
}

/** What a run needs from a database client: `pg`'s `Client`, or a stand-in in tests. */
export interface WarmClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<{ rows: unknown[] }>;
  end(): Promise<unknown>;
}

export type ClientFactory = (connectionString: string) => WarmClient;

/**
 * A failed run. The message is a kind and, when Postgres gave one, its error
 * code, never the original message, which can name the host or the user.
 */
export class WarmError extends Error {
  readonly kind: string;
  readonly code: string | null;

  constructor(kind: string, code: string | null = null) {
    super(`Database warmer: ${kind}${code === null ? '' : ` (${code})`}`);
    this.name = 'WarmError';
    this.kind = kind;
    this.code = code;
  }

  /** A hint for whoever reads the log. */
  get hint(): string {
    switch (this.kind) {
      case 'no-hyperdrive':
        return 'The Worker has no HYPERDRIVE binding. Check hyperdrive in wrangler.jsonc.';
      case 'timeout':
      case 'network':
        return 'Is the Supabase project paused? Only its owner can resume it.';
      case 'authentication':
        return "The Hyperdrive configuration's password may be out of date.";
      default:
        return 'See README.md, "When a run fails".';
    }
  }

  static from(error: unknown): WarmError {
    if (error instanceof WarmError) return error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null;
    const message = error instanceof Error ? error.message : String(error);
    if (code === '28P01' || code === '28000') return new WarmError('authentication', code);
    if (code !== null && /^[0-9A-Z]{5}$/.test(code)) return new WarmError('database', code);
    if (/timeout|timed out/i.test(message)) return new WarmError('timeout', code);
    return new WarmError('network', code);
  }
}

/** Hyperdrive's string, from the `HYPERDRIVE` binding, or `null` without one. */
export function hyperdriveString(env: Readonly<Record<string, unknown>>): string | null {
  const binding = env.HYPERDRIVE;
  if (typeof binding !== 'object' || binding === null || !('connectionString' in binding)) return null;
  const { connectionString } = binding;
  return typeof connectionString === 'string' && connectionString !== '' ? connectionString : null;
}

/**
 * Connects through Hyperdrive, runs `WARM_QUERY` in a read-only transaction,
 * and closes the connection whatever happens. Throws a `WarmError` on any
 * failure, so the run shows as failed in the dashboard.
 */
export async function warm(
  env: Readonly<Record<string, unknown>>,
  connect: ClientFactory,
  clock: () => number = Date.now,
): Promise<WarmResult> {
  const connectionString = hyperdriveString(env);
  if (connectionString === null) throw new WarmError('no-hyperdrive');

  const client = connect(connectionString);
  const started = clock();
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(WARM_QUERY);
    await client.query('COMMIT');
    return { ...readRow(rows[0]), ms: clock() - started };
  } catch (error) {
    throw WarmError.from(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** The row `WARM_QUERY` returns, checked rather than assumed. */
function readRow(row: unknown): Omit<WarmResult, 'ms'> {
  if (typeof row !== 'object' || row === null || !('at' in row) || !('tables' in row)) {
    throw new WarmError('unexpected-row');
  }
  const { at, tables } = row;
  const when = at instanceof Date ? at : typeof at === 'string' ? new Date(at) : null;
  if (when === null || Number.isNaN(when.getTime()) || typeof tables !== 'number') {
    throw new WarmError('unexpected-row');
  }
  return { at: when.toISOString(), tables };
}
