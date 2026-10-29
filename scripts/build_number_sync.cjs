#!/usr/bin/env node
'use strict';

const WORKFLOW_ID = 'D11B66EC-6E95-43A4-B345-727D1992D72A';

function requireThat(condition, message) {
  if (!condition) throw new Error(`Release build-number sync blocked: ${message}`);
}

function parseVersion(value, label) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  requireThat(match, `${label} must be MAJOR.MINOR.PATCH`);
  return match.slice(1).map(Number);
}

function parseBuild(value, label) {
  const text = String(value ?? '');
  requireThat(/^\d+$/.test(text), `${label} must be a non-negative integer`);
  const number = Number(text);
  requireThat(Number.isSafeInteger(number), `${label} is outside the safe integer range`);
  return number;
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left, 'local version');
  const rightParts = parseVersion(right, 'latest App Store version');
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function assessBuildNumberSync({ localVersion, localBuild, latestVersion, latestBuild }) {
  const local = parseBuild(localBuild, 'local build');
  const latest = parseBuild(latestBuild, 'latest App Store build');
  parseVersion(localVersion, 'local version');
  parseVersion(latestVersion, 'latest App Store version');

  if (local === latest) {
    requireThat(localVersion === latestVersion,
      `build ${local} already belongs to App Store version ${latestVersion}, not local version ${localVersion}`);
    return { relation: 'matches-latest', localVersion, localBuild: local, latestVersion, latestBuild: latest };
  }

  if (local === latest + 1) {
    requireThat(compareVersions(localVersion, latestVersion) >= 0,
      `local version ${localVersion} is older than App Store version ${latestVersion}`);
    return { relation: 'reserved-next', localVersion, localBuild: local, latestVersion, latestBuild: latest };
  }

  if (local < latest) {
    throw new Error(`Release build-number sync blocked: local ${localVersion}+${local} is stale; `
      + `App Store Connect already has ${latestVersion}+${latest}. `
      + `Run scripts/bump_version.sh to reserve build ${latest + 1}.`);
  }

  throw new Error(`Release build-number sync blocked: local build ${local} skips the next App Store/Xcode Cloud `
    + `build ${latest + 1}. Run scripts/bump_version.sh to reserve the live next build.`);
}

function validateBuildNumberRecord(record, version, build) {
  requireThat(record?.provider === 'app-store-connect', 'manifest is missing the App Store build source');
  requireThat(record.workflowId === WORKFLOW_ID, 'manifest Xcode Cloud workflow does not match CalyMob');
  requireThat(typeof record.observedAt === 'string' && Number.isFinite(Date.parse(record.observedAt)),
    'manifest App Store observation timestamp is invalid');
  requireThat(record.reservedVersion === version && String(record.reservedBuild) === String(build),
    'manifest build reservation does not match the release version/build');
  const result = assessBuildNumberSync({
    localVersion: version,
    localBuild: build,
    latestVersion: record.observedVersion,
    latestBuild: record.observedBuild,
  });
  requireThat(record.relation === result.relation, 'manifest build-number relation is inconsistent');
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireThat(['--local-version', '--local-build', '--latest-version', '--latest-build'].includes(flag)
      && value !== undefined && !Object.hasOwn(args, flag), 'invalid CLI arguments');
    args[flag] = value;
  }
  requireThat(Object.keys(args).length === 4,
    'usage: build_number_sync.cjs --local-version V --local-build N --latest-version V --latest-build N');
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = assessBuildNumberSync({
    localVersion: args['--local-version'],
    localBuild: args['--local-build'],
    latestVersion: args['--latest-version'],
    latestBuild: args['--latest-build'],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {
  WORKFLOW_ID,
  assessBuildNumberSync,
  compareVersions,
  validateBuildNumberRecord,
};
