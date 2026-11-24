#!/bin/sh
set -eu

EXPECTED_WORKFLOW_ID='D11B66EC-6E95-43A4-B345-727D1992D72A'
PUBSPEC_PATH=${1:-pubspec.yaml}

[ "${CI_XCODE_CLOUD:-}" = TRUE ] || {
  echo 'This release build must run in Xcode Cloud.' >&2
  exit 1
}
[ "${CI_WORKFLOW_ID:-}" = "$EXPECTED_WORKFLOW_ID" ] || {
  echo "Xcode Cloud workflow ${CI_WORKFLOW_ID:-missing} is not the reviewed CalyMob release workflow." >&2
  exit 1
}
case "${CI_BUILD_NUMBER:-}" in
  ''|*[!0-9]*) echo 'CI_BUILD_NUMBER must be supplied by Xcode Cloud.' >&2; exit 1 ;;
esac

RESERVED_BUILD_NUMBER=$(sed -n 's/^version: *[^+ ]*+\([0-9][0-9]*\).*/\1/p' "$PUBSPEC_PATH")
[ -n "$RESERVED_BUILD_NUMBER" ] || {
  echo 'pubspec.yaml must reserve a numeric Xcode Cloud build number.' >&2
  exit 1
}
[ "$CI_BUILD_NUMBER" -eq "$RESERVED_BUILD_NUMBER" ] || {
  echo "Xcode Cloud build $CI_BUILD_NUMBER does not match pubspec reservation $RESERVED_BUILD_NUMBER." >&2
  echo 'Run scripts/bump_version.sh again; it reads failed and canceled cloud runs too.' >&2
  exit 1
}
