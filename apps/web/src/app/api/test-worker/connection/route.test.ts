import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** How the next `pg` Client the route opens behaves, query by query. */
interface FakeClient {
  connect: () => Promise<void>;
  queries: ((sql: string) => Promise<{ rows: unknown[] }>)[];
}

const { clients } = vi.hoisted(() => ({ clients: [] as FakeClient[] }));

vi.mock('pg', () => ({
  Client: class {
    private readonly fake = clients.shift();
    connect() {
      return this.fake?.connect() ?? Promise.reject(new Error('no fake client left'));
    }
    query(sql: string) {
      const next = this.fake?.queries.shift();
      return next ? next(sql) : Promise.reject(new Error('unexpected query'));
    }
    end() {
      return Promise.resolve();
    }
    escapeIdentifier(name: string) {
      return `"${name}"`;
    }
  },
}));

const echo = () => Promise.resolve({ rows: [{ word: 'sagas', answer: 42 }] });
const schemas = () => Promise.resolve({ rows: [{ schema: 'public' }] });
const missingColumn = () =>
  Promise.reject(Object.assign(new Error('column "position" does not exist'), { code: '42703' }));
// How a Worker reports a certificate it won't trust.
const refusedTls: FakeClient = {
  connect: () => Promise.reject(new Error('Connection terminated unexpectedly')),
  queries: [],
};

const saved = { ...process.env };

beforeEach(() => {
  clients.length = 0;
  process.env.SAGAS_CONNECTION_CHECK = 'on';
  process.env.SAGAS_DATABASE_ROUTE = 'hyperdrive';
  process.env.DATABASE_URL = 'postgresql://user:pass@abc.hyperdrive.local:5432/postgres';
  process.env.SAGAS_DIRECT_DATABASE_URL = 'postgresql://user:pass@pooler.example.com:6543/postgres?sslmode=verify-full';
});

afterEach(() => {
  for (const key of ['SAGAS_CONNECTION_CHECK', 'SAGAS_DATABASE_ROUTE', 'DATABASE_URL', 'SAGAS_DIRECT_DATABASE_URL']) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function get() {
  const { GET } = await import('./route');
  const response = await GET();
  return { status: response.status, body: (await response.json()) as unknown };
}

describe('the connection check', () => {
  it('keeps a passing connection when counting the read model fails afterwards', async () => {
    clients.push({ connect: () => Promise.resolve(), queries: [echo, schemas, missingColumn] }, refusedTls);

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body).toMatchObject({
      route: 'hyperdrive',
      connected: true,
      parameterized: true,
      readModelFailure: { kind: 'database', code: '42703' },
      direct: { connected: false, failure: { kind: 'closed-while-connecting' } },
    });
    expect(body).not.toHaveProperty('readModel');
    expect(body).not.toHaveProperty('failure');
    // Error messages can name the host or the user, so none is returned.
    expect(JSON.stringify(body)).not.toContain('position');
  });

  it('counts the read model by schema when it can', async () => {
    clients.push(
      {
        connect: () => Promise.resolve(),
        queries: [echo, schemas, () => Promise.resolve({ rows: [{ rows: 24 }] })],
      },
      refusedTls,
    );

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body).toMatchObject({ connected: true, parameterized: true, readModel: { public: 24 } });
    expect(body).not.toHaveProperty('readModelFailure');
  });

  it('fails the route when the $1 query itself fails', async () => {
    clients.push({ connect: () => Promise.resolve(), queries: [missingColumn] }, refusedTls);

    const { status, body } = await get();

    expect(status).toBe(502);
    expect(body).toMatchObject({ connected: true, failure: { kind: 'database', code: '42703' } });
    expect(body).not.toHaveProperty('parameterized');
  });
});
