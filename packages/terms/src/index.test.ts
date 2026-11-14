import { describe, expect, it } from 'vitest';

import { readTermsMarkdown, renderTermsMarkdown } from './index';

describe('contributor terms renderer', () => {
  const markdown = readTermsMarkdown();
  const html = renderTermsMarkdown(markdown);

  it('renders the canonical document structurally', () => {
    const title = /^#\s+(.+)$/m.exec(markdown)?.[1];
    expect(title).toBeTruthy();
    expect(html).toContain(renderTermsMarkdown(`# ${title}`));
    expect(html.trim()).not.toBe('');
    expect(html).toMatch(/<h2>[^<]+<\/h2>/);
  });

  it('fails the test when the source uses unsupported Markdown constructs', () => {
    const withoutUrls = markdown
      .replace(/\[[^\]]+\]\(https?:[^)]*\)/g, '')
      .replace(/https?:\/\/\S+/g, '');
    expect(withoutUrls).not.toMatch(
      /^(?:[ \t]*\d+\.[ \t]|>[ \t]|```|---$|\|)|^[ \t]{2,}[-*][ \t]|!\[|^</m,
    );
    expect(withoutUrls).not.toMatch(/(?:^|[ \t(])_[^_\n]+_(?=[ \t.,!?;:)\]}]|$)/m);
    expect(withoutUrls).not.toMatch(/(?:^|[ \t(])\*[^*\n]+\*(?=[ \t.,!?;:)\]}]|$)/m);
  });

  it('does not create executable links from unsafe targets', () => {
    const unsafe = renderTermsMarkdown('[x](javascript:alert(1))');
    expect(unsafe).not.toContain('href=');
    expect(unsafe).toContain('x');
  });
});
