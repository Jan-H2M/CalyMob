#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HOST = '127.0.0.1';
export const PORT = 7375;
export const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; " +
  "connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; " +
  "frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'self'; object-src 'none'";
const allowedExtensions = new Set(['.html', '.js', '.mjs', '.json', '.wasm',
  '.bin', '.otf', '.ttf', '.woff', '.woff2', '.png', '.jpg', '.jpeg',
  '.webp', '.gif', '.svg', '.ico', '.frag']);
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript',
  '.mjs':'text/javascript', '.json':'application/json', '.wasm':'application/wasm',
  '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon',
  '.ttf':'font/ttf', '.otf':'font/otf', '.woff2':'font/woff2'};

export function validateManifest(m) {
  if (m?.schema !== 1 || m.workItem !== 'DEV-ISOLATION-001' ||
      !/^[a-f0-9]{40}$/.test(m.source || '') || typeof m.dirty !== 'boolean' ||
      m.entrypoint !== 'tool/isolated_dev/main.dart' ||
      m.data !== 'fictional-in-memory' || m.backend !== 'none' ||
      m.origin !== `http://${HOST}:${PORT}` || m.network !== 'same-origin-only' ||
      !/^[a-f0-9]{64}$/.test(m.treeSha256 || '')) {
    throw new Error('Invalid isolated DEV manifest; refusing normal/prod build.');
  }
}

async function snapshotTree(root) {
  const hash = createHash('sha256');
  const files = new Map();
  async function walk(dir) {
    for (const entry of (await fs.readdir(dir, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error('Symlink in isolated DEV build.');
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && rel !== 'isolated-dev.json') {
        if (entry.name.startsWith('.') || /credential|service.?account|\.env|\.p8$|\.pem$|\.key$/i.test(entry.name)) {
          throw new Error('Forbidden file in isolated DEV build.');
        }
        const body = await fs.readFile(file);
        files.set('/' + rel, body);
        hash.update(rel + '\0'); hash.update(body); hash.update('\0');
      }
    }
  }
  await walk(root);
  return {hash: hash.digest('hex'), files};
}

export async function fingerprint(root) { return (await snapshotTree(root)).hash; }

export async function createDevServer(root, source, {port = PORT} = {}) {
  const canonical = await fs.realpath(root);
  const manifest = JSON.parse(await fs.readFile(path.join(canonical, 'isolated-dev.json'), 'utf8'));
  validateManifest(manifest);
  const snapshot = await snapshotTree(canonical);
  if (manifest.dirty || manifest.source !== source || snapshot.hash !== manifest.treeSha256) {
    throw new Error('Stale, dirty or modified DEV build; rebuild from the current clean commit.');
  }
  const index = snapshot.files.get('/index.html')?.toString('utf8') || '';
  if (/https?:\/\/|serviceWorker|firebase/i.test(index) || !index.includes('DEV isolé')) {
    throw new Error('Unexpected DEV shell; external/normal app shell refused.');
  }
  return http.createServer(async (req, res) => {
    const expectedHost = `${HOST}:${port === 0 ? req.socket.localPort : port}`;
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (req.headers.host !== expectedHost ||
        (req.headers.origin && req.headers.origin !== `http://${expectedHost}`)) {
      res.writeHead(403).end(); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    try {
      if (req.url === '/__dev/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({...manifest, verified: true})); return;
      }
      const decoded = decodeURIComponent((req.url || '/').split('?')[0]);
      if (!decoded.startsWith('/') || decoded.includes('\\') ||
          decoded.split('/').some(part => part === '..' || part.startsWith('.')) ||
          /service_worker|firebase-messaging/i.test(decoded) ||
          decoded === '/manifest.json' || decoded === '/isolated-dev.json') {
        res.writeHead(404).end(); return;
      }
      const name = decoded === '/' ? '/index.html' : decoded;
      if (!allowedExtensions.has(path.extname(name))) {
        res.writeHead(404).end(); return;
      }
      // Serve the verified immutable snapshot, never files changed after startup.
      const body = snapshot.files.get(name);
      if (!body) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error('No custom host/root/port allowed.');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim();
  if (dirty) throw new Error('DEV server requires a clean source worktree.');
  const server = await createDevServer(path.join(root, 'build/isolated-dev'), source);
  server.listen(PORT, HOST, () => console.log(`CalyMob isolated DEV ready: http://${HOST}:${PORT} · ${source}`));
  server.on('error', () => { console.error('DEV listen failed; no fallback port/host.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
