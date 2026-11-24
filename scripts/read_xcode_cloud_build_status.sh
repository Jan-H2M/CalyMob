#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
output=$(mktemp "${TMPDIR:-/tmp}/calymob-xcc-status.XXXXXX")
cleanup() { rm -f "$output"; }
trap cleanup EXIT INT TERM

if ! FASTLANE_SKIP_UPDATE_CHECK=1 env -u CALYMOB_RELEASE_ROOT \
  "$repo_root/scripts/run_fastlane.sh" ios build_number_status >"$output" 2>&1; then
  echo 'Unable to read the CalyMob Xcode Cloud/App Store Connect counters; release numbering cannot continue.' >&2
  exit 1
fi

marker() {
  local name=$1 pattern=$2
  local value
  value=$(sed -n "s/.*${name}=\\(${pattern}\\).*/\\1/p" "$output")
  [[ $(printf '%s\n' "$value" | awk 'NF {n++} END {print n+0}') -eq 1 ]] || {
    echo "App Store Connect returned an ambiguous ${name} marker." >&2
    exit 1
  }
  printf '%s' "$value"
}

optional_marker() {
  local name=$1 pattern=$2
  local value
  value=$(sed -n "s/.*${name}=\\(${pattern}\\).*/\\1/p" "$output")
  [[ $(printf '%s\n' "$value" | awk 'NF {n++} END {print n+0}') -le 1 ]] || {
    echo "App Store Connect returned an ambiguous ${name} marker." >&2
    exit 1
  }
  printf '%s' "$value"
}

workflow_id=$(marker CALYMOB_XCC_WORKFLOW_ID '[A-Fa-f0-9-][A-Fa-f0-9-]*')
run_id=$(marker CALYMOB_XCC_RUN_ID '[A-Fa-f0-9-][A-Fa-f0-9-]*')
cloud_build=$(marker CALYMOB_XCC_BUILD '[0-9][0-9]*')
created_at=$(marker CALYMOB_XCC_CREATED_AT '[0-9TZ:.+-][0-9TZ:.+-]*')
execution=$(marker CALYMOB_XCC_EXECUTION '[A-Z][A-Z_]*')
completion=$(marker CALYMOB_XCC_COMPLETION '[A-Z][A-Z_]*')
source_commit=$(marker CALYMOB_XCC_SOURCE_COMMIT '[a-f0-9][a-f0-9]*')
finished_at=$(marker CALYMOB_XCC_FINISHED_AT '[0-9TZ:.+-][0-9TZ:.+-]*')
linked_id=$(optional_marker CALYMOB_XCC_ASC_BUILD_ID '[A-Fa-f0-9-][A-Fa-f0-9-]*')
linked_version=$(optional_marker CALYMOB_XCC_ASC_VERSION '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*')
linked_build=$(optional_marker CALYMOB_XCC_ASC_BUILD '[0-9][0-9]*')
linked_processing=$(optional_marker CALYMOB_XCC_ASC_PROCESSING '[A-Z][A-Z_]*')
latest_version=$(marker CALYMOB_ASC_VERSION '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*')
latest_build=$(marker CALYMOB_ASC_BUILD '[0-9][0-9]*')

[[ "$workflow_id" == 'D11B66EC-6E95-43A4-B345-727D1992D72A' \
  && "$run_id" =~ ^[A-Fa-f0-9-]{36}$ \
  && "$source_commit" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Xcode Cloud returned invalid workflow/run/source identifiers.' >&2
  exit 1
}

[[ "$execution" == COMPLETE ]] || {
  echo "Latest Xcode Cloud build $cloud_build is still $execution; wait for it to finish before reserving another build." >&2
  exit 1
}
linked_json=null
if [[ -n "$linked_id" || -n "$linked_version" || -n "$linked_build" || -n "$linked_processing" ]]; then
  [[ -n "$linked_id" && -n "$linked_version" && -n "$linked_build" && -n "$linked_processing" ]] || {
    echo 'Latest Xcode Cloud run returned incomplete linked App Store build metadata.' >&2
    exit 1
  }
  linked_json=$(printf '{"id":"%s","version":"%s","build":%s,"processingState":"%s"}' \
    "$linked_id" "$linked_version" "$linked_build" "$linked_processing")
fi

case "${1:-json}" in
  json)
    printf '{"workflowId":"%s","latestRun":{"id":"%s","number":%s,"createdAt":"%s","finishedAt":"%s","executionProgress":"%s","completionStatus":"%s","sourceCommit":"%s","appStoreBuild":%s},"latestUploaded":{"version":"%s","build":%s}}\n' \
      "$workflow_id" "$run_id" "$cloud_build" "$created_at" "$finished_at" "$execution" "$completion" \
      "$source_commit" "$linked_json" "$latest_version" "$latest_build"
    ;;
  tsv) printf '%s\t%s\t%s\n' "$cloud_build" "$latest_version" "$latest_build" ;;
  *) echo 'Usage: read_xcode_cloud_build_status.sh [json|tsv]' >&2; exit 64 ;;
esac
