// The P4 test Worker's checks (#34, section 2 of
// apps/web/docs/proposals/P4-full-app-hosting-proposal.md). TEMPORARY: removed
// with .github/workflows/p4-test-worker.yml.
//
//   node .github/p4-test-worker/check.mjs
//
// This file does the requests and the reading. What they mean (matching CPU to
// requests, the decision rule, the report) is in lib.mjs, tested by
// lib.test.mjs.
//
// Settings, from the environment (the workflow sets them):
//
//   BASE_URL               the Worker's workers.dev address (required)
//   VERSION_ID             the live version, after the secret was installed
//   REQUESTS               requests per route: a whole number, 2 to 1000;
//                          default 100
//   OUT_DIR                where report.md and report.json go, default .
//   WORKER_NAME            default sagas-app-test
//   CLOUDFLARE_ACCOUNT_ID  for the Workers Logs query
//   CLOUDFLARE_API_TOKEN   for the Workers Logs query; never printed
//   TAIL_FILE              output of `wrangler tail --format json`, if any
//   TESTED                 one line on what was tested
//   CERTIFICATE            one line on the database's certificate chain
//   CLOUDFLARE_API_BASE    only to point the logs query at a stand-in when
//                          testing this script; defaults to Cloudflare's API
//
// It never prints the token, the connection string or an error message from
// the Worker; the connection check itself returns only kinds and codes.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  collapseSpace,
  collectCpu,
  connectionStatus,
  decide,
  devPageProblem,
  fixturesStatus,
  fromTail,
  queryWorkersLogs,
  rayIdOf,
  renderReport,
  splitJsonObjects,
  summariseRoute,
  termsPageProblem,
} from './lib.mjs';

const env = process.env;
const BASE_URL = required('BASE_URL').replace(/\/$/, '');
const REQUESTS = requestsPerRoute(env.REQUESTS ?? '100');
const OUT_DIR = env.OUT_DIR ?? '.';
const WORKER_NAME = env.WORKER_NAME ?? 'sagas-app-test';
const VERSION_ID = env.VERSION_ID || null;

// What correct responses contain, from the fixtures in this checkout.
const repo = new URL('../../', import.meta.url);
const statesIndex = readJson('packages/fixtures/states/index.json');
const siteSlugs = statesIndex.sites.map((site) => site.slug).sort();
const freightDepot = statesIndex.sites.find((site) => site.slug === 'freight-depot');
const freightDepotStates = [0, 1, 2, 3].map((i) => readJson(`packages/fixtures/states/freight-depot.t${i}.json`));
// What /dev shows for each state, in the words the sandbox renders
// (apps/web/src/app/dev/sandbox.tsx): its summary line and its records' text.
const devFixtures = {
  siteName: freightDepot.name,
  states: freightDepotStates.map((state) => ({
    summary: `${state.claims.length} claim(s) · integrity ${state.integrity.overall}/100 · ${state.eventIdsApplied.length} contributions applied`,
    recordTexts: state.records.map((record) => collapseSpace(record.text ?? '')).filter((text) => text !== ''),
  })),
};
// The seed stores the contract's GraphState, which has no `stateId` or `label`:
// those stay on the fixtures-only FixtureState (contract 2.7.0).
const { stateId: _stateId, label: _label, ...freightDepotT3 } = freightDepotStates[3];
const termsMarkdown = readFileSync(new URL('docs/TERMS.md', repo), 'utf8');

/** The routes the preview serves, each with what a correct response contains. */
const ROUTES = [
  {
    key: '/',
    path: () => '/',
    problem: async (response) => {
      const html = await textOf(response, 'text/html');
      return html.includes('<h1') && html.includes('Sagas') ? null : 'not the home page';
    },
  },
  {
    // Static: in a Worker it comes only from the cache the deploy fills.
    key: '/terms',
    path: () => '/terms',
    problem: async (response) => termsPageProblem(await textOf(response, 'text/html'), termsMarkdown),
  },
  {
    key: '/api/sites',
    path: () => '/api/sites',
    problem: async (response) => {
      const body = JSON.parse(await textOf(response, 'application/json'));
      const slugs = (body.sites ?? []).map((site) => site.slug).sort();
      return isDeepStrictEqual(slugs, siteSlugs) ? null : `sites ${slugs.join(',')}`;
    },
  },
  {
    key: '/api/sites/freight-depot',
    path: () => '/api/sites/freight-depot',
    problem: async (response) => {
      const body = JSON.parse(await textOf(response, 'application/json'));
      return isDeepStrictEqual(body, freightDepotT3) ? null : 'differs from freight-depot.t3.json';
    },
  },
  {
    key: '/dev',
    label: '`/dev`, freight depot t0–t3',
    path: (i) => `/dev?site=freight-depot&state=t${i % 4}`,
    problem: async (response, i) => devPageProblem(await textOf(response, 'text/html'), i % 4, devFixtures),
  },
];

const startedAt = Date.now();
const connection = await checkConnection();
// The routes read the fixtures from the hosted database. Until they're loaded
// (Da4), only the connection is checked, so a run still says whether a Worker
// gets through, and whether the logs can be read.
const fixtures = fixturesStatus(connection.last);
const sent = [];
if (connection.passed && fixtures === 'loaded') {
  for (const route of ROUTES) {
    sent.push(...(await requestRoute(route)));
    await sleep(2_000); // Keeps the routes apart in time, as well as by URL.
  }
}
const finishedAt = Date.now();

let cpu;
try {
  cpu = await collectCpu({
    run: { requests: sent, scriptName: WORKER_NAME, versionId: VERSION_ID, from: startedAt, to: finishedAt },
    readLogs: () =>
      env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
        ? queryWorkersLogs({
            fetchImpl: fetch,
            apiBase: env.CLOUDFLARE_API_BASE ?? 'https://api.cloudflare.com/client/v4',
            account: env.CLOUDFLARE_ACCOUNT_ID,
            token: env.CLOUDFLARE_API_TOKEN,
            scriptName: WORKER_NAME,
            from: startedAt - 60_000,
            to: finishedAt + 300_000,
          })
        : Promise.resolve({ problem: 'Workers Logs: no account ID or token' }),
    readTail,
    polls: sent.length ? 12 : 1,
    wait: () => sleep(20_000),
  });
} catch (error) {
  // Whatever goes wrong reading CPU, the responses still get reported.
  cpu = { source: null, match: null, complete: false, notes: [`CPU not read (${error?.name ?? 'error'})`] };
}

const routes = ROUTES.map((route) => {
  const requests = sent.filter((request) => request.route === route.key);
  const problems = {};
  for (const request of requests) {
    if (request.problem) problems[request.problem] = (problems[request.problem] ?? 0) + 1;
  }
  return {
    key: route.key,
    label: route.label ?? `\`${route.key}\``,
    requests: requests.length,
    expected: requests.filter((request) => request.problem === null).length,
    problems,
    cpu: summariseRoute(requests, cpu.match?.matches ?? new Map()),
  };
}).filter((route) => route.requests > 0);

const rule = decide({ connection: connection.status, fixtures, routes, cpuComplete: cpu.complete });
const markdown = renderReport({
  tested: env.TESTED,
  certificate: env.CERTIFICATE,
  versionId: VERSION_ID,
  host: new URL(BASE_URL).host,
  requestsPerRoute: REQUESTS,
  startedAt,
  finishedAt,
  connection,
  routes,
  cpu,
  rule,
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'report.md'), markdown);
writeFileSync(
  join(OUT_DIR, 'report.json'),
  JSON.stringify(
    {
      startedAt,
      finishedAt,
      versionId: VERSION_ID,
      connection,
      routes,
      cpu: { source: cpu.source, complete: cpu.complete, notes: cpu.notes },
      rule,
    },
    null,
    2,
  ),
);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);

// ---------------------------------------------------------------------------

async function checkConnection() {
  const attempts = [];
  // Up to a minute: a new workers.dev address and a new secret can take a
  // little while to answer.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const at = Date.now();
    let status = 0;
    let body = null;
    try {
      const response = await fetch(`${BASE_URL}/api/test-worker/connection`);
      status = response.status;
      body = await response.json().catch(() => null);
    } catch {
      status = 0;
    }
    attempts.push({ at, status, body });
    // 404 or no JSON: the version with the variable or the secret isn't
    // serving yet. Anything else is an answer.
    if (body && status !== 404 && body.databaseUrl !== 'missing') break;
    await sleep(5_000);
  }
  const last = attempts.at(-1)?.body ?? null;
  const status = connectionStatus(last);
  return { attempts, last, status, passed: status === 'passes' };
}

async function requestRoute(route) {
  const requests = [];
  for (let i = 0; i < REQUESTS; i += 1) {
    const path = route.path(i);
    const at = Date.now();
    let status = 0;
    let problem = null;
    let rayId = null;
    try {
      const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
      status = response.status;
      const cfRay = response.headers.get('cf-ray');
      rayId = cfRay ? rayIdOf(cfRay) : null;
      problem = status === 200 ? await route.problem(response, i) : `HTTP ${status}`;
    } catch (error) {
      problem = `request failed (${error instanceof Error ? error.name : 'error'})`;
    }
    requests.push({ route: route.key, i, path, at, ms: Date.now() - at, status, rayId, problem });
  }
  return requests;
}

async function textOf(response, contentType) {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes(contentType)) throw new Error(`content-type ${type}`);
  return response.text();
}

function readTail() {
  const file = env.TAIL_FILE;
  if (!file || !existsSync(file)) return { problem: 'wrangler tail: no output' };
  const events = splitJsonObjects(readFileSync(file, 'utf8'));
  if (events.length === 0) return { problem: 'wrangler tail: no events (not connected, or not permitted)' };
  const invocations = events.map(fromTail);
  if (invocations.every((inv) => inv === null)) {
    return { problem: `wrangler tail: ${events.length} events, none with CPU time` };
  }
  return { invocations };
}

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, repo), 'utf8'));
}

/** At least 2, so each route has a first request and some after it. */
function requestsPerRoute(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > 1000) {
    throw new Error(`REQUESTS must be a whole number from 2 to 1000, not "${value}"`);
  }
  return n;
}

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
