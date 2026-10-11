const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Writable } = require('node:stream');
const { ORIGIN, createHandler, loginHtml, webConfig, assertClubMonitor } = require('./live-preview-login.cjs');
const { UID, EMAIL, roleFields } = require('./single-live-account.cjs');

function fixture({ preflight = async()=>{}, readCredential = ()=> 'synthetic-only', now = ()=> 0 } = {}) {
  let reads = 0;
  const handler = createHandler({root:__dirname, config:{projectId:'calycompta'}, nonce:'synthetic-nonce',
    preflight, now, readCredential:()=>{ reads++;return readCredential(); }});
  const request = async (url='/__qa/login', method='GET', headers={}) => {
    const chunks = [];
    const res = new Writable({write(chunk,_,cb){chunks.push(chunk);cb();}});
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (name,value)=>{res.headers[name.toLowerCase()]=value;};
    res.writeHead = status=>{res.statusCode=status;return res;};
    const done = new Promise(resolve=>res.on('finish',resolve));
    await handler({url,method,headers:{host:'localhost:7359',...headers}},res);
    await done;
    return {status:res.statusCode, headers:res.headers, body:Buffer.concat(chunks).toString()};
  };
  const headers = {origin:ORIGIN,'sec-fetch-site':'same-origin',
    'content-type':'application/json','x-qa-nonce':'synthetic-nonce'};
  return {request, headers, reads:()=>reads};
}

test('only the hidden real MC user profile, never administrator or directory member', ()=>{
  const user={uid:UID,email:EMAIL,disabled:false,customClaims:{app_role:'user',role:'user',clubId:'calypso'}};
  const member={...roleFields('mc'),email:EMAIL,has_app_access:true};
  assertClubMonitor(user,member,false);
  for (const patch of [{app_role:'admin'},{plongeur_code:'AM'},{exclude_from_directory:false},
    {is_test_account:false},{has_app_access:false},{clubStatuten:['Membre']}]) {
    assert.throws(()=>assertClubMonitor(user,{...member,...patch},false));
  }
  assert.throws(()=>assertClubMonitor({...user,disabled:true},member,false));
  assert.throws(()=>assertClubMonitor({...user,customClaims:{...user.customClaims,role:'admin'}},member,false));
  assert.throws(()=>assertClubMonitor(user,member,true));
  assert.throws(()=>assertClubMonitor(null,member,false));
});

test('credential GET, missing origin/nonce, foreign origins and replays never read Keychain', async()=>{
  const f=fixture();
  assert.equal((await f.request('/__qa/credential','POST',f.headers)).status,403);
  const page=await f.request();
  assert.equal(page.status,200);
  assert.equal(page.headers['cache-control'],'no-store');
  assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal((await f.request('/__qa/credential')).status,405);
  for(const patch of [{origin:undefined},{origin:'https://evil.invalid'},
    {'x-qa-nonce':undefined},{'x-qa-nonce':'wrong'},{host:'evil.invalid'},
    {'content-type':'text/plain'},{'sec-fetch-site':'cross-site'}]) {
    assert.equal((await f.request('/__qa/credential','POST',{...f.headers,...patch})).status,403);
  }
  assert.equal(f.reads(),0);
  assert.equal((await f.request('/__qa/credential','POST',f.headers)).status,200);
  assert.equal(f.reads(),1);
  assert.equal((await f.request('/__qa/credential','POST',f.headers)).status,410);
  assert.equal(f.reads(),1);
});

test('expired login page and credential request do not read Keychain', async()=>{
  let time=0;const f=fixture({now:()=>time});
  assert.equal((await f.request()).status,200);
  time=120_000;
  assert.equal((await f.request('/__qa/credential','POST',f.headers)).status,410);
  assert.equal((await f.request()).status,410);
  assert.equal(f.reads(),0);
});

test('one page only and concurrent requests have exactly one credential read', async()=>{
  let proceed; const gate=new Promise(resolve=>proceed=resolve);
  const f=fixture({preflight:()=>gate});
  assert.equal((await f.request()).status,200);
  assert.equal((await f.request()).status,410);
  const first=f.request('/__qa/credential','POST',f.headers);
  assert.equal((await f.request('/__qa/credential','POST',f.headers)).status,410);
  proceed();
  assert.equal((await first).status,200);
  assert.equal(f.reads(),1);
});

test('preflight or Keychain failures consume the attempt and never expose raw errors', async()=>{
  for(const options of [
    {preflight:async()=>{throw Error('synthetic-private-details');}},
    {readCredential:()=>{throw Error('synthetic-private-details');}}
  ]) {
    const f=fixture(options);
    await f.request();
    const failed=await f.request('/__qa/credential','POST',f.headers);
    assert.equal(failed.status,503);
    assert.doesNotMatch(failed.body,/synthetic-private-details/);
    assert.equal((await f.request('/__qa/credential','POST',f.headers)).status,410);
  }
});

test('public asset server rejects other verbs, outside paths and symlinks', async()=>{
  const f=fixture();
  assert.equal((await f.request('/single-live-account.cjs','POST')).status,405);
  assert.equal((await f.request('/../../../../AGENTS.md')).status,404);
  assert.equal((await f.request('/%2f..%2f..%2fAGENTS.md')).status,404);
  assert.equal((await f.request('//evil.invalid/file')).status,400);
  assert.equal((await f.request('/%00')).status,404);
  assert.equal((await f.request('https://evil.invalid/')).status,400);
});

test('web configuration is exact and browser uses genuine Firebase password login only', ()=>{
  const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../lib/firebase_options.dart'),'utf8');
  const config=webConfig(source);
  assert.equal(config.projectId,'calycompta');
  assert.throws(()=>webConfig(source.replaceAll('calycompta','other')));
  const html=loginHtml(config,'synthetic-nonce');
  assert.match(html,/signInWithEmailAndPassword\(auth, credential.email, credential.password\)/);
  assert.match(html,/signedIn.user.uid !== "calymob-qa-jan"/);
  assert.match(html,/location.replace\('\/'\)/);
  assert.match(html,/credential.password = ''/);
  assert.doesNotMatch(html,/customToken|localStorage\.setItem|console\.(log|error)|synthetic-only/);
});
