'use strict';

// QA-002: local-only normal password sign-in before opening the unmodified app.
// No custom tokens, impersonation, admin login, password files or log payloads.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { PROJECT, UID, EMAIL, assertManaged, validateEnvironment,
  keychainPassword } = require('./single-live-account.cjs');
const PORT = 7359;
const ORIGIN = `http://localhost:${PORT}`;
const TTL = 120_000;
const SDK_VERSION = '12.3.0'; // Same version as firebase_core_web 3.3.1.

function webConfig(source) {
  const block = source.match(/static const FirebaseOptions web = FirebaseOptions\(([\s\S]*?)\);/);
  if (!block) throw Error('Missing web Firebase configuration.');
  const config = {};
  for (const name of ['apiKey', 'appId', 'messagingSenderId', 'projectId', 'authDomain', 'storageBucket']) {
    const match = block[1].match(new RegExp(`${name}: '([^']+)'`));
    if (!match) throw Error('Incomplete web Firebase configuration.');
    config[name] = match[1];
  }
  if (config.projectId !== PROJECT || config.authDomain !== `${PROJECT}.firebaseapp.com`) {
    throw Error('Refusing another Firebase project.');
  }
  return config;
}

function assertClubMonitor(authUser, member, directoryExists) {
  assertManaged(authUser, member);
  if (!authUser || !member || authUser.disabled || directoryExists ||
      member.app_role !== 'user' || member.app_status !== 'active' ||
      member.plongeur_code !== 'MC' || !member.clubStatuten?.includes('Encadrant') ||
      member.has_app_access !== true || authUser.customClaims?.app_role !== 'user' ||
      authUser.customClaims?.role !== 'user' || authUser.customClaims?.clubId !== 'calypso') {
    throw Error('The hidden active MC profile is required. No automatic permission changes.');
  }
}

function loginHtml(config, nonce) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<title>CalyMob — veilige QA-aanmelding</title>
<style nonce="${nonce}">body{font:18px system-ui;background:#eef5fb;color:#193859;padding:50px;max-width:700px;margin:auto}h1{font-size:26px}</style></head>
<body><h1>CalyMob · Moniteur Club</h1><p id="status">Veilig aanmelden met het vaste QA-account…</p>
<p>Daarna opent de volledige Flutter-app met de echte clubgegevens.</p>
<script type="module" nonce="${nonce}">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js';
import { getAuth, setPersistence, indexedDBLocalPersistence, signInWithEmailAndPassword, signOut }
  from 'https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js';
let credential;
let auth;
try {
  auth = getAuth(initializeApp(${JSON.stringify(config)}));
  await setPersistence(auth, indexedDBLocalPersistence);
  // Only this same-origin, one-use, short-lived request reads Keychain.
  const response = await fetch('/__qa/credential', { method:'POST',
    headers:{'Content-Type':'application/json','X-QA-Nonce':${JSON.stringify(nonce)}},
    body:'{}', cache:'no-store', redirect:'error' });
  if (!response.ok) throw Error('qa/login-unavailable');
  credential = await response.json();
  const signedIn = await signInWithEmailAndPassword(auth, credential.email, credential.password);
  credential.password = '';
  credential = null;
  if (signedIn.user.uid !== ${JSON.stringify(UID)} || signedIn.user.email !== ${JSON.stringify(EMAIL)}) {
    await signOut(auth); throw Error('qa/identity-mismatch');
  }
  location.replace('/');
} catch (error) {
  if (credential) credential.password = '';
  credential = null;
  // Codes are allowlisted; never show raw exceptions, tokens or passwords.
  const codes = ['auth/invalid-credential','auth/user-disabled','auth/network-request-failed',
    'auth/too-many-requests','qa/identity-mismatch'];
  const code = codes.includes(error?.code) ? error.code : 'qa/login-unavailable';
  document.getElementById('status').textContent = 'Aanmelding gestopt (' + code + '). Start de lokale QA-hulp opnieuw; wijzig geen echt ledenaccount.';
}
</script></body></html>`;
}

function createHandler({ root, config, readCredential, preflight, now = Date.now,
  ttl = TTL, nonce = crypto.randomBytes(32).toString('base64url') }) {
  const expires = now() + ttl;
  let delivered = false;
  let pageServed = false;
  const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
    '.json':'application/json', '.wasm':'application/wasm', '.css':'text/css',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
    '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.ico':'image/x-icon' };
  return async (req, res) => {
    const fail = (status, message = 'QA request rejected.') => { res.writeHead(status); res.end(message); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.headers.host !== `localhost:${PORT}` ||
        (req.headers.origin && req.headers.origin !== ORIGIN) ||
        (req.headers['sec-fetch-site'] && !['none', 'same-origin'].includes(req.headers['sec-fetch-site']))) {
      return fail(403);
    }
    // No external forwards, CORS, arbitrary upstream URLs or proxy requests.
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return fail(400);
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname); }
    catch { return fail(400); }
    if (pathname.startsWith('/__qa/')) {
      res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com; style-src 'nonce-${nonce}'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
      if (now() >= expires || delivered) return fail(410, 'QA login window closed. Restart the local helper.');
      if (pathname === '/__qa/login') {
        if (req.method !== 'GET') return fail(405);
        if (pageServed) return fail(410);
        pageServed = true;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(loginHtml(config, nonce));
      }
      if (pathname !== '/__qa/credential') return fail(404);
      if (req.method !== 'POST') return fail(405);
      if (!pageServed || req.headers.origin !== ORIGIN ||
          req.headers['content-type'] !== 'application/json' ||
          req.headers['x-qa-nonce'] !== nonce) return fail(403);
      // Consume synchronously before any async work, including failed attempts.
      delivered = true;
      try {
        await preflight();
        const password = readCredential();
        if (typeof password !== 'string' || !password) throw Error('Missing credential.');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ email: EMAIL, password }));
      } catch { fail(503, 'QA login unavailable. No credentials logged.'); }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
    // Serve existing compiled public assets only; never source, keychain or keys.
    try {
      const target = fs.realpathSync(path.join(root, pathname === '/' ? 'index.html' : pathname));
      if (!target.startsWith(root + path.sep) || !fs.statSync(target).isFile()) return fail(404);
      res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(target);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch { fail(404); }
  };
}

async function start(args, env = process.env) {
  if (args.length !== 1 || !args[0].startsWith('--web-root=')) throw Error('Pass the existing full release build with --web-root=.');
  const root = fs.realpathSync(args[0].slice(11));
  if (path.basename(root) !== 'web' || path.basename(path.dirname(root)) !== 'build' ||
      !fs.statSync(path.join(root, 'main.dart.js')).isFile() ||
      !fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('flutter_bootstrap.js')) {
    throw Error('Require an existing complete Flutter web release build.');
  }
  const builtApp = fs.readFileSync(path.join(root, 'main.dart.js'), 'utf8');
  if (!builtApp.includes(PROJECT) || !builtApp.includes('AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU') ||
      builtApp.includes('demo-calymob-qa')) throw Error('Refusing a demo or another production target.');
  const config = webConfig(fs.readFileSync(path.resolve(__dirname, '../../lib/firebase_options.dart'), 'utf8'));
  if (!env.QA_SERVICE_ACCOUNT_FILE) throw Error('Use the existing protected account reference.');
  const serviceAccount = JSON.parse(fs.readFileSync(env.QA_SERVICE_ACCOUNT_FILE, 'utf8'));
  validateEnvironment(env, serviceAccount);
  const admin = require('firebase-admin');
  const app = admin.initializeApp({ projectId: PROJECT, credential: admin.credential.cert(serviceAccount) });
  const preflight = async () => {
    const db = app.firestore();
    const [user, member, directory] = await Promise.all([
      app.auth().getUser(UID), db.doc(`clubs/calypso/members/${UID}`).get(),
      db.doc(`clubs/calypso/member_directory/${UID}`).get()]);
    assertClubMonitor(user, member.exists ? member.data() : null, directory.exists);
  };
  try {
    await preflight();
    const server = http.createServer(createHandler({root, config, preflight, readCredential:keychainPassword}));
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    server.on('clientError', (_, socket) => socket.destroy());
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, '127.0.0.1', resolve);
    });
    // This URL contains no password, nonce, token or third-party credentials.
    console.log(JSON.stringify({ preview: `${ORIGIN}/__qa/login`,
      identity: EMAIL, profile: 'Encadrant + Moniteur Club', loginWindowSeconds: TTL / 1000,
      source: root, secretsLogged: false, appModified: false }));
    let stopping = false;
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await app.delete();
    });
    return server;
  } catch (error) { await app.delete(); throw error; }
}

module.exports = { ORIGIN, PORT, TTL, webConfig, assertClubMonitor, loginHtml, createHandler, start };
if (require.main === module) start(process.argv.slice(2)).catch(() => {
  console.error('QA preview stopped safely. Verify the release build, hidden MC profile and Keychain access.');
  process.exitCode = 1;
});
