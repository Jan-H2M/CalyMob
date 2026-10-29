#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprint, validateManifest } from './server.mjs';
import { isolatedBuildEnvironment } from './environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'build/isolated-dev');
const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'calymob-isolated-dev-build-'));
await fs.chmod(runtime, 0o700);
const flutter = process.argv[2] || 'flutter';
if (process.argv.length > 3) throw new Error('Usage: node scripts/isolated-dev/build.mjs [flutter-path]');

// Allowlist, not a blacklist: no service account, cloud token, proxy, NODE_OPTIONS,
// user .env, telemetry token or signing credential is passed to subprocesses.
const env = isolatedBuildEnvironment(process.env, runtime, path.join(os.homedir(), '.pub-cache'));
const git = (...args) => execFileSync('git', args, {cwd: root, env, encoding: 'utf8'}).trim();
const source = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=normal') !== '';

function run(args) {
  const result = spawnSync(flutter, args, {cwd: root, env, stdio: 'inherit', timeout: 300_000});
  if (result.error || result.status !== 0) throw new Error('Isolated DEV Flutter command failed.');
}

// No network is required once the locked packages and Flutter web SDK are cached.
run(['pub', 'get', '--offline', '--enforce-lockfile']);
run(['build', 'web', '--release', '--csp', '--no-pub', '--no-wasm-dry-run',
  '--no-web-resources-cdn', '--pwa-strategy=none',
  '--target=tool/isolated_dev/main.dart', `--output=${output}`,
  '--dart-define=ISOLATED_DEV=true', `--dart-define=ISOLATED_DEV_SOURCE=${source}`]);
// Normal web/index.html contains external cropper resources. Do not serve it.
await fs.copyFile(path.join(root, 'tool/isolated_dev/index.html'), path.join(output, 'index.html'));
const resolvedFlutter = await fs.realpath(path.isAbsolute(flutter) ? flutter :
  execFileSync('which', [flutter], {env, encoding:'utf8'}).trim());
const sdkFonts = path.resolve(path.dirname(resolvedFlutter), 'cache/artifacts/material_fonts');
const localFonts = path.join(output, 'assets/dev-fonts');
await fs.mkdir(localFonts, {recursive:true});
for (const name of ['Roboto-Regular.ttf','Roboto_LICENSE.txt']) {
  await fs.copyFile(path.join(sdkFonts,name), path.join(localFonts,name));
}
const emojiFont = await fs.readFile(path.join(root,'tool/isolated_dev/fonts/NotoEmoji.ttf'));
const {createHash} = await import('node:crypto');
if (createHash('sha256').update(emojiFont).digest('hex') !== 'de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551') {
  throw new Error('Unexpected offline emoji font.');
}
await fs.writeFile(path.join(localFonts,'NotoEmoji.ttf'), emojiFont);
await fs.copyFile(path.join(root,'tool/isolated_dev/fonts/OFL.txt'), path.join(localFonts,'NotoEmoji-OFL.txt'));
// Declare before engine startup too: otherwise its default Roboto fallback
// runs before the Dart entrypoint has a chance to load the offline fonts.
const fontManifestPath = path.join(output,'assets/FontManifest.json');
const fonts = JSON.parse(await fs.readFile(fontManifestPath,'utf8'));
fonts.push({family:'Roboto',fonts:[{asset:'dev-fonts/Roboto-Regular.ttf'}]},
  {family:'Noto Emoji',fonts:[{asset:'dev-fonts/NotoEmoji.ttf'}]});
await fs.writeFile(fontManifestPath, JSON.stringify(fonts));
// No service worker or production web app manifest in this separate origin.
for (const name of ['flutter_service_worker.js', 'manifest.json', '.last_build_id']) {
  await fs.rm(path.join(output, name), {force: true});
}
const manifest = {schema: 1, workItem: 'DEV-ISOLATION-001', source, dirty,
  entrypoint: 'tool/isolated_dev/main.dart', data: 'fictional-in-memory',
  backend: 'none', origin: 'http://127.0.0.1:7375',
  network: 'same-origin-only', treeSha256: await fingerprint(output)};
validateManifest(manifest);
await fs.writeFile(path.join(output, 'isolated-dev.json'), JSON.stringify(manifest, null, 2), {mode: 0o600});
console.log(`Isolated DEV built: ${source}. Dirty source: ${dirty}.`);
console.log('Serve only with: node scripts/isolated-dev/server.mjs');
