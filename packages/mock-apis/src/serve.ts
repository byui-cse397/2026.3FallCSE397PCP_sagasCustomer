/**
 * Runs one mock on its own, on the port the real API uses, so anything pointed at the real API
 * talks to the mock instead:
 *
 *   pnpm --filter @sagas/mock-apis serve:capture   # port 3001, like apps/capture-api
 *   pnpm --filter @sagas/mock-apis serve:graph     # port 3002, like apps/graph-api
 *
 * PORT overrides the port.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';

import { createCaptureMock } from './capture';
import { createGraphMock } from './graph';
import type { Handler } from './http';

/** Puts a mock behind Node's HTTP server. Exported so the tests can start one. */
export function listen(handler: Handler, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v);
        }
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const response = await handler(
          new Request(url, {
            method: req.method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      })();
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const mocks = {
  capture: { create: createCaptureMock, port: 3001 },
  graph: { create: createGraphMock, port: 3002 },
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const which = process.argv[2] as keyof typeof mocks | undefined;
  const mock = which ? mocks[which] : undefined;
  if (!mock) {
    console.error('Say which mock: capture or graph.');
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? mock.port);
  void listen(mock.create(), port).then(() => {
    console.log(`The ${which} mock is on http://localhost:${port}. Anything you send it is kept in memory only.`);
  });
}
