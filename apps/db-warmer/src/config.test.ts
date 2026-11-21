import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** The fields of wrangler.jsonc these tests read. Wrangler itself reads the whole file in the bundle test. */
interface WarmerConfig {
  name: string;
  workers_dev?: boolean;
  preview_urls?: boolean;
  route?: unknown;
  routes?: unknown[];
  compatibility_flags?: string[];
  triggers?: { crons?: string[] };
  hyperdrive?: { binding: string; id: string }[];
  observability?: { enabled?: boolean };
}

const root = join(import.meta.dirname, '..');
const configPath = join(root, 'wrangler.jsonc');
// TypeScript's own JSON reader accepts the comments and trailing commas a
// .jsonc file has.
const parsed = ts.parseConfigFileTextToJson(configPath, await readFile(configPath, 'utf8'));
if (parsed.error) throw new Error(`wrangler.jsonc: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, ' ')}`);
const config = parsed.config as WarmerConfig;
const crons = config.triggers?.crons ?? [];

describe('wrangler.jsonc', () => {
  // Without a crons list, Wrangler sends no schedule and Cloudflare keeps the
  // old one, so deleting the list would leave the warmer running. An empty
  // list is how the README turns it off for good.
  it('always lists its crons, so a deploy sets the schedule, even to none', () => {
    expect(Array.isArray(config.triggers?.crons)).toBe(true);
  });

  it('has at most one Cron Trigger, of the five Workers Free allows an account', () => {
    expect(crons.length).toBeLessThanOrEqual(1);
  });

  it('has no public address', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toBeUndefined();
    expect(config.route).toBeUndefined();
  });

  it("reaches the database only through the sponsor's Hyperdrive configuration", () => {
    expect(config.hyperdrive).toEqual([{ binding: 'HYPERDRIVE', id: expect.stringMatching(/^[0-9a-f]{32}$/) as string }]);
    expect(config.compatibility_flags).toContain('nodejs_compat');
  });

  it('records each run where the sponsor can see it', () => {
    expect(config.observability?.enabled).toBe(true);
  });
});

describe('README.md', () => {
  it('states the schedule the Worker actually has', async () => {
    const readme = await readFile(join(root, 'README.md'), 'utf8');
    for (const cron of crons) expect(readme).toContain(`\`${cron}\``);
  });

  it('names the Worker and the Hyperdrive configuration the dashboard shows', async () => {
    const readme = await readFile(join(root, 'README.md'), 'utf8');
    expect(readme).toContain(config.name);
    expect(readme).toContain('sagas-supabase');
  });
});

/**
 * Wrangler's command-line script, run with this Node rather than through
 * `pnpm exec`: on Windows pnpm is a `.cmd` file that `execFile` can't start.
 */
function wranglerScript(): string {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('wrangler/package.json');
  const { bin } = require(manifest) as { bin: Record<string, string> };
  const script = bin.wrangler;
  if (script === undefined) throw new Error("wrangler's package.json names no wrangler script");
  return join(dirname(manifest), script);
}

describe('the bundle', () => {
  it('builds for Cloudflare, pg included, within the Free plan size limit', async () => {
    const outdir = await mkdtemp(join(tmpdir(), 'db-warmer-'));
    try {
      await promisify(execFile)(
        process.execPath,
        [wranglerScript(), 'deploy', '--dry-run', '--outdir', outdir],
        { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '' } },
      );
      const { size } = await stat(join(outdir, 'index.js'));
      // 3 MB after compression is the Free limit; the raw size bounds it.
      expect(size).toBeLessThan(3 * 1024 * 1024);
    } finally {
      await rm(outdir, { recursive: true, force: true });
    }
  });
});
