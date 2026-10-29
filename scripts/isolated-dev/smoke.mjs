#!/usr/bin/env node
// Exercise the actual compiled release artifact, not a debug-only SDK mock.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createDevServer, HOST, PORT} from './server.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const chrome = process.env.CHROME_EXECUTABLE || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const runtime = await fs.mkdtemp(path.join(os.tmpdir(),'calymob-dev-smoke-'));
await fs.chmod(runtime,0o700);
const server = await createDevServer(path.join(root,'build/isolated-dev'),source);
server.listen(PORT,HOST); await once(server,'listening');
async function render(scenario) {
  const profile = path.join(runtime,scenario); await fs.mkdir(profile,{mode:0o700});
  return new Promise((resolve,reject) => {
    const child = spawn(chrome,['--headless=new','--disable-gpu','--disable-quic',
      '--disable-background-networking','--disable-extensions','--disable-component-update',
      '--disable-sync','--no-first-run','--no-default-browser-check',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1',
      `--user-data-dir=${profile}`,'--dump-dom','--virtual-time-budget=7000',
      `http://${HOST}:${PORT}/?scenario=${scenario}`],
    {env:{PATH:process.env.PATH, HOME:runtime, TMPDIR:runtime, LANG:'en_US.UTF-8'}});
    let output = ''; const timer = setTimeout(()=>{child.kill('SIGTERM');reject(new Error('DEV release smoke timed out'));},30_000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>3_000_000)child.kill('SIGTERM');});
    // Discard Chromium OS diagnostics: no user profile or external page is used.
    child.stderr.resume();
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error('DEV Chrome smoke failed'));});
  });
}
try {
  for (const [scenario,expected] of [
    ['students',['Bert FICTIF','Yves FICTIF','Aaron FICTIF']],
    ['payments',['À payer','Paiement confirmé : non']],
    ['registration',['Les tarifs de cette activité doivent être corrigés']],
  ]) {
    const html = await render(scenario);
    if (expected.some(text=>!html.includes(text)) || html.includes('Scénario DEV indisponible')) {
      throw new Error(`Compiled DEV scenario failed: ${scenario}`);
    }
    console.log(`PASS release artifact: ${scenario}`);
  }
} finally { await new Promise(resolve=>server.close(resolve)); }
