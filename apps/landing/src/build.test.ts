import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { readTermsMarkdown, renderTermsMarkdown } from '@sagas/terms';

import { buildSite } from './build';

// CI (ci.yml) runs tests but not builds, so this test runs the real build.
// A change that breaks the landing page build then fails the pull request,
// not the deploy after merge.

describe('buildSite', () => {
  let out = '';

  afterAll(async () => {
    if (out) await rm(out, { recursive: true, force: true });
  });

  it('writes index.html and styles.css', async () => {
    out = await mkdtemp(path.join(tmpdir(), 'landing-'));
    const { html, css, termsHtml } = await buildSite(out);

    expect(existsSync(path.join(out, 'index.html'))).toBe(true);
    expect(existsSync(path.join(out, 'styles.css'))).toBe(true);
    expect(existsSync(path.join(out, 'terms', 'index.html'))).toBe(true);
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');

    // Tailwind generated the classes the page uses, and the tokens came along.
    expect(css).toContain('.bg-background');
    expect(css).toContain('--foreground:');
    expect(css).toContain('hsl(var(--muted, 0 0% 96%))');
    expect(css).not.toContain('@tailwind');
    const title = /^#\s+(.+)$/m.exec(readTermsMarkdown())?.[1];
    expect(title).toBeTruthy();
    expect(termsHtml).toContain(renderTermsMarkdown(`# ${title}`));
    expect(termsHtml).toContain(renderTermsMarkdown(readTermsMarkdown()));

    const writtenTerms = await readFile(path.join(out, 'terms', 'index.html'), 'utf8');
    expect(writtenTerms).toBe(termsHtml);
  });
});
