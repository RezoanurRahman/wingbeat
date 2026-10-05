import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { node } from '@elysiajs/node';
import { staticPlugin } from '@elysiajs/static';
import { Elysia, type AnyElysia } from 'elysia';
import { apiNotFoundError, createApp } from './app.js';

const DEFAULT_PORT = 4173;
const CLIENT_DIR = 'dist/client';
const CLIENT_INDEX = join(CLIENT_DIR, 'index.html');

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function contentTypeFor(pathname: string): string | undefined {
  return MIME_TYPES[extname(pathname).toLowerCase()];
}

export function resolvePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

async function serveClientIndex(): Promise<Response> {
  try {
    const html = await readFile(CLIENT_INDEX, 'utf8');
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch {
    return new Response('Wingbeat client build not found. Run `npm run build` first.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

export async function createServer(): Promise<AnyElysia> {
  const client = await staticPlugin({
    assets: CLIENT_DIR,
    prefix: '/',
    indexHTML: true,
    alwaysStatic: true,
  });

  return new Elysia({ adapter: node() })
    .onRequest(({ request, set }) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return;
      }
      const { pathname } = new URL(request.url);
      if (pathname.startsWith('/api')) {
        return;
      }
      const contentType = pathname === '/' ? 'text/html; charset=utf-8' : contentTypeFor(pathname);
      if (contentType !== undefined) {
        set.headers['content-type'] = contentType;
      }
    })
    .use(createApp())
    .use(client)
    .get('/', () => serveClientIndex())
    .get('/*', ({ request, set }) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        set.status = 404;
        return apiNotFoundError(request);
      }
      return serveClientIndex();
    });
}

export async function startServer(port: number = resolvePort(process.env.PORT)): Promise<void> {
  const app = await createServer();
  app.listen(port, () => {
    console.log(`Wingbeat listening on http://localhost:${port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Wingbeat failed to start:', error);
  process.exitCode = 1;
});
