import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HYPERDRIVE_STRING = 'postgresql://hd-user:hd-pass@abc.hyperdrive.local:5432/postgres';
const controller = { cron: '17 */6 * * *', scheduledTime: Date.parse('2026-11-21T06:17:00Z') };

// pg's Client, replaced so no test needs a database. `behaviour` decides how
// the next client answers.
const behaviour = { fail: false };
const made: { connectionString: string; queries: string[]; ended: boolean }[] = [];
vi.mock('pg', () => ({
  Client: class {
    private readonly record: (typeof made)[number];
    constructor(config: { connectionString: string }) {
      this.record = { connectionString: config.connectionString, queries: [], ended: false };
      made.push(this.record);
    }
    connect() {
      return behaviour.fail
        ? Promise.reject(Object.assign(new Error(`no route to ${HYPERDRIVE_STRING}`), { code: 'ECONNREFUSED' }))
        : Promise.resolve();
    }
    query(text: string) {
      this.record.queries.push(text);
      return Promise.resolve({ rows: [{ at: new Date('2026-11-21T06:17:01Z'), tables: 4 }] });
    }
    end() {
      this.record.ended = true;
      return Promise.resolve();
    }
  },
}));

describe('the Worker', () => {
  const logs: string[] = [];
  const errors: string[] = [];

  beforeEach(() => {
    made.length = 0;
    logs.length = 0;
    errors.length = 0;
    behaviour.fail = false;
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(line));
    vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has a scheduled handler and no fetch handler, so nothing but the schedule can run it', async () => {
    const { default: worker } = await import('./index');
    expect(Object.keys(worker)).toEqual(['scheduled']);
  });

  it('warms through Hyperdrive and logs one line', async () => {
    const { default: worker } = await import('./index');
    await worker.scheduled(controller, { HYPERDRIVE: { connectionString: HYPERDRIVE_STRING } });

    expect(made).toHaveLength(1);
    expect(made[0]?.connectionString).toBe(HYPERDRIVE_STRING);
    expect(made[0]?.queries[0]).toBe('BEGIN READ ONLY');
    expect(made[0]?.ended).toBe(true);
    expect(logs.map((l) => JSON.parse(l) as unknown)).toEqual([
      {
        event: 'warmed',
        cron: '17 */6 * * *',
        scheduledTime: '2026-11-21T06:17:00.000Z',
        at: '2026-11-21T06:17:01.000Z',
        tables: 4,
        ms: expect.any(Number) as number,
      },
    ]);
    expect(errors).toEqual([]);
  });

  it('logs a failure without the connection string, and throws so the run shows as failed', async () => {
    behaviour.fail = true;
    const { default: worker } = await import('./index');

    await expect(
      worker.scheduled(controller, { HYPERDRIVE: { connectionString: HYPERDRIVE_STRING } }),
    ).rejects.toMatchObject({ name: 'WarmError', kind: 'network' });

    expect(made[0]?.ended).toBe(true);
    expect(logs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(JSON.parse(errors[0] ?? '')).toMatchObject({ event: 'warm-failed', kind: 'network', hint: /paused/ });
    expect(errors[0]).not.toContain('hd-pass');
    expect(errors[0]).not.toContain('hyperdrive.local');
  });
});
