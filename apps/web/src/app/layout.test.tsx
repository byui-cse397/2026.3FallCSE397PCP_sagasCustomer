import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RootLayout from './layout';

describe('root layout', () => {
  it('makes contributor terms available from every app page', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <main>Page content</main> }),
    );

    expect(html).toContain('href="/terms"');
    expect(html).toContain('Contributor terms');
  });
});
