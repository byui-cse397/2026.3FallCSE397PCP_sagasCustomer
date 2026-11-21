import { describe, expect, it } from 'vitest';
import type { WarmClient } from './warm';
import { hyperdriveString, warm, WARM_QUERY, WarmError } from './warm';

const HYPERDRIVE_STRING = 'postgresql://hd-user:hd-pass@abc.hyperdrive.local:5432/postgres';
const env = { HYPERDRIVE: { connectionString: HYPERDRIVE_STRING } };

/** A stand-in for pg's Client that records what it was asked to do. */
function fakeClient(options: { failOn?: string; error?: Error; row?: unknown } = {}) {
  const calls: string[] = [];
  const strings: string[] = [];
  const answer = <T>(step: string, value: T): Promise<T> =>
    options.failOn === step
      ? Promise.reject(options.error ?? new Error(`failed at ${step}`))
      : Promise.resolve(value);
  const client: WarmClient = {
    connect: () => {
      calls.push('connect');
      return answer('connect', undefined);
    },
    query: (text: string) => {
      const step = text === WARM_QUERY ? 'WARM_QUERY' : text;
      calls.push(step);
      const row = 'row' in options ? options.row : { at: new Date('2026-11-21T06:17:00.123Z'), tables: 7 };
      return answer(step, { rows: text === WARM_QUERY ? [row] : [] });
    },
    end: () => {
      calls.push('end');
      return Promise.resolve();
    },
  };
  const connect = (connectionString: string) => {
    strings.push(connectionString);
    return client;
  };
  return { calls, strings, connect };
}

describe('the query', () => {
  it('only reads', () => {
    expect(WARM_QUERY).toMatch(/^SELECT /);
    expect(WARM_QUERY).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|COPY|CALL)\b/i);
  });

  it('uses now(), so Hyperdrive never answers it from a cache', () => {
    expect(WARM_QUERY).toMatch(/\bnow\(\)/i);
  });

  it("depends on no layer's tables, only Postgres's catalog", () => {
    expect(WARM_QUERY).toMatch(/FROM pg_catalog\.pg_tables/);
  });
});

describe('hyperdriveString', () => {
  it("reads the binding's string", () => {
    expect(hyperdriveString(env)).toBe(HYPERDRIVE_STRING);
  });

  it('reads the string through a getter, as a real binding has it', () => {
    class Binding {
      get connectionString() {
        return HYPERDRIVE_STRING;
      }
    }
    expect(hyperdriveString({ HYPERDRIVE: new Binding() })).toBe(HYPERDRIVE_STRING);
  });

  it('gives null without a usable binding', () => {
    expect(hyperdriveString({})).toBeNull();
    expect(hyperdriveString({ HYPERDRIVE: {} })).toBeNull();
    expect(hyperdriveString({ HYPERDRIVE: { connectionString: '' } })).toBeNull();
    expect(hyperdriveString({ HYPERDRIVE: 'not a binding' })).toBeNull();
    expect(hyperdriveString({ DATABASE_URL: 'postgresql://elsewhere/db' })).toBeNull();
  });
});

describe('warm', () => {
  it("connects with Hyperdrive's string and reads inside a read-only transaction", async () => {
    const fake = fakeClient();
    let now = 1_000;
    const result = await warm(env, fake.connect, () => (now += 40));

    expect(fake.strings).toEqual([HYPERDRIVE_STRING]);
    expect(fake.calls).toEqual(['connect', 'BEGIN READ ONLY', 'WARM_QUERY', 'COMMIT', 'end']);
    expect(result).toEqual({ at: '2026-11-21T06:17:00.123Z', tables: 7, ms: 40 });
  });

  it('accepts the time as text too', async () => {
    const fake = fakeClient({ row: { at: '2026-11-21 06:17:00.123+00', tables: 0 } });
    const result = await warm(env, fake.connect);
    expect(result.at).toBe('2026-11-21T06:17:00.123Z');
    expect(result.tables).toBe(0);
  });

  it('refuses to run without a Hyperdrive binding, and never falls back to another string', async () => {
    const fake = fakeClient();
    await expect(warm({ DATABASE_URL: 'postgresql://elsewhere/db' }, fake.connect)).rejects.toMatchObject({
      kind: 'no-hyperdrive',
    });
    expect(fake.calls).toEqual([]);
  });

  it.each(['connect', 'BEGIN READ ONLY', 'WARM_QUERY', 'COMMIT'])(
    'closes the connection when %s fails, and reports the run as failed',
    async (step) => {
      const fake = fakeClient({ failOn: step });
      await expect(warm(env, fake.connect)).rejects.toBeInstanceOf(WarmError);
      expect(fake.calls.at(-1)).toBe('end');
      expect(fake.calls.filter((c) => c === 'end')).toHaveLength(1);
    },
  );

  it('treats an unexpected row as a failure', async () => {
    for (const row of [undefined, null, { at: 'not a time', tables: 3 }, { at: new Date(), tables: '3' }, {}]) {
      const fake = fakeClient({ row });
      await expect(warm(env, fake.connect)).rejects.toMatchObject({ kind: 'unexpected-row' });
    }
  });

  it('never repeats the connection string or the original message', async () => {
    const leaky = Object.assign(
      new Error(`password authentication failed for user "hd-user" at ${HYPERDRIVE_STRING}`),
      { code: '28P01' },
    );
    const fake = fakeClient({ failOn: 'connect', error: leaky });
    const failure = await warm(env, fake.connect).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(WarmError);
    expect(failure).toMatchObject({ kind: 'authentication', code: '28P01' });
    const text = String((failure as WarmError).message);
    expect(text).not.toContain('hd-user');
    expect(text).not.toContain('hd-pass');
    expect(text).not.toContain('hyperdrive.local');
  });
});

describe('WarmError.from', () => {
  it('sorts failures into kinds a reader can act on', () => {
    expect(WarmError.from(Object.assign(new Error('x'), { code: '28P01' }))).toMatchObject({ kind: 'authentication' });
    expect(WarmError.from(Object.assign(new Error('x'), { code: '25006' }))).toMatchObject({
      kind: 'database',
      code: '25006',
    });
    expect(WarmError.from(new Error('Connection terminated due to connection timeout'))).toMatchObject({
      kind: 'timeout',
    });
    expect(WarmError.from(new Error('Connection terminated unexpectedly'))).toMatchObject({ kind: 'network' });
    expect(WarmError.from('a string')).toMatchObject({ kind: 'network', code: null });
  });

  it('gives a hint for each kind', () => {
    expect(new WarmError('network').hint).toMatch(/paused/);
    expect(new WarmError('authentication').hint).toMatch(/password/);
    expect(new WarmError('no-hyperdrive').hint).toMatch(/HYPERDRIVE/);
    expect(new WarmError('database', '42P01').hint).toMatch(/README/);
  });
});
