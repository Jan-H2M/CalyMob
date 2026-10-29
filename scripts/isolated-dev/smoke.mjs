#!/usr/bin/env node
// Verify actual release artifacts in fresh browser contexts, never a real profile.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createDevServer, HOST, PORT} from './server.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if (execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()) {
  throw new Error('DEV release smoke requires a clean worktree.');
}
const packageRoot = process.env.ISOLATED_DEV_PLAYWRIGHT_ROOT ||
  path.join(root,'.dart_tool/isolated-dev/node_modules/playwright-core');
const dependency = JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'));
if (dependency.name !== 'playwright-core' || dependency.version !== '1.62.1') {
  throw new Error('DEV smoke requires pinned playwright-core 1.62.1.');
}
const {chromium} = await import(pathToFileURL(path.join(packageRoot,'index.mjs')));
const chrome = process.env.CHROME_EXECUTABLE || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const runtime = await fs.mkdtemp(path.join(os.tmpdir(),'calymob-dev-smoke-'));
await fs.chmod(runtime,0o700);
const server = await createDevServer(path.join(root,'build/isolated-dev'),source);
server.listen(PORT,HOST); await once(server,'listening');
let browser;
try {
  browser = await chromium.launch({executablePath:chrome,headless:true,chromiumSandbox:true,
    timeout:20_000,
    env:{PATH:process.env.PATH,HOME:runtime,TMPDIR:runtime,LANG:'en_US.UTF-8'},
    args:['--disable-background-networking','--disable-quic','--disable-component-update',
      '--disable-sync','--no-first-run','--no-default-browser-check',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1']});
  const origin = `http://${HOST}:${PORT}`;
  const artifacts = path.join(root,'build/isolated-dev-smoke');
  await fs.mkdir(artifacts,{recursive:true});
  for (const [scenario,expected] of [
    ['students',['Bert FICTIF','Yves FICTIF','Aaron FICTIF']],
    ['payments',['À payer','Paiement confirmé : non']],
    ['registration',['Les tarifs de cette activité doivent être corrigés']],
  ]) {
    const context = await browser.newContext({serviceWorkers:'block',acceptDownloads:false,
      viewport:{width:1100,height:900}});
    const denied = [], errors = [];
    await context.route('**/*',route => {
      const u = new URL(route.request().url());
      if (u.origin !== origin) { denied.push(u.origin); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror',()=>errors.push('pageerror'));
    await page.goto(`${origin}/?scenario=${scenario}`,{waitUntil:'load',timeout:15_000});
    for (const text of expected) {
      await page.waitForFunction(value => {
        const labels = document.body.innerText + '\n' +
          Array.from(document.querySelectorAll('[aria-label]')).map(e=>e.getAttribute('aria-label')).join('\n');
        return labels.includes(value);
      },text,{timeout:15_000});
    }
    if (denied.length || errors.length) throw new Error(`DEV scenario has blocked traffic/errors: ${scenario}`);
    await page.screenshot({path:path.join(artifacts,`${scenario}.png`),fullPage:true});
    await context.close();
    console.log(`PASS release artifact: ${scenario}`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
