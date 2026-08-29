/**
 * A static file server with no dependencies, for `npm start`.
 *
 * IADSVille is a plain static site — it will happily run from any web server or
 * from GitHub Pages. This exists so that a fresh clone can be played with one
 * command and no install step, and because ES modules need a real origin rather
 * than file://.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;

    // Normalise and confine to the project root: no climbing out with "..".
    const path = join(ROOT, normalize(requested).replace(/^(\.\.[/\\])+/, ''));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`IADSVille running at http://${HOST}:${PORT}`);
});
