/**
 * A stand-in for the content layer's API (`apps/capture-api`), for anyone who needs it before the
 * real one is released, or when it's down.
 *
 * It follows the routes upstream already names: the record routes that
 * `@sagas/fixtures/capture/rules` checks over HTTP, and the sites and transcript routes in
 * `apps/capture-api/BACKLOG.md` (C3 and C13). It passes the same rules the real API has to pass.
 *
 * It starts with the fixture places and records, and it keeps whatever you send it in memory, so
 * everything you add disappears when it restarts. That's on purpose: nothing invented gets saved.
 *
 * Not here yet: uploads and presigned URLs, the request queues (C7, C8) and coverage (C4).
 */
import { newSourceRecord, site } from '@sagas/contracts';
import type { Site } from '@sagas/contracts';
import { reduceToState, siteFixtures } from '@sagas/fixtures';

import { json, readJson, Router } from './http';
import type { Handler } from './http';

/** A stored record, kept as it came back from validation, with its id. */
type StoredRecord = { id: string; parent?: { role: string; recordId?: string } } & Record<string, unknown>;

const newSite = site.omit({ id: true, slug: true });

/**
 * A place as the mock hands it out: everything except the address. The sponsor decided on 12
 * November that an address can be stored and is never shown, and an API anyone can call shows
 * whatever it returns. The contract's `site` still requires `address`; changing that waits for the
 * location update, so this is the one place the mock knowingly differs from the contract.
 */
const shown = ({ address: _address, ...rest }: Site) => rest;

export interface CaptureMockOptions {
  /** Where the mock is mounted, for example `/api/mock/capture`. */
  basePath?: string;
}

export function createCaptureMock(options: CaptureMockOptions = {}): Handler {
  const sites = new Map<string, Site>();
  const records = new Map<string, StoredRecord>();

  for (const fixture of siteFixtures) {
    const last = fixture.cuts.at(-1);
    if (!last) continue;
    const state = reduceToState(fixture.events, last.asOf);
    sites.set(state.site.id, state.site);
    for (const record of state.records) records.set(record.id, record);
  }

  return new Router(options.basePath)
    .on('GET', '/health', () => json(200, { ok: true, mock: true }))

    .on('POST', '/records', async (request) => {
      const read = await readJson(request);
      if (!read.ok) return read.response;
      const parsed = newSourceRecord.safeParse(read.body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const { parent } = parsed.data;
      if (parent?.recordId !== undefined && !records.has(parent.recordId)) {
        return json(400, { error: `The parent record ${parent.recordId} doesn't exist.` });
      }
      const stored: StoredRecord = { ...parsed.data, id: crypto.randomUUID() };
      records.set(stored.id, stored);
      return json(201, stored);
    })

    .on('GET', '/records/:id', (_request, { id }) => {
      const record = records.get(id ?? '');
      return record ? json(200, record) : json(404, { error: `No record ${id}.` });
    })

    .on('GET', '/records/:id/transcripts', (_request, { id }) => {
      if (!records.has(id ?? '')) return json(404, { error: `No record ${id}.` });
      const transcripts = [...records.values()].filter(
        (r) => r.parent?.role === 'transcript' && r.parent.recordId === id,
      );
      return json(200, transcripts);
    })

    .on('POST', '/sites', async (request) => {
      const read = await readJson(request);
      if (!read.ok) return read.response;
      const parsed = newSite.safeParse(read.body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const created: Site = {
        ...parsed.data,
        id: crypto.randomUUID(),
        slug: uniqueSlug(parsed.data.name, sites),
      };
      sites.set(created.id, created);
      return json(201, shown(created));
    })

    // Matches the name and other names only, never the address (sponsor, 18 November): a search
    // that matched addresses would tell anyone typing one that a place, maybe a home, is there.
    .on('GET', '/sites', (_request, _params, url) => {
      const q = url.searchParams.get('q')?.trim().toLowerCase();
      const all = [...sites.values()];
      const matching = q
        ? all.filter((s) => [s.name, ...s.aka].some((n) => n.toLowerCase().includes(q)))
        : all;
      return json(200, matching.map(shown));
    })

    .on('GET', '/sites/:id', (_request, { id }) => {
      const found = sites.get(id ?? '');
      return found ? json(200, shown(found)) : json(404, { error: `No site ${id}.` });
    })

    .handler();
}

function uniqueSlug(name: string, sites: Map<string, Site>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'place';
  const taken = new Set([...sites.values()].map((s) => s.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
