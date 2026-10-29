#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
output=$(mktemp "${TMPDIR:-/tmp}/calymob-asc-build.XXXXXX")
cleanup() { rm -f "$output"; }
trap cleanup EXIT INT TERM

if ! FASTLANE_SKIP_UPDATE_CHECK=1 env -u CALYMOB_RELEASE_ROOT \
  "$repo_root/scripts/run_fastlane.sh" ios build_number_status >"$output" 2>&1; then
  echo 'Unable to read the latest CalyMob build from App Store Connect; release numbering cannot be reserved.' >&2
  exit 1
fi

version=$(sed -n 's/.*CALYMOB_ASC_VERSION=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' "$output")
build=$(sed -n 's/.*CALYMOB_ASC_BUILD=\([0-9][0-9]*\).*/\1/p' "$output")
if [[ $(printf '%s\n' "$version" | awk 'NF {n++} END {print n+0}') -ne 1 \
  || $(printf '%s\n' "$build" | awk 'NF {n++} END {print n+0}') -ne 1 ]]; then
  echo 'App Store Connect returned an ambiguous CalyMob version/build result.' >&2
  exit 1
fi

case "${1:-json}" in
  json) printf '{"version":"%s","build":%s}\n' "$version" "$build" ;;
  tsv) printf '%s\t%s\n' "$version" "$build" ;;
  *) echo 'Usage: read_app_store_build_number.sh [json|tsv]' >&2; exit 64 ;;
esac
