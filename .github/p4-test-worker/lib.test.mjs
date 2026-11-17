// Tests for lib.mjs: node --test .github/p4-test-worker/lib.test.mjs
// The workflow runs them before it deploys anything.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  collectCpu,
  connectionStatus,
  decide,
  devPageProblem,
  fixturesStatus,
  fromTail,
  fromWorkersLog,
  isComplete,
  matchRun,
  percentile,
  queryWorkersLogs,
  renderReport,
  splitJsonObjects,
  summariseRoute,
  termsPageProblem,
} from './lib.mjs';

const T0 = 1_800_000_000_000;
const SCRIPT = 'sagas-app-test';
const VERSION = 'v-live';
const BASE = 'https://sagas-app-test.example.workers.dev';

/** n requests to one path, a second apart, with Ray IDs r0, r1, ... */
function requests(n, path = '/api/sites', route = '/api/sites', offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    route,
    i,
    path,
    at: T0 + (offset + i) * 1000,
    rayId: `r${offset + i}`,
    problem: null,
  }));
}

/** A Workers Logs event for one request. */
function logEvent({ ray, path = '/api/sites', at, cpu = 2, version = VERSION, script = SCRIPT, outcome = 'ok', id }) {
  return {
    timestamp: at,
    $metadata: { id: id ?? `ev-${ray}`, requestId: `req-${id ?? ray}`, rayId: `${ray}-SEA`, type: 'cf-worker-event' },
    $workers: {
      scriptName: script,
      scriptVersion: { id: version },
      cpuTimeMs: cpu,
      wallTimeMs: cpu + 20,
      outcome,
      event: { request: { url: `${BASE}${path}` } },
    },
  };
}

function eventsFor(reqs, overrides = {}) {
  return reqs.map((r) => logEvent({ ray: r.rayId, path: r.path, at: r.at + 50, ...overrides }));
}

const window = (reqs) => ({ from: reqs[0]?.at ?? T0, to: (reqs.at(-1)?.at ?? T0) + 1000 });

function run(reqs) {
  return { requests: reqs, scriptName: SCRIPT, versionId: VERSION, ...window(reqs) };
}

describe('matchRun', () => {
  it('matches every request to its own record by Ray ID', () => {
    const reqs = requests(100);
    const match = matchRun({ ...run(reqs), invocations: eventsFor(reqs).map(fromWorkersLog) });
    assert.equal(match.matches.size, 100);
    assert.equal(isComplete(match, reqs), true);
  });

  it('ignores records from another Worker, another version, or outside the run', () => {
    const reqs = requests(10);
    const unrelated = [
      logEvent({ ray: 'r1', at: reqs[1].at + 10, script: 'sagas-landing', id: 'x1', cpu: 50 }),
      logEvent({ ray: 'r2', at: reqs[2].at + 10, version: 'v-before-the-secret', id: 'x2', cpu: 50 }),
      logEvent({ ray: 'r3', at: T0 - 3_600_000, id: 'x3', cpu: 50 }),
      logEvent({ ray: 'bot', path: '/wp-login.php', at: reqs[4].at + 10, cpu: 50 }),
    ];
    const invocations = [...unrelated, ...eventsFor(reqs)].map(fromWorkersLog);
    const match = matchRun({ ...run(reqs), invocations });
    assert.equal(match.matches.size, 10);
    for (const request of reqs) assert.equal(match.matches.get(request).cpuMs, 2);
  });

  it('counts a record that arrives twice once', () => {
    const reqs = requests(5);
    const events = eventsFor(reqs);
    const match = matchRun({ ...run(reqs), invocations: [...events, ...events].map(fromWorkersLog) });
    assert.equal(match.tied, 5);
    assert.equal(match.matches.size, 5);
  });

  it('accepts no record without the request\'s own Ray ID, however the counts line up', () => {
    const reqs = requests(400);
    // 400 records for the same URLs, at the same times, from this Worker and
    // version, but triggered by other requests.
    const foreign = eventsFor(reqs).map((e, i) => {
      e.$metadata.rayId = `elsewhere${i}-SEA`;
      e.$metadata.requestId = `req-elsewhere-${i}`;
      return e;
    });
    const match = matchRun({ ...run(reqs), invocations: foreign.map(fromWorkersLog) });
    assert.equal(match.tied, 400);
    assert.equal(match.matches.size, 0);
    assert.equal(isComplete(match, reqs), false);
  });

  it('leaves a request unmatched when its record has no Ray ID', () => {
    const reqs = requests(3);
    const events = eventsFor(reqs);
    delete events[1].$metadata.rayId;
    const match = matchRun({ ...run(reqs), invocations: events.map(fromWorkersLog) });
    assert.equal(match.matches.size, 2);
    assert.equal(match.matches.has(reqs[1]), false);
  });

  it('trusts neither of two different records that claim the same Ray ID', () => {
    const reqs = requests(2);
    const events = eventsFor(reqs);
    const impostor = logEvent({ ray: 'r0', at: reqs[0].at + 70, id: 'other-invocation', cpu: 1 });
    const match = matchRun({ ...run(reqs), invocations: [...events, impostor].map(fromWorkersLog) });
    assert.equal(match.matches.has(reqs[0]), false);
    assert.equal(match.matches.has(reqs[1]), true);
  });
});

describe('summariseRoute and decide', () => {
  const connected = { connection: 'passes', fixtures: 'loaded' };

  function routeWith(reqs, match) {
    return { key: '/api/sites', requests: reqs.length, expected: reqs.length, problems: {}, cpu: summariseRoute(reqs, match.matches) };
  }

  it('is Rule 4 only when every request has a record and the p99 is under target', () => {
    const reqs = requests(100);
    const match = matchRun({ ...run(reqs), invocations: eventsFor(reqs).map(fromWorkersLog) });
    const route = routeWith(reqs, match);
    assert.equal(route.cpu.complete, true);
    assert.equal(route.cpu.rest, 99);
    assert.match(decide({ ...connected, routes: [route], cpuComplete: true }), /Rule 4/);
  });

  it('decides nothing from partial logs (8 records for 400 requests)', () => {
    const reqs = [
      ...requests(100, '/', '/', 0),
      ...requests(100, '/api/sites', '/api/sites', 100),
      ...requests(100, '/api/sites/freight-depot', '/api/sites/freight-depot', 200),
      ...requests(100, '/dev?site=freight-depot&state=t0', '/dev', 300),
    ];
    const some = eventsFor(reqs.filter((_, i) => i % 50 === 0));
    assert.equal(some.length, 8);
    const match = matchRun({ ...run(reqs), invocations: some.map(fromWorkersLog) });
    const routes = ['/', '/api/sites', '/api/sites/freight-depot', '/dev'].map((key) => {
      const mine = reqs.filter((r) => r.route === key);
      return { key, requests: mine.length, expected: mine.length, problems: {}, cpu: summariseRoute(mine, match.matches) };
    });
    assert.ok(routes.every((r) => r.cpu.complete === false));
    const rule = decide({ ...connected, routes, cpuComplete: false });
    assert.doesNotMatch(rule, /Rule 4|Rule 5/);
    assert.match(rule, /Not decided: CPU incomplete/);
  });

  it('decides nothing from empty logs', () => {
    const reqs = requests(100);
    const match = matchRun({ ...run(reqs), invocations: [] });
    const rule = decide({ ...connected, routes: [routeWith(reqs, match)], cpuComplete: false });
    assert.doesNotMatch(rule, /Rule 4|Rule 5/);
  });

  it('is Rule 5 for an exceededCpu outcome or a p99 at or over 8 ms', () => {
    const reqs = requests(100);
    const exceeded = eventsFor(reqs);
    exceeded[40].$workers.outcome = 'exceededCpu';
    const m1 = matchRun({ ...run(reqs), invocations: exceeded.map(fromWorkersLog) });
    assert.match(decide({ ...connected, routes: [routeWith(reqs, m1)], cpuComplete: true }), /Rule 5.*exceededCpu/s);

    const slow = eventsFor(reqs, { cpu: 9 });
    const m2 = matchRun({ ...run(reqs), invocations: slow.map(fromWorkersLog) });
    assert.match(decide({ ...connected, routes: [routeWith(reqs, m2)], cpuComplete: true }), /Rule 5.*8 ms/s);
  });

  it('decides nothing when no route was requested (REQUESTS=0)', () => {
    const rule = decide({ ...connected, routes: [], cpuComplete: true });
    assert.doesNotMatch(rule, /Rule 4|Rule 5/);
    assert.match(rule, /no routes measured/);
    assert.equal(isComplete({ matches: new Map() }, []), false);
  });

  it('puts the connection and the fixtures before any CPU verdict', () => {
    assert.match(decide({ connection: 'pending', fixtures: 'empty', routes: [], cpuComplete: false }), /Rule 2/);
    assert.match(decide({ connection: 'fails', fixtures: 'empty', routes: [], cpuComplete: false }), /Rule 1/);
    assert.match(decide({ connection: 'passes', fixtures: 'empty', routes: [], cpuComplete: false }), /pages and CPU pending/);
  });
});

describe('connectionStatus', () => {
  const ok = { databaseUrl: 'set', connected: true, parameterized: true, readModel: {}, ms: { connect: 3, query: 1 } };
  const refused = { databaseUrl: 'set', connected: false, failure: { kind: 'closed-while-connecting', code: null }, ms: {} };

  it("passes when the app's route passes, whether or not direct does", () => {
    assert.equal(connectionStatus({ route: 'hyperdrive', ...ok, direct: refused }), 'passes');
    assert.equal(connectionStatus({ route: 'direct', ...ok }), 'passes');
  });

  it('fails only when Hyperdrive and direct were both set up, checked and refused', () => {
    assert.equal(connectionStatus({ route: 'hyperdrive', ...refused, direct: refused }), 'fails');
  });

  it('is pending while a route is missing, or only the route the app does not use connects', () => {
    assert.equal(connectionStatus({ route: 'direct', ...refused }), 'pending'); // Hyperdrive not set up
    assert.equal(connectionStatus({ route: 'hyperdrive', ...refused }), 'pending'); // no direct secret
    assert.equal(connectionStatus({ route: 'hyperdrive', ...refused, direct: ok }), 'pending');
    assert.equal(connectionStatus({ route: 'hyperdrive', ...ok, parameterized: false, direct: refused }), 'fails');
    assert.equal(connectionStatus(null), 'pending');
    assert.equal(connectionStatus({ route: 'hyperdrive', databaseUrl: 'missing', connected: false }), 'pending');
    // An answer from before this change has no route: it was the direct one.
    assert.equal(connectionStatus({ ...refused }), 'pending');
  });

  it('reports both routes, and why the direct one failed', () => {
    const base = {
      tested: 'abc123',
      certificate: 'Verify return code: 19 (self-signed certificate in certificate chain)',
      cpu: { complete: false, notes: [] },
      routes: [],
      requestsPerRoute: 100,
      host: 'sagas-app-test.example.workers.dev',
      startedAt: T0,
      finishedAt: T0 + 1000,
      rule: 'x',
    };
    const report = renderReport({
      ...base,
      connection: { last: { route: 'hyperdrive', ...ok, readModel: { public: 24 }, direct: { ...refused, tls: 'verify-full' } } },
    });
    assert.match(report, /Connection: Hyperdrive, the app's route \| \*\*Passes\.\*\*.*24 rows in `public`/);
    assert.match(report, /Connection: direct \| \*\*Failed:\*\* closed-while-connecting\. The database's certificate doesn't chain/);
    assert.match(report, /sslmode=verify-full/);
    assert.doesNotMatch(report, /pending|fails\*\*/);

    const failed = renderReport({ ...base, connection: { last: { route: 'hyperdrive', ...refused, direct: refused } } });
    assert.match(failed, /connection \*\*fails\*\*/);
    const missing = renderReport({ ...base, connection: { last: { route: 'direct', ...refused } } });
    assert.match(missing, /Hyperdrive: not set up/);
    assert.match(missing, /connection is \*\*pending\*\*/);
  });
});

describe('collectCpu', () => {
  const noWait = () => Promise.resolve();

  it('keeps polling while logs arrive, and stops when every request has a record', async () => {
    const reqs = requests(10);
    const all = eventsFor(reqs).map(fromWorkersLog);
    let polls = 0;
    const result = await collectCpu({
      run: run(reqs),
      readLogs: async () => ({ invocations: all.slice(0, ++polls * 4) }),
      readTail: () => ({ problem: 'not used' }),
      wait: noWait,
    });
    assert.equal(result.complete, true);
    assert.equal(result.source, 'Workers Logs');
    assert.equal(polls, 3);
  });

  it('falls back to tail when the logs stay partial', async () => {
    const reqs = requests(10);
    const tailEvents = reqs.map((r) => ({
      scriptName: SCRIPT,
      eventTimestamp: r.at + 50,
      cpuTime: 3,
      wallTime: 20,
      outcome: 'ok',
      event: { request: { url: `${BASE}${r.path}`, headers: { 'cf-ray': `${r.rayId}-SEA` } } },
    }));
    const result = await collectCpu({
      run: run(reqs),
      readLogs: async () => ({ invocations: eventsFor(reqs.slice(0, 3)).map(fromWorkersLog) }),
      readTail: () => ({ invocations: tailEvents.map(fromTail) }),
      polls: 2,
      wait: noWait,
    });
    assert.equal(result.complete, true);
    assert.equal(result.source, 'wrangler tail');
    assert.match(result.notes.join(' '), /3 of 10/);
  });

  it('calls zero requests incomplete, not complete', async () => {
    const result = await collectCpu({
      run: run([]),
      readLogs: async () => ({ invocations: [] }),
      readTail: () => ({ invocations: [] }),
      polls: 1,
      wait: noWait,
    });
    assert.equal(result.complete, false);
  });

  it('survives a telemetry request that fails, tries tail, and reports incomplete', async () => {
    const reqs = requests(10);
    const failingFetch = () => Promise.reject(new TypeError('fetch failed'));
    const result = await collectCpu({
      run: run(reqs),
      readLogs: () =>
        queryWorkersLogs({ fetchImpl: failingFetch, apiBase: 'https://api.invalid', account: 'a', token: 't', scriptName: SCRIPT, from: 0, to: 1 }),
      readTail: () => ({ problem: 'wrangler tail: 12 events, none with CPU time' }),
      wait: noWait,
    });
    assert.equal(result.complete, false);
    assert.match(result.notes.join(' '), /request failed \(TypeError\)/);
    assert.match(result.notes.join(' '), /none with CPU time/);
  });
});

describe('queryWorkersLogs', () => {
  it('reports a refusal with its Cloudflare error codes, never throwing', async () => {
    const refusing = async () =>
      new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), { status: 403 });
    const result = await queryWorkersLogs({ fetchImpl: refusing, apiBase: 'x', account: 'a', token: 't', scriptName: SCRIPT, from: 0, to: 1 });
    assert.equal(result.problem, 'Workers Logs: HTTP 403, Cloudflare error codes 10000');
  });

  it('pages through the results', async () => {
    const reqs = requests(250);
    const events = eventsFor(reqs);
    const bodies = [];
    const paging = async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const start = body.offset ? events.findIndex((e) => e.$metadata.id === body.offset) + 1 : 0;
      const page = events.slice(start, start + body.limit);
      return new Response(JSON.stringify({ success: true, result: { events: { events: page } } }));
    };
    const result = await queryWorkersLogs({ fetchImpl: paging, apiBase: 'x', account: 'a', token: 't', scriptName: SCRIPT, from: 0, to: 1 });
    assert.equal(result.invocations.length, 250);
    assert.equal(bodies.length, 3);
    assert.equal(bodies[1].offsetDirection, 'next');
  });
});

describe('devPageProblem', () => {
  const fixtures = {
    siteName: 'The Freight Depot',
    recordIds: [['rec-fd-01', 'rec-fd-02'], ['rec-fd-01', 'rec-fd-02', 'rec-fd-03'], ['rec-fd-01', 'rec-fd-02', 'rec-fd-03'], ['rec-fd-01', 'rec-fd-02', 'rec-fd-03', 'rec-fd-10']],
  };
  const page = (state, ids) =>
    `<h1>The Freight Depot</h1><span>Viewing <!-- -->t${state}</span><script>self.__next_f.push([1,"${ids.map((id) => `\\"${id}\\"`).join(',')}"])</script>`;

  it('passes the right state', () => {
    assert.equal(devPageProblem(page(1, fixtures.recordIds[1]), 1, fixtures), null);
  });

  it('fails a page built from a later state', () => {
    assert.match(devPageProblem(page(0, fixtures.recordIds[3]), 0, fixtures), /later state/);
  });

  it('fails a page built from an earlier state', () => {
    assert.match(devPageProblem(page(3, fixtures.recordIds[0]), 3, fixtures), /missing/);
  });

  it('does not take rec-fd-1 for rec-fd-10', () => {
    const ids = { siteName: 'The Freight Depot', recordIds: [['rec-fd-1'], ['rec-fd-1', 'rec-fd-10']] };
    assert.equal(devPageProblem(page(0, ['rec-fd-1']), 0, ids), null);
    assert.match(devPageProblem(page(0, ['rec-fd-10']), 0, ids), /missing/);
  });
});

describe('helpers', () => {
  it('splits the indented JSON wrangler tail prints, braces inside strings included', () => {
    const text = `${JSON.stringify({ a: '{not a brace}' }, null, 4)}\nnoise\n${JSON.stringify({ b: 2 }, null, 4)}`;
    assert.deepEqual(splitJsonObjects(text), [{ a: '{not a brace}' }, { b: 2 }]);
  });

  it('takes the nearest-rank percentile', () => {
    const values = Array.from({ length: 99 }, (_, i) => i + 1);
    assert.equal(percentile(values, 99), 99);
    assert.equal(percentile(values, 50), 50);
    assert.equal(percentile([], 99), null);
  });
});

describe('a failed read-model count', () => {
  // What the connection check returns when Hyperdrive connects and runs the
  // $1 query, the count then fails on a missing column, and direct is refused.
  const answer = {
    route: 'hyperdrive',
    databaseUrl: 'set',
    tls: 'not set',
    connected: true,
    parameterized: true,
    ms: { connect: 4, query: 2 },
    readModelFailure: { kind: 'database', code: '42703' },
    direct: { databaseUrl: 'set', tls: 'verify-full', connected: false, failure: { kind: 'closed-while-connecting', code: null }, ms: {} },
  };

  it('leaves the connection passing, and only the fixtures unknown', () => {
    assert.equal(connectionStatus(answer), 'passes');
    assert.equal(fixturesStatus(answer), 'unknown');
    const rule = decide({ connection: 'passes', fixtures: 'unknown', routes: [], cpuComplete: false });
    assert.match(rule, /Connection passes; pages and CPU pending/);
    assert.match(rule, /couldn't be counted/);
    assert.doesNotMatch(rule, /Rule 1|Render/);
  });

  it('is reported beside the passing connection', () => {
    const report = renderReport({
      tested: 'abc123',
      certificate: 'Verify return code: 19 (self-signed certificate in certificate chain)',
      cpu: { complete: false, notes: [] },
      routes: [],
      requestsPerRoute: 100,
      host: 'sagas-app-test.example.workers.dev',
      startedAt: T0,
      finishedAt: T0 + 1000,
      rule: 'x',
      connection: { last: answer },
    });
    assert.match(report, /Hyperdrive, the app's route \| \*\*Passes\.\*\*.*count failed, database \(code 42703\); the connection result above stands/);
    assert.doesNotMatch(report, /connection \*\*fails\*\*/);
  });

  it('tells loaded, empty and unknown apart', () => {
    assert.equal(fixturesStatus({ readModel: { public: 24, sagas: 0 } }), 'loaded');
    assert.equal(fixturesStatus({ readModel: { public: 0 } }), 'empty');
    assert.equal(fixturesStatus({ readModel: {} }), 'empty');
    assert.equal(fixturesStatus(null), 'empty');
  });
});

describe('termsPageProblem', () => {
  const markdown = readFileSync(new URL('../../docs/TERMS.md', import.meta.url), 'utf8');
  const escape = (text) => text.replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('"', '&quot;');
  /** The document as the page shows it, one element per line, the way @sagas/terms renders it. */
  const article = (source) =>
    source
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        const html = escape(heading ? heading[2] : line).replace(/`([^`]+)`/g, '<code>$1</code>');
        return heading ? `<h${heading[1].length}>${html}</h${heading[1].length}>` : `<p>${html}</p>`;
      })
      .join('\n');
  // Next.js repeats the content in its script payload.
  const page = (body) =>
    `<html><head><title>Contributor terms · Sagas</title></head><body><main>${body}</main>` +
    `<script>self.__next_f.push([1,${JSON.stringify(markdown)}])</script></body></html>`;

  it('passes the page that shows the whole document', () => {
    assert.equal(termsPageProblem(page(article(markdown)), markdown), null);
  });

  it('fails a page whose text is only in the script payload, such as an error page', () => {
    assert.match(termsPageProblem(page('<h1>Internal Server Error</h1>'), markdown), /heading missing/);
  });

  it('fails a missing heading, headings out of order, and another version', () => {
    const headings = [...markdown.matchAll(/^#{1,6}\s+.+$/gm)].map((m) => m[0]);
    assert.ok(headings.length > 2);
    const without = markdown.replace(headings[2], '');
    assert.match(termsPageProblem(page(article(without)), markdown), /heading missing or out of order/);
    const swapped = markdown.replace(headings[1], 'SWAP').replace(headings[2], headings[1]).replace('SWAP', headings[2]);
    assert.match(termsPageProblem(page(article(swapped)), markdown), /out of order/);
    const older = markdown.replace(/^Version `[^`]+`/m, 'Version `provisional-0.1`');
    assert.match(termsPageProblem(page(article(older)), markdown), /not version/);
  });
});
