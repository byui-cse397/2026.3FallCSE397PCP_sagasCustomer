/**
 * A tiny router over the web's own `Request` and `Response`.
 *
 * Both mocks are plain functions from a request to a response, so the same code runs inside a
 * Next.js route handler, on Cloudflare Workers, and on Node through `serve.ts`. No framework,
 * because a mock that needs its own server to run is one more thing to host.
 */

export type Handler = (request: Request) => Promise<Response>;

type RouteHandler = (
  request: Request,
  params: Record<string, string>,
  url: URL,
) => Response | Promise<Response>;

interface Route {
  method: string;
  parts: string[];
  handle: RouteHandler;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Reads a JSON body, or answers 400 the way the real APIs do for a body that isn't JSON. */
export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json(400, { error: 'The body has to be JSON.' }) };
  }
}

export class Router {
  private readonly routes: Route[] = [];

  /**
   * @param basePath where the mock is mounted, for example `/api/mock/capture` inside the site.
   *   Requests are matched on what comes after it.
   */
  constructor(private readonly basePath = '') {}

  on(method: string, path: string, handle: RouteHandler): this {
    this.routes.push({ method, parts: split(path), handle });
    return this;
  }

  handler(): Handler {
    return async (request) => {
      const url = new URL(request.url);
      const path = url.pathname.startsWith(this.basePath)
        ? url.pathname.slice(this.basePath.length)
        : url.pathname;
      const parts = split(path);
      for (const route of this.routes) {
        if (route.method !== request.method) continue;
        const params = match(route.parts, parts);
        if (params) return route.handle(request, params, url);
      }
      return json(404, { error: `No mock route for ${request.method} ${path || '/'}.` });
    };
  }
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function match(pattern: string[], parts: string[]): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (const [i, p] of pattern.entries()) {
    const part = parts[i];
    if (part === undefined) return null;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(part);
    else if (p !== part) return null;
  }
  return params;
}
