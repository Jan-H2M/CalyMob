import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { isolatedBuildEnvironment } from './isolated-dev/environment.mjs';
const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'btq-mobile-build-'));
const env = isolatedBuildEnvironment(process.env, runtime, path.join(os.homedir(), '.pub-cache'));
const flutter = process.argv[2] || '/Users/jan/flutter/bin/flutter';
for (const args of [ ['pub', 'get', '--offline', '--enforce-lockfile'],
  ['build', 'web', '--release', '--csp', '--no-pub', '--no-wasm-dry-run', '--no-web-resources-cdn', '--pwa-strategy=none',
    '--target=tool/boutique_missions_dev/main.dart', '--output=build/btq-missions-dev', '--base-href=/mobile/', '--dart-define=BOUTIQUE_MISSIONS_DEV=true'] ]) {
  const result = spawnSync(flutter, args, { env, stdio: 'inherit', timeout: 300000 });
  if (result.status !== 0 || result.error) throw new Error('Boutique DEV build failed');
}
await fs.copyFile('tool/boutique_missions_dev/index.html', 'build/btq-missions-dev/index.html');
await fs.mkdir('build/btq-missions-dev/assets/dev-fonts', { recursive: true });
await fs.copyFile(path.resolve(flutter, '../cache/artifacts/material_fonts/Roboto-Regular.ttf'), 'build/btq-missions-dev/assets/dev-fonts/Roboto-Regular.ttf');
const manifestPath = 'build/btq-missions-dev/assets/FontManifest.json';
const fonts = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
fonts.push({ family: 'Roboto', fonts: [{ asset: 'dev-fonts/Roboto-Regular.ttf' }] });
await fs.writeFile(manifestPath, JSON.stringify(fonts));
console.log('Local-only Boutique mobile DEV built. Serve through CalyCompta scripts/boutique-missions-dev/runtime.mjs.');
