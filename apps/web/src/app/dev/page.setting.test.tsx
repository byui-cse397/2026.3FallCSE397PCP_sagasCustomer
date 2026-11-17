import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Records whether a request got as far as loading fixture data. A vi.doMock
// factory runs when its module is first imported after vi.resetModules(), so a
// flag that stays false means nothing imported that module.
const loaded = { readModel: false, fixtures: false };

function watchDataModules() {
  loaded.readModel = false;
  loaded.fixtures = false;
  vi.doMock('@/lib/queries', async () => {
    loaded.readModel = true;
    const { loadSiteState } = await import('@sagas/fixtures/acceptance');
    return {
      DEFAULT_SITE: 'corner-shop',
      FIXTURE_STATES: ['t0', 't1', 't2', 't3'],
      getSiteState: (_slug: string, stateId: 't0' | 't1' | 't2' | 't3') =>
        loadSiteState('corner-shop', stateId),
      listSites: (stateId: 't0' | 't1' | 't2' | 't3') => [
        loadSiteState('corner-shop', stateId).site,
      ],
    };
  });
  vi.doMock('@sagas/fixtures/acceptance', async (importOriginal) => {
    loaded.fixtures = true;
    return importOriginal();
  });
}

async function requestDevPage() {
  const { default: DevPage } = await import('./page');
  return DevPage({ searchParams: Promise.resolve({ site: 'corner-shop', state: 't3' }) });
}

/** The digest Next.js gives the error a page throws, such as `notFound()`'s 404. */
async function refusal(request: Promise<unknown>): Promise<string> {
  try {
    await request;
    return 'rendered';
  } catch (error) {
    return typeof error === 'object' && error !== null && 'digest' in error
      ? String(error.digest)
      : 'error';
  }
}

describe('/dev with SAGAS_DEV_SANDBOX', () => {
  beforeEach(() => {
    vi.resetModules();
    watchDataModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 404 when the setting is off, before the read model or any fixture loads', async () => {
    vi.stubEnv('SAGAS_DEV_SANDBOX', 'off');

    expect(await refusal(requestDevPage())).toMatch(/404/);
    expect(loaded.readModel).toBe(false);
    expect(loaded.fixtures).toBe(false);
  });

  it('is off in a production build that leaves the setting unset', async () => {
    vi.stubEnv('SAGAS_DEV_SANDBOX', undefined);
    vi.stubEnv('NODE_ENV', 'production');

    expect(await refusal(requestDevPage())).toMatch(/404/);
    expect(loaded.readModel).toBe(false);
    expect(loaded.fixtures).toBe(false);
  });

  it('renders the sandbox when the setting is on', async () => {
    vi.stubEnv('SAGAS_DEV_SANDBOX', 'on');
    vi.stubEnv('NODE_ENV', 'production');

    const html = renderToStaticMarkup(await requestDevPage());

    expect(html).toContain('Component sandbox');
    expect(html).toContain('Viewing t3');
    expect(loaded.readModel).toBe(true);
    expect(loaded.fixtures).toBe(true);
  });
});
