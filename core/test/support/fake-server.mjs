// TEST-ONLY. A local node:http server standing in for feeds / arXiv / HN Algolia. No test touches
// the network: every URL a fetcher sees points at 127.0.0.1.
//
//   const srv = await startFakeServer();   t.after(() => srv.close());
//   const url = srv.route('/feed', { status: 200, body: xml, headers: {...}, contentType });
//   srv.route('/hang', { hang: true });    // never answers (timeout case)
//   srv.route('/custom', (req, res) => {...});
//   srv.requests                            // every request seen: { path, query, url, headers }
//   srv.hits('/feed')                       // how many requests hit that path
//   await deadUrl()                         // a 127.0.0.1 url nobody listens on (connection refused)
import { createServer } from 'node:http';

export async function startFakeServer() {
  const routes = new Map();
  const requests = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://fake.local');
    requests.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), url: req.url, headers: req.headers });
    const spec = routes.get(u.pathname);
    if (spec === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('no such route');
      return;
    }
    if (typeof spec === 'function') {
      spec(req, res);
      return;
    }
    if (spec.hang) return;
    const headers = { 'content-type': spec.contentType ?? 'application/xml; charset=utf-8', ...(spec.headers ?? {}) };
    res.writeHead(spec.status ?? 200, headers);
    res.end(spec.body ?? '');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    requests,
    route(path, spec) {
      routes.set(path, spec);
      return base + path;
    },
    hits(path) {
      return requests.filter((r) => r.path === path).length;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function deadUrl() {
  const s = createServer();
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address();
  await new Promise((resolve) => s.close(resolve));
  return `http://127.0.0.1:${port}/dead`;
}
