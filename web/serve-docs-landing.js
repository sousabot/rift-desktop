import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = path.resolve(__dirname, '../docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Serve docs/ marketing under /site in web:dev.
 * /site/app → live Vite SPA at / so Get App stays on localhost:5174/#/…
 */
export function serveDocsLanding() {
  return {
    name: 'serve-docs-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] || '';

        // Always use the live SPA — not the stale docs/app build.
        if (raw === '/site/app' || raw === '/site/app/' || raw.startsWith('/site/app/')) {
          res.statusCode = 302;
          res.setHeader('Location', '/');
          res.end();
          return;
        }

        if (!raw.startsWith('/site')) return next();

        let rel = decodeURIComponent(raw.slice('/site'.length) || '/');
        if (!rel || rel === '/') rel = '/index.html';
        if (rel.endsWith('/')) rel = `${rel}index.html`;

        const filePath = path.normalize(path.join(DOCS_ROOT, rel));
        if (!filePath.startsWith(DOCS_ROOT)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return next();
        }
        sendFile(res, filePath);
      });
    },
  };
}
