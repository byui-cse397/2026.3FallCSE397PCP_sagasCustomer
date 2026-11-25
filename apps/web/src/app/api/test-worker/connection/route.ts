import { NextResponse } from 'next/server';
import { Client } from 'pg';

/**
 * GET /api/test-worker/connection
 *
 * The P4 test Worker's connection check (#34, the P4 proposal's section 2).
 * TEMPORARY: removed with the test Worker, before P7.
 *
 * Answers 404 unless `SAGAS_CONNECTION_CHECK` is `on`, which only the test
 * Worker's Wrangler configuration sets. It opens its own connection with the
 * deployment's `DATABASE_URL`, the way a passover write will: a query with
 * `$1` parameters. It doesn't import the read model, so it works on an empty
 * database.
 *
 * The proposal tries two routes, and so does this. `DATABASE_URL` is the
 * app's own: Hyperdrive's string when the Worker has a Hyperdrive binding
 * (`src/cloudflare/worker.ts` sets `SAGAS_DATABASE_ROUTE`), otherwise the
 * direct one. With Hyperdrive, the Worker's `DATABASE_URL` secret (Supabase's
 * transaction pooler) is still tried as `direct`, so the report shows both.
 * The status code follows the app's route.
 *
 * It reads only one other thing: which schemas hold the read model's table, and
 * how many rows each has. That shows whether the fixtures are loaded, and
 * where. It is a diagnostic, not a product read; product reads still go
 * through `packages/read-model`.
 *
 * Nothing from a connection string or from an error's message is returned,
 * because both can name the host or the user. Errors are reported as a kind and
 * a code.
 */
export async function GET() {
  if (process.env.SAGAS_CONNECTION_CHECK !== 'on') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const route = process.env.SAGAS_DATABASE_ROUTE === 'hyperdrive' ? 'hyperdrive' : 'direct';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ route, databaseUrl: 'missing', connected: false }, { status: 503 });
  }

  const app = await check(connectionString, { readModel: true });
  const directString = process.env.SAGAS_DIRECT_DATABASE_URL;
  const direct = route === 'hyperdrive' && directString ? await check(directString, { readModel: false }) : undefined;

  return NextResponse.json(
    { route, ...app, ...(direct ? { direct } : {}) },
    { status: app.connected && app.parameterized ? 200 : 502 },
  );
}

interface CheckResult {
  databaseUrl: 'set';
  tls: string;
  connected: boolean;
  parameterized?: boolean;
  /** Rows by schema; empty until the fixtures are loaded. */
  readModel?: Record<string, number>;
  /** Why the rows couldn't be counted. The connection's own result stands. */
  readModelFailure?: { kind: string; code: string | null };
  failure?: { kind: string; code: string | null };
  ms: Record<string, number | undefined>;
}

/**
 * One route: connect and run the `$1` query, which decide whether the route
 * works. Then, if asked, count the read model's rows by schema. That count is
 * a diagnostic: when it fails, the result says so in `readModelFailure` and
 * keeps the connection's own result.
 */
async function check(connectionString: string, options: { readModel: boolean }): Promise<CheckResult> {
  const tls = tlsRequested(connectionString);
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  const started = Date.now();
  let connectMs: number | undefined;

  try {
    let result: CheckResult;
    try {
      await client.connect();
      connectMs = Date.now() - started;

      const queryStarted = Date.now();
      const echo = await client.query<{ word: string; answer: number }>(
        'SELECT $1::text AS word, $2::int + 1 AS answer',
        ['sagas', 41],
      );
      const row = echo.rows[0];
      result = {
        databaseUrl: 'set',
        tls,
        connected: true,
        parameterized: row?.word === 'sagas' && row.answer === 42,
        ms: { connect: connectMs, query: Date.now() - queryStarted },
      };
    } catch (error) {
      return {
        databaseUrl: 'set',
        tls,
        connected: connectMs !== undefined,
        failure: describeFailure(error),
        ms: { connect: connectMs, total: Date.now() - started },
      };
    }

    if (!options.readModel) return result;
    try {
      return { ...result, readModel: await countReadModel(client) };
    } catch (error) {
      return { ...result, readModelFailure: describeFailure(error) };
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Which schemas hold the read model's table, and how many rows each has. */
async function countReadModel(client: Client): Promise<Record<string, number>> {
  const tables = await client.query<{ schema: string }>(
    'SELECT table_schema AS schema FROM information_schema.tables WHERE table_name = $1 ORDER BY 1',
    ['experience_read_model'],
  );
  const readModel: Record<string, number> = {};
  for (const { schema } of tables.rows) {
    const name = `${client.escapeIdentifier(schema)}.experience_read_model`;
    const count = await client.query<{ rows: number }>(
      `SELECT count(*)::int AS rows FROM ${name} WHERE position >= $1`,
      [0],
    );
    readModel[schema] = count.rows[0]?.rows ?? 0;
  }
  return readModel;
}

/** The `sslmode` the string asks for. The mode is not secret; the rest of the string is. */
function tlsRequested(connectionString: string): string {
  try {
    return new URL(connectionString).searchParams.get('sslmode') ?? 'not set';
  } catch {
    return 'unreadable';
  }
}

/** A kind and a code, never the message, which can name the host or the user. */
function describeFailure(error: unknown): { kind: string; code: string | null } {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  const message = error instanceof Error ? error.message : String(error);

  if (/certificate|not trusted|self.signed/i.test(message)) return { kind: 'tls-certificate', code };
  if (/TLS|SSL/i.test(message)) return { kind: 'tls', code };
  // How a Worker reports a TLS handshake it refused, such as a certificate
  // that doesn't chain to a public root: the socket closes before Postgres
  // answers.
  if (/terminated unexpectedly/i.test(message)) return { kind: 'closed-while-connecting', code };
  if (code === '28P01' || code === '28000') return { kind: 'authentication', code };
  if (/timeout|timed out/i.test(message)) return { kind: 'timeout', code };
  if (code !== null && /^[0-9A-Z]{5}$/.test(code)) return { kind: 'database', code };
  return { kind: 'network', code };
}
