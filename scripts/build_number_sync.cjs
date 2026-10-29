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

function assessBuildNumberSync({ localVersion, localBuild, cloudBuild, latestVersion, latestBuild }) {
  const local = parseBuild(localBuild, 'local build');
  const cloud = parseBuild(cloudBuild, 'latest Xcode Cloud build');
  const latest = parseBuild(latestBuild, 'latest App Store build');
  parseVersion(localVersion, 'local version');
  parseVersion(latestVersion, 'latest App Store version');

  requireThat(cloud >= latest,
    `Xcode Cloud latest build ${cloud} is behind App Store Connect build ${latest}; inspect the live counters`);

  if (local === cloud) {
    requireThat(latest === cloud,
      `Xcode Cloud consumed build ${cloud} without a matching App Store upload; reserve build ${cloud + 1}`);
    requireThat(localVersion === latestVersion,
      `build ${local} already belongs to App Store version ${latestVersion}, not local version ${localVersion}`);
    return { relation: 'matches-latest-cloud', localVersion, localBuild: local, cloudBuild: cloud,
      latestVersion, latestBuild: latest };
  }

  if (local === cloud + 1) {
    requireThat(compareVersions(localVersion, latestVersion) >= 0,
      `local version ${localVersion} is older than App Store version ${latestVersion}`);
    return { relation: 'reserved-next-cloud', localVersion, localBuild: local, cloudBuild: cloud,
      latestVersion, latestBuild: latest };
  }

  if (local < cloud) {
    throw new Error(`Release build-number sync blocked: local ${localVersion}+${local} is stale; `
      + `Xcode Cloud already consumed build ${cloud}. `
      + `Run scripts/bump_version.sh to reserve build ${cloud + 1}.`);
  }

  throw new Error(`Release build-number sync blocked: local build ${local} skips the next Xcode Cloud `
    + `build ${cloud + 1}. Run scripts/bump_version.sh to reserve the live next build.`);
}

function validateBuildNumberRecord(record, version, build) {
  requireThat(record?.provider === 'xcode-cloud', 'manifest is missing the Xcode Cloud build source');
  requireThat(record.workflowId === WORKFLOW_ID, 'manifest Xcode Cloud workflow does not match CalyMob');
  requireThat(typeof record.latestRunId === 'string' && /^[a-f0-9-]+$/i.test(record.latestRunId),
    'manifest latest Xcode Cloud run ID is invalid');
  requireThat(typeof record.observedAt === 'string' && Number.isFinite(Date.parse(record.observedAt)),
    'manifest App Store observation timestamp is invalid');
  requireThat(record.reservedVersion === version && String(record.reservedBuild) === String(build),
    'manifest build reservation does not match the release version/build');
  const result = assessBuildNumberSync({
    localVersion: version,
    localBuild: build,
    cloudBuild: record.latestRunNumber,
    latestVersion: record.latestUploadedVersion,
    latestBuild: record.latestUploadedBuild,
  });
  requireThat(record.relation === result.relation, 'manifest build-number relation is inconsistent');
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireThat(['--local-version', '--local-build', '--cloud-build', '--latest-version', '--latest-build'].includes(flag)
      && value !== undefined && !Object.hasOwn(args, flag), 'invalid CLI arguments');
    args[flag] = value;
  }
  requireThat(Object.keys(args).length === 5,
    'usage: build_number_sync.cjs --local-version V --local-build N --cloud-build N --latest-version V --latest-build N');
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = assessBuildNumberSync({
    localVersion: args['--local-version'],
    localBuild: args['--local-build'],
    cloudBuild: args['--cloud-build'],
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
