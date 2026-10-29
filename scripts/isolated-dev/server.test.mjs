import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {CSP, createDevServer, fingerprint, validateManifest} from './server.mjs';
import {isolatedBuildEnvironment} from './environment.mjs';

const source = 'a'.repeat(40);
test('build subprocesses inherit no credentials, proxies or user config', () => {
  const env = isolatedBuildEnvironment({PATH:'/bin', GOOGLE_APPLICATION_CREDENTIALS:'/private/key',
    FIREBASE_TOKEN:'fixture', VERCEL_TOKEN:'fixture', GITHUB_TOKEN:'fixture',
    HTTP_PROXY:'http://outside', NODE_OPTIONS:'--require=outside', HOME:'/real-home'},
    '/tmp/dev-fixture-runtime','/packages');
  assert.deepEqual(Object.keys(env).sort(), ['PATH','LANG','CI','HOME','XDG_CONFIG_HOME',
    'XDG_CACHE_HOME','TMPDIR','PUB_CACHE','FLUTTER_SUPPRESS_ANALYTICS','DART_SUPPRESS_ANALYTICS'].sort());
  assert.equal(env.HOME,'/tmp/dev-fixture-runtime');
  assert.equal(env.PUB_CACHE,'/packages');
});
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'isolated-dev-test-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  await fs.writeFile(path.join(dir, 'index.html'), '<title>DEV isolé</title>');
  await fs.writeFile(path.join(dir, 'main.dart.js'), '/* synthetic */');
  const manifest = {schema:1, workItem:'DEV-ISOLATION-001', source, dirty:false,
    entrypoint:'tool/isolated_dev/main.dart', data:'fictional-in-memory', backend:'none',
    origin:'http://127.0.0.1:7375', network:'same-origin-only', treeSha256:await fingerprint(dir)};
  async function write(patch = {}) { await fs.writeFile(path.join(dir,'isolated-dev.json'), JSON.stringify({...manifest,...patch})); }
  await write();
  return {dir, manifest, write};
}
function get(port, url, headers = {}, method = 'GET') {
  return new Promise((resolve,reject) => {
    const req = http.request({hostname:'127.0.0.1',port,path:url,method,headers}, res => {
      let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
}
test('only the fictional credentialless manifest is accepted', async t => {
  const {manifest} = await fixture(t);
  validateManifest(manifest);
  for (const patch of [{backend:'calycompta'}, {origin:'https://caly.club'},
    {entrypoint:'lib/main.dart'}, {data:'production-export'}, {network:'unrestricted'}]) {
    assert.throws(()=>validateManifest({...manifest,...patch}));
  }
  assert.match(CSP,/connect-src 'self'/);
  assert.doesNotMatch(CSP,/https:|\*|'unsafe-eval'/);
});
test('reject dirty, stale, modified and symlinked builds', async t => {
  const {dir,write} = await fixture(t);
  await assert.rejects(createDevServer(dir,'b'.repeat(40)));
  await write({dirty:true}); await assert.rejects(createDevServer(dir,source));
  await write(); await fs.appendFile(path.join(dir,'main.dart.js'),'tampered');
  await assert.rejects(createDevServer(dir,source));
  await fs.symlink(path.join(dir,'index.html'),path.join(dir,'leak.html'));
  await assert.rejects(fingerprint(dir));
});
test('loopback server refuses cross-origin access, writes, secrets and traversal', async t => {
  const {dir} = await fixture(t);
  const server = await createDevServer(dir,source,{port:0});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const {port,address} = server.address(); assert.equal(address,'127.0.0.1');
  const home = await get(port,'/'); assert.equal(home.status,200);
  assert.equal(home.headers['content-security-policy'],CSP);
  assert.equal(home.headers['cache-control'],'no-store');
  await fs.writeFile(path.join(dir,'index.html'), 'replaced after startup');
  assert.equal((await get(port,'/')).body, home.body);
  await fs.writeFile(path.join(dir,'service-account.json'), '{"private":"not-served"}');
  assert.equal((await get(port,'/__dev/health')).status,200);
  assert.equal((await get(port,'/',{host:'caly.club'})).status,403);
  assert.equal((await get(port,'/',{origin:'https://caly.club'})).status,403);
  assert.equal((await get(port,'/',{},'POST')).status,405);
  for (const url of ['/../.env','/%2e%2e/secret.json','/.env','/service-account.json',
    '/flutter_service_worker.js','/firebase-messaging-sw.js','/isolated-dev.json','/manifest.json']) {
    assert.equal((await get(port,url)).status,404,url);
  }
});
