// The parts of the P4 test Worker's check that decide things: matching CPU
// records to this run's requests, the summaries, the decision rule, the /dev
// page check and the report. No network and no files, so lib.test.mjs can test
// them (`node --test .github/p4-test-worker/lib.test.mjs`). TEMPORARY, like check.mjs.

/** The proposal's target for a route's p99 CPU after its first request: headroom below Free's 10 ms. */
export const CPU_TARGET_MS = 8;

// ---------------------------------------------------------------------------
// CPU records

/**
 * One invocation, from either source:
 * { key, rayId, version, scriptName, at, url, cpuMs, wallMs, outcome }.
 */

/**
 * A Workers Logs invocation event as an invocation, or null if it has no CPU
 * time. `$metadata.rayId` is the `cf-ray` of the request that triggered it,
 * which is what ties it to one of our requests.
 */
export function fromWorkersLog(event) {
  const metadata = event?.$metadata ?? {};
  const workers = event?.$workers ?? {};
  const url = workers.event?.request?.url ?? metadata.url;
  if (typeof workers.cpuTimeMs !== 'number' || typeof url !== 'string') return null;
  return {
    key: metadata.requestId ?? workers.requestId ?? metadata.id ?? null,
    rayId: typeof metadata.rayId === 'string' ? rayIdOf(metadata.rayId) : null,
    version: workers.scriptVersion?.id ?? null,
    scriptName: workers.scriptName ?? null,
    at: event.timestamp,
    url,
    cpuMs: workers.cpuTimeMs,
    wallMs: workers.wallTimeMs ?? null,
    outcome: workers.outcome ?? 'unknown',
  };
}

/** A `wrangler tail` event as an invocation, or null if it has no CPU time. */
export function fromTail(event) {
  const request = event?.event?.request;
  if (typeof event?.cpuTime !== 'number' || typeof request?.url !== 'string') return null;
  const ray = headerOf(request.headers, 'cf-ray');
  const rayId = ray ? rayIdOf(ray) : null;
  return {
    key: rayId ?? `${event.eventTimestamp}|${request.url}`,
    rayId,
    version: event.scriptVersion?.id ?? null,
    scriptName: event.scriptName ?? null,
    at: event.eventTimestamp,
    url: request.url,
    cpuMs: event.cpuTime,
    wallMs: event.wallTime ?? null,
    outcome: event.outcome ?? 'unknown',
  };
}

/** `8f1a2b3c4d5e6f70-SEA` → `8f1a2b3c4d5e6f70`, so either form compares. */
export function rayIdOf(cfRay) {
  return String(cfRay).split('-')[0];
}

function headerOf(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found ? String(found[1]) : null;
}

/**
 * Ties CPU records to the requests this run sent, one to one.
 *
 * Only records from this Worker, its live version and the run's time window
 * count, each once. A request is matched only to the record that carries its
 * own Ray ID. Nothing else is accepted as proof that a record belongs to a
 * request: a record without our Ray ID leaves its request unmatched.
 *
 * @param {object} run
 * @param {Array<{route: string, path: string, at: number, rayId: string | null}>} run.requests
 * @param {Array<object | null>} run.invocations
 * @param {string} run.scriptName
 * @param {string | null} run.versionId  the live version; null skips the check
 * @param {number} run.from  first request, epoch ms
 * @param {number} run.to    last response, epoch ms
 */
export function matchRun({ requests, invocations, scriptName, versionId, from, to }) {
  const seen = new Set();
  const tied = [];
  for (const inv of invocations) {
    if (!inv || inv.key === null) continue;
    if (inv.scriptName && inv.scriptName !== scriptName) continue;
    if (versionId && inv.version !== null && inv.version !== versionId) continue;
    if (typeof inv.at !== 'number' || inv.at < from - 5_000 || inv.at > to + 60_000) continue;
    if (seen.has(inv.key)) continue;
    seen.add(inv.key);
    tied.push(inv);
  }

  const byRayId = new Map();
  for (const inv of tied) {
    if (!inv.rayId) continue;
    // Two records claiming one Ray ID can't both be that request's: trust neither.
    byRayId.set(inv.rayId, byRayId.has(inv.rayId) ? null : inv);
  }
  const matches = new Map(); // request → invocation
  let unversioned = 0;
  for (const request of requests) {
    const inv = request.rayId ? byRayId.get(rayIdOf(request.rayId)) : undefined;
    if (!inv) continue;
    matches.set(request, inv);
    if (inv.version === null) unversioned += 1;
  }
  // A record without a version is still matched: its Ray ID is one of this
  // run's requests, and only one version was live while they were sent. How
  // many there were goes in the report.
  return { tied: tied.length, matches, unversioned };
}

/** Every request has its own record, and there was at least one request. */
export function isComplete(match, requests) {
  return requests.length > 0 && match.matches.size === requests.length;
}

/** One route's CPU, or `complete: false` when any of its requests has no record. */
export function summariseRoute(requests, matches) {
  const matched = requests.filter((request) => matches.has(request));
  const complete = requests.length > 0 && matched.length === requests.length;
  const base = { requests: requests.length, matched: matched.length, complete };
  if (!complete) return base;

  const [first, ...rest] = requests; // In the order they were sent.
  const outcomes = {};
  for (const request of requests) {
    const outcome = matches.get(request).outcome;
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  const restCpu = rest.map((request) => matches.get(request).cpuMs);
  return {
    ...base,
    outcomes,
    exceededCpu: outcomes.exceededCpu ?? 0,
    firstCpuMs: matches.get(first).cpuMs,
    rest: rest.length,
    p50CpuMs: percentile(restCpu, 50),
    p99CpuMs: percentile(restCpu, 99),
    maxCpuMs: restCpu.length ? Math.max(...restCpu) : null,
  };
}

/** Nearest-rank percentile; null for no values. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** `wrangler tail --format json` prints one indented JSON object per event. */
export function splitJsonObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        try {
          objects.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // Not an event; skip it.
        }
      }
    }
  }
  return objects;
}

// ---------------------------------------------------------------------------
// Reading Workers Logs

/**
 * Every invocation event for the Worker in the time window, page by page.
 * Never throws: a refused or failed request comes back as `problem`.
 */
export async function queryWorkersLogs({ fetchImpl, apiBase, account, token, scriptName, from, to }) {
  const url = `${apiBase}/accounts/${account}/workers/observability/telemetry/query`;
  const events = [];
  let offset;
  for (let page = 0; page < 50; page += 1) {
    const body = {
      queryId: 'p4-test-worker',
      timeframe: { from, to },
      view: 'events',
      limit: 100,
      ...(offset ? { offset, offsetDirection: 'next' } : {}),
      parameters: {
        datasets: ['cloudflare-workers'],
        filterCombination: 'and',
        filters: [
          { key: '$workers.scriptName', operation: 'eq', type: 'string', value: scriptName },
          { key: '$metadata.type', operation: 'eq', type: 'string', value: 'cf-worker-event' },
        ],
      },
    };
    let response;
    let json = null;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      json = await response.json().catch(() => null);
    } catch (error) {
      return { problem: `Workers Logs: request failed (${error?.name ?? 'error'})` };
    }
    if (!response.ok || !json?.success) {
      const codes = (json?.errors ?? []).map((e) => e.code).join(', ') || 'none';
      return { problem: `Workers Logs: HTTP ${response.status}, Cloudflare error codes ${codes}` };
    }
    const pageEvents = json.result?.events?.events ?? [];
    events.push(...pageEvents);
    if (pageEvents.length < body.limit) break;
    offset = pageEvents.at(-1)?.$metadata?.id;
    if (!offset) break;
  }
  return { invocations: events.map(fromWorkersLog) };
}

/**
 * CPU for this run's requests: Workers Logs first, polled while they arrive,
 * then `wrangler tail` if the logs can't account for every request.
 *
 * @returns {{ source: string | null, match: ReturnType<typeof matchRun> | null, complete: boolean, notes: string[] }}
 */
export async function collectCpu({ readLogs, readTail, run, polls = 12, wait }) {
  const result = await collectFrom({ readLogs, readTail, run, polls, wait });
  const unversioned = result.match?.unversioned ?? 0;
  if (unversioned > 0) {
    result.notes.push(
      `${result.source}: ${unversioned} of the matched records had no script version, so they were matched by Ray ID alone`,
    );
  }
  return result;
}

async function collectFrom({ readLogs, readTail, run, polls, wait }) {
  const notes = [];
  let best = null;

  for (let poll = 0; poll < polls; poll += 1) {
    const logs = await readLogs();
    if (logs.problem) {
      notes.push(logs.problem);
      break;
    }
    const match = matchRun({ ...run, invocations: logs.invocations });
    best = { source: 'Workers Logs', match };
    if (isComplete(match, run.requests)) {
      return { ...best, complete: true, notes };
    }
    if (poll < polls - 1) await wait();
  }
  if (best) {
    notes.push(`Workers Logs: ${best.match.matches.size} of ${run.requests.length} requests found`);
  }

  const tail = readTail();
  if (tail.problem) notes.push(tail.problem);
  else {
    const match = matchRun({ ...run, invocations: tail.invocations });
    if (isComplete(match, run.requests)) {
      return { source: 'wrangler tail', match, complete: true, notes };
    }
    notes.push(`wrangler tail: ${match.matches.size} of ${run.requests.length} requests found`);
    if (!best || match.matches.size > best.match.matches.size) best = { source: 'wrangler tail', match };
  }
  return { source: best?.source ?? null, match: best?.match ?? null, complete: false, notes };
}

// ---------------------------------------------------------------------------
// The direct route's connection string

const SSL_MODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full', 'no-verify']);

/**
 * The direct route's connection string, with `sslmode=verify-full` whatever
 * it asked for before, so the Worker checks the certificate and the host
 * before it sends the password. Every other mode either skips that check or,
 * in `pg`'s libpq mode (`uselibpqcompat=true`), can.
 *
 * - Only the query changes; everything before `?` stays exactly as stored.
 * - A string with a `#` is refused: everything after it is a fragment, which
 *   no parser reads, so an added mode could land there unseen. An encoded
 *   `%23`, in a password say, is fine.
 * - `ssl=…`, which `pg` also reads, is dropped, so nothing contradicts the mode.
 * - A string naming certificate files (`sslrootcert`, `sslcert`, `sslkey`) is
 *   refused: `pg` would try to read them, and a Worker has no files.
 *
 * `before` is the mode the string asked for (`null` if none, `another value`
 * if it isn't a mode). Errors never include any part of the string.
 *
 * @param {string | undefined} connectionString
 * @returns {{ connectionString: string, before: string | null }}
 */
export function verifyFull(connectionString) {
  if (!connectionString) throw new Error('it is empty');
  if (connectionString.includes('#')) throw new Error('it has a #, which would hide anything after it');
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("it isn't a URL");
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error("it isn't a postgres:// or postgresql:// URL");
  }

  const at = connectionString.indexOf('?');
  const base = at === -1 ? connectionString : connectionString.slice(0, at);
  const query = new URLSearchParams(at === -1 ? '' : connectionString.slice(at + 1));
  for (const name of ['sslrootcert', 'sslcert', 'sslkey']) {
    if (query.has(name)) throw new Error(`it names a certificate file (${name}), which a Worker can't read`);
  }
  const modes = query.getAll('sslmode');
  const before = modes.length === 0 ? null : modes.every((mode) => SSL_MODES.has(mode)) ? modes.join(', ') : 'another value';
  query.delete('sslmode');
  query.delete('ssl');
  query.append('sslmode', 'verify-full');
  return { connectionString: `${base}?${query.toString()}`, before };
}

// ---------------------------------------------------------------------------
// Response checks

/**
 * What's wrong with a /dev page for freight-depot at state t{i}, or null.
 *
 * Only what the page shows counts. Next.js repeats the page's data in its
 * script payload, which would match even where nothing rendered; most record
 * IDs, for one, appear only there. So the checks read the visible text: the
 * state's label, the site, the state's summary line (its claims, integrity and
 * contributions), the text of every record it has, and no record text that
 * only a later state has.
 *
 * @param {string} html
 * @param {number} i
 * @param {{ siteName: string, states: { summary: string, recordTexts: string[] }[] }} fixtures
 */
export function devPageProblem(html, i, { siteName, states }) {
  const text = pageText(html);
  if (!text.includes(`Viewing t${i}`)) return `not t${i}`;
  if (!text.includes(siteName)) return 'not the freight depot';
  const state = states[i];
  if (!text.includes(state.summary)) return `not t${i}'s summary line`;
  const missing = state.recordTexts.filter((record) => !text.includes(record));
  if (missing.length) return `${missing.length} of t${i}'s records missing`;
  const later = new Set(states.slice(i + 1).flatMap((other) => other.recordTexts));
  for (const record of state.recordTexts) later.delete(record);
  const leaked = [...later].filter((record) => text.includes(record));
  if (leaked.length) return `${leaked.length} records from a later state`;
  return null;
}

/** Whitespace collapsed, as pageText leaves it. */
export function collapseSpace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A page's visible text: no scripts or styles, no tags, entities decoded,
 * whitespace collapsed. Scripts go first because Next.js repeats a page's
 * content in its script payload, which would match even if nothing rendered.
 *
 * @param {string} html
 */
export function pageText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity) => {
      const name = entity.toLowerCase();
      if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name];
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text a Markdown line shows: no `**`, backticks or link targets. */
function markdownText(line) {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What's wrong with the /terms page, or null.
 *
 * The page renders `docs/TERMS.md`. In a Worker it can only come from the
 * static-assets cache the deploy fills, because a Worker has no repository
 * files to read. So it has to show, as visible text, every heading of the
 * document in order and the document's version.
 *
 * @param {string} html
 * @param {string} markdown  docs/TERMS.md from the commit being tested
 */
export function termsPageProblem(html, markdown) {
  const text = pageText(html);
  const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => markdownText(m[1]));
  if (headings.length === 0) return 'docs/TERMS.md has no headings to look for';
  let from = 0;
  for (const heading of headings) {
    const at = text.indexOf(heading, from);
    if (at < 0) return `heading missing or out of order: "${heading}"`;
    from = at + heading.length;
  }
  const version = /^Version `([^`]+)`/m.exec(markdown)?.[1];
  if (version && !text.includes(`Version ${version}`)) return `not version ${version}`;
  return null;
}

// ---------------------------------------------------------------------------
// The decision rule and the report

const passed = (check) => check?.connected === true && check.parameterized === true;

/**
 * The connection's outcome under the proposal's Connection row (section 2).
 *
 * `last` is the connection check's answer. Its top level is the app's own
 * route, `hyperdrive` or `direct`; with Hyperdrive, `direct` holds the direct
 * route's result too. The app's route has to pass, because the pages use it.
 * The connection fails only when both routes were set up and checked and
 * neither connected. Anything else is pending: a route still to set up or fix.
 */
export function connectionStatus(last) {
  if (!last || last.databaseUrl === 'missing') return 'pending';
  if (passed(last)) return 'passes';
  if (last.route === 'hyperdrive' && last.direct && !passed(last.direct)) return 'fails';
  return 'pending';
}

/**
 * Whether the hosted database has the fixtures, from the connection check's
 * count of the read model's rows: `loaded`, `empty`, or `unknown` when the
 * count itself failed. The count is a diagnostic: its failure never changes
 * whether the connection passed.
 */
export function fixturesStatus(last) {
  if (last?.readModel) return Object.values(last.readModel).some((rows) => rows > 0) ? 'loaded' : 'empty';
  return last?.readModelFailure ? 'unknown' : 'empty';
}

/**
 * The proposal's decision rule (section 2), applied only to what was measured.
 * Nothing about hosting is decided without requests to every route, and CPU
 * decides nothing unless every one of those requests has its own record.
 */
export function decide({ connection, fixtures, routes, cpuComplete }) {
  if (connection === 'fails') {
    return '**Rule 1.** Both routes were set up and checked, and neither connected. The sponsor looks at the decision again, with Render as the fallback (#11).';
  }
  if (connection !== 'passes') {
    return "**Rule 2, pending.** The app's route didn't connect, and a failure needs both routes set up and checked. Finish setting up the route and retest; nothing is decided on a route that could not be tried.";
  }
  if (fixtures === 'unknown') {
    return "**Connection passes; pages and CPU pending.** The read model's rows couldn't be counted (see the connection row), so whether the fixtures are loaded is unknown, and the routes were not requested. Find out why the count failed, then rerun.";
  }
  if (fixtures !== 'loaded') {
    return '**Connection passes; pages and CPU pending.** The hosted database has no fixtures yet, so the routes were not requested. Run the test again once they are loaded (Da4).';
  }
  if (routes.length === 0 || routes.some((r) => r.requests === 0)) {
    return '**Not decided: no routes measured.** The connection and the fixtures are ready, but no route was requested, so nothing about hosting follows from this run.';
  }
  if (routes.some((r) => r.expected !== r.requests)) {
    return '**Rule 3.** A route returned unexpected responses. Diagnose and retest before P7.';
  }
  if (!cpuComplete || routes.some((r) => !r.cpu?.complete || r.cpu.rest === 0)) {
    return '**Not decided: CPU incomplete.** The responses are right, but CPU time is missing for some requests, so no hosting decision follows from this run. See the CPU line above, then rerun, or read Workers Logs in the dashboard for the window above.';
  }
  if (routes.some((r) => r.cpu.exceededCpu > 0)) {
    return '**Rule 5.** Some invocations ended as `exceededCpu`, which means Workers Paid or a change to that route before deployment. Optimise or prebuild the route and retest, or choose Workers Paid.';
  }
  if (routes.some((r) => r.cpu.p99CpuMs >= CPU_TARGET_MS)) {
    return '**Rule 5.** Nothing exceeded CPU, but a route misses the 8 ms target for its p99. Optimise or prebuild the route and retest, or choose Workers Paid.';
  }
  return '**Rule 4.** The connection passes, every route returned the expected responses, every request has a CPU record, nothing exceeded CPU, and every route\'s p99 is under 8 ms: the full app can run on Workers Free until the containers arrive.';
}

export function renderReport(r) {
  const ms = (v) => (v === null || v === undefined ? '–' : `${Math.round(v * 100) / 100} ms`);
  const clock = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const last = r.connection.last;
  const status = connectionStatus(last);
  const viaHyperdrive = last?.route === 'hyperdrive';
  const outcome = (check, name) => {
    if (passed(check)) {
      return `**Passes.** The \`$1\` query returned the expected row (from the Worker: connect ${check.ms?.connect} ms, query ${check.ms?.query} ms).`;
    }
    if (check?.connected === true) {
      return check.failure
        ? `**Failed after connecting:** ${check.failure.kind}${check.failure.code ? ` (code ${check.failure.code})` : ''}.`
        : '**Failed:** connected, but the `$1` query returned the wrong row.';
    }
    const kind = check?.failure?.kind ?? 'unknown';
    const untrusted =
      name === 'direct' &&
      ['closed-while-connecting', 'tls-certificate'].includes(kind) &&
      !(r.certificate ?? '').includes(': 0 (ok)');
    const reason = untrusted
      ? " The database's certificate doesn't chain to a public root, and a Worker's connection only accepts ones that do. Hyperdrive, given Supabase's CA certificate, is the route for that."
      : kind === 'tls' && name === 'direct'
        ? ' The database refused the connection over TLS settings; check the `sslmode` above.'
        : '';
    return `**Failed:** ${kind}${check?.failure?.code ? ` (code ${check.failure.code})` : ''}.${reason}`;
  };
  const readModel = last?.readModel
    ? Object.entries(last.readModel)
        .map(([schema, rows]) => `${rows} rows in \`${schema}\``)
        .join(', ') || 'no table yet (fixtures not loaded)'
    : last?.readModelFailure
      ? `count failed, ${last.readModelFailure.kind}${last.readModelFailure.code ? ` (code ${last.readModelFailure.code})` : ''}; the connection result above stands`
      : 'not read';
  const connectionRows = [];
  if (!last || last.databaseUrl === 'missing') {
    connectionRows.push('| Connection | **Not run.** The Worker never answered with `DATABASE_URL` set. |');
  } else if (viaHyperdrive) {
    connectionRows.push(`| Connection: Hyperdrive, the app's route | ${outcome(last, 'hyperdrive')} Read model: ${readModel}. |`);
    connectionRows.push(
      `| Connection: direct | ${last.direct ? outcome(last.direct, 'direct') : 'Not tried: the Worker has no `DATABASE_URL` secret.'} |`,
    );
  } else {
    connectionRows.push(`| Connection: direct, the app's route | ${outcome(last, 'direct')} Hyperdrive: not set up. Read model: ${readModel}. |`);
  }
  const connectionNote =
    status === 'passes'
      ? ''
      : status === 'fails'
        ? '\n\nUnder the decision rule the connection **fails**: both routes were set up and checked.'
        : '\n\nUnder the decision rule the connection is **pending**, not failed.';

  const requested = r.routes.reduce((sum, route) => sum + route.requests, 0);
  let cpuLine;
  if (requested === 0) {
    cpuLine = r.cpu.notes.length ? `No routes requested. ${r.cpu.notes.join('; ')}.` : 'No routes requested.';
  } else if (r.cpu.complete) {
    cpuLine = `${r.cpu.source}: a record for each of the ${plural(requested, 'request')}, from version \`${r.versionId ?? 'unknown'}\`, each matched by its Ray ID.${r.cpu.notes.length ? ` (${r.cpu.notes.join('; ')}.)` : ''}`;
  } else {
    cpuLine = `**Incomplete.** ${r.cpu.notes.join('; ') || 'No CPU source could be read'}.`;
  }

  const rows = r.routes.map((route) => {
    const responses =
      route.expected === route.requests
        ? `${route.expected}/${route.requests} as expected`
        : `${route.expected}/${route.requests} as expected; ${Object.entries(route.problems)
            .map(([p, n]) => `${n}× ${p}`)
            .join('; ')}`;
    const cpu = route.cpu;
    if (!cpu?.complete) {
      return `| ${route.label} | ${responses} | – | – | inconclusive (${cpu?.matched ?? 0}/${route.requests} with CPU) | – |`;
    }
    const target = cpu.p99CpuMs === null ? '–' : cpu.p99CpuMs < CPU_TARGET_MS ? 'Met' : '**Missed**';
    return `| ${route.label} | ${responses} | ${cpu.exceededCpu} | ${ms(cpu.firstCpuMs)} | ${ms(cpu.p99CpuMs)} (median ${ms(cpu.p50CpuMs)}, max ${ms(cpu.maxCpuMs)}, n=${cpu.rest}) | ${target} |`;
  });

  const window = `between ${clock(r.startedAt)} and ${clock(r.finishedAt)} UTC`;
  const routesSection = r.routes.length
    ? `${r.requestsPerRoute} requests per route, one route at a time, from a GitHub-hosted runner to \`${r.host}\`, ${window}. "First" is each route's first observed request after this deploy; it may or may not be a new Worker instance, and later requests can reach other instances too. "The rest" is every request after it. CPU is Cloudflare's CPU time per invocation.

| Route | Responses | \`exceededCpu\` | First request CPU | The rest: CPU p99 | Target: p99 < 8 ms |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}`
    : `Requests sent ${window}.

_Routes not requested: they need a working connection and the fixtures in the hosted database._`;

  return `## P4 test Worker: results

**Tested:** ${r.tested ?? '(not given)'}
**Connection routes:** ${
    viaHyperdrive
      ? `the app uses Hyperdrive, whose configuration sets its TLS to Supabase. Direct, checked beside it: Supabase's transaction pooler, with TLS (\`sslmode=${last?.direct?.tls ?? 'unknown'}\`).`
      : `direct, through Supabase's transaction pooler, with TLS (\`sslmode=${last?.tls ?? 'unknown'}\`). Hyperdrive: not set up.`
  }
**Database certificate:** ${r.certificate ?? '(not checked)'}

| Check | Result |
| --- | --- |
${connectionRows.join('\n')}
| CPU | ${cpuLine} |${connectionNote}

${routesSection}

**Decision rule:** ${r.rule}
`;
}
