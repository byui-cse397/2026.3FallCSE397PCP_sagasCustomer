import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hyperdriveVars, setDatabaseVars } from './database-env';

const HYPERDRIVE_STRING = 'postgresql://user:pass@abc.hyperdrive.local:5432/postgres';
const DIRECT_STRING = 'postgresql://user:pass@pooler.example.com:6543/postgres?sslmode=verify-full';

describe('hyperdriveVars', () => {
  it('gives nothing without a Hyperdrive binding, so the env stays as it is', () => {
    expect(hyperdriveVars({ DATABASE_URL: DIRECT_STRING })).toBeNull();
  });

  it("gives nothing when the binding has no string, rather than an empty DATABASE_URL", () => {
    expect(hyperdriveVars({ HYPERDRIVE: {} })).toBeNull();
    expect(hyperdriveVars({ HYPERDRIVE: { connectionString: '' } })).toBeNull();
    expect(hyperdriveVars({ HYPERDRIVE: 'not a binding' })).toBeNull();
  });

  it("makes Hyperdrive's string the app's DATABASE_URL and keeps the secret only for the direct check", () => {
    expect(
      hyperdriveVars({
        HYPERDRIVE: { connectionString: HYPERDRIVE_STRING },
        DATABASE_URL: DIRECT_STRING,
      }),
    ).toEqual({
      DATABASE_URL: HYPERDRIVE_STRING,
      SAGAS_DATABASE_ROUTE: 'hyperdrive',
      SAGAS_DIRECT_DATABASE_URL: DIRECT_STRING,
    });
  });

  it('works without a direct secret, as P7 will', () => {
    expect(hyperdriveVars({ HYPERDRIVE: { connectionString: HYPERDRIVE_STRING } })).toEqual({
      DATABASE_URL: HYPERDRIVE_STRING,
      SAGAS_DATABASE_ROUTE: 'hyperdrive',
    });
  });

  it('reads the string through a getter, as a real binding has it', () => {
    class Binding {
      get connectionString() {
        return HYPERDRIVE_STRING;
      }
    }
    expect(hyperdriveVars({ HYPERDRIVE: new Binding() })?.DATABASE_URL).toBe(HYPERDRIVE_STRING);
  });
});

describe('setDatabaseVars', () => {
  it('sets the three variables, and removes a direct string the request lacks', () => {
    const target: Record<string, string | undefined> = {
      DATABASE_URL: DIRECT_STRING,
      SAGAS_DIRECT_DATABASE_URL: 'stale',
      OTHER: 'kept',
    };
    setDatabaseVars({ DATABASE_URL: HYPERDRIVE_STRING, SAGAS_DATABASE_ROUTE: 'hyperdrive' }, target);
    expect(target).toEqual({ DATABASE_URL: HYPERDRIVE_STRING, SAGAS_DATABASE_ROUTE: 'hyperdrive', OTHER: 'kept' });
  });
});

describe('the Worker entry', () => {
  const handled: { env: Readonly<Record<string, unknown>>; databaseUrl: string | undefined }[] = [];
  const saved = { ...process.env };

  beforeEach(() => {
    handled.length = 0;
    vi.resetModules();
    // OpenNext's generated handler, which doesn't exist before a build. It
    // records the env it was given and what process.env held at the time.
    vi.doMock('#open-next/worker', () => ({
      default: {
        fetch: (_request: Request, env: Readonly<Record<string, unknown>>) => {
          handled.push({ env, databaseUrl: process.env.DATABASE_URL });
          return Promise.resolve(new Response('ok'));
        },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('#open-next/worker');
    for (const key of ['DATABASE_URL', 'SAGAS_DATABASE_ROUTE', 'SAGAS_DIRECT_DATABASE_URL']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  async function entry() {
    const { default: worker } = await import('./worker');
    return worker;
  }

  it('passes requests on untouched without a Hyperdrive binding', async () => {
    const worker = await entry();
    const env = { DATABASE_URL: DIRECT_STRING, ASSETS: {} };
    await worker.fetch(new Request('https://example.test/'), env, {});
    expect(handled[0]?.env).toBe(env);
  });

  it("gives OpenNext and process.env Hyperdrive's string on every request, not only the first", async () => {
    const worker = await entry();
    const assets = {};
    const envFor = (connectionString: string) => ({
      HYPERDRIVE: { connectionString },
      DATABASE_URL: DIRECT_STRING,
      ASSETS: assets,
    });

    await worker.fetch(new Request('https://example.test/'), envFor(HYPERDRIVE_STRING), {});
    // Something else rewrites process.env between requests, as OpenNext's
    // first-request copy of the env's strings would.
    process.env.DATABASE_URL = DIRECT_STRING;
    const second = `${HYPERDRIVE_STRING}?second`;
    await worker.fetch(new Request('https://example.test/api/sites'), envFor(second), {});

    expect(handled.map((h) => h.env.DATABASE_URL)).toEqual([HYPERDRIVE_STRING, second]);
    expect(handled.map((h) => h.databaseUrl)).toEqual([HYPERDRIVE_STRING, second]);
    expect(handled[1]?.env).toMatchObject({
      SAGAS_DATABASE_ROUTE: 'hyperdrive',
      SAGAS_DIRECT_DATABASE_URL: DIRECT_STRING,
      ASSETS: assets,
    });
  });
});
