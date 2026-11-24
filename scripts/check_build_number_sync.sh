#!/usr/bin/env bash
set -euo pipefail

tooling_root=$(cd "$(dirname "$0")/.." && pwd)
release_root=${1:-$tooling_root}
if [[ "$release_root" != /* || ! -f "$release_root/pubspec.yaml" ]]; then
  echo 'Release build-number sync blocked: release root must be an absolute CalyMob checkout.' >&2
  exit 1
fi

version_line=$(awk '$1 == "version:" { print $2; exit }' "$release_root/pubspec.yaml")
if [[ ! "$version_line" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]]; then
  echo 'Release build-number sync blocked: invalid pubspec version.' >&2
  exit 1
fi
local_version=${BASH_REMATCH[1]}
local_build=${BASH_REMATCH[2]}
IFS=$'\t' read -r cloud_build latest_version latest_build < <("$tooling_root/scripts/read_xcode_cloud_build_status.sh" tsv)

node "$tooling_root/scripts/build_number_sync.cjs" \
  --local-version "$local_version" \
  --local-build "$local_build" \
  --cloud-build "$cloud_build" \
  --latest-version "$latest_version" \
  --latest-build "$latest_build" >/dev/null

printf 'Build-number sync verified: local %s+%s; Xcode Cloud latest %s; App Store Connect latest %s+%s.\n' \
  "$local_version" "$local_build" "$cloud_build" "$latest_version" "$latest_build"
