import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TERMS_PATHS = [
  resolve(process.cwd(), 'docs/TERMS.md'),
  resolve(process.cwd(), '../../docs/TERMS.md'),
];

/** Reads the one contributor-terms document shared by both applications. */
export function readTermsMarkdown(): string {
  for (const file of TERMS_PATHS) {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      // Try the next workspace-relative location.
    }
  }

  throw new Error(`Could not find docs/TERMS.md. Tried: ${TERMS_PATHS.join(', ')}`);
}

function escapeHtml(value: string): string {
  const escapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => escapes[character] ?? character);
}

function inlineMarkdown(value: string): string {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

/** Renders the limited Markdown used by docs/TERMS.md into trusted page HTML. */
export function renderTermsMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      output.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length ?? 1;
      output.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      list.push(item[1] ?? '');
      continue;
    }

    if (list.length > 0 && /^\s+/.test(line)) {
      list[list.length - 1] = `${list[list.length - 1]} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return output.join('\n');
}
