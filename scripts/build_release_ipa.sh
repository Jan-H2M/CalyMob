#!/usr/bin/env bash
# Build a signed iOS IPA from an already reviewed, clean commit.
set -euo pipefail

cd "$(dirname "$0")/.."

IPA_PATH="build/ios/ipa/calymob.ipa"
ARCHIVE_PATH="build/ios/archive/Runner.xcarchive"
ARCHIVE_INFO="$ARCHIVE_PATH/Products/Applications/Runner.app/Info.plist"
BUILD_START_MARKER=""

cleanup() {
  local exit_code=$?
  set +e
  if [[ "$exit_code" -ne 0 ]]; then
    rm -f -- "$IPA_PATH"
    rm -rf -- "$ARCHIVE_PATH"
  fi
  if [[ -n "$BUILD_START_MARKER" ]]; then
    rm -f -- "$BUILD_START_MARKER"
  fi
  trap - EXIT
  exit "$exit_code"
}
trap cleanup EXIT

require_clean_checkout() {
  local checkout_status
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "Unable to verify Git checkout cleanliness." >&2
    return 1
  fi
  if [[ -n "$checkout_status" ]]; then
    echo "Release build requires a completely clean Git checkout." >&2
    return 1
  fi
}

require_source_unchanged() {
  local phase="$1"
  local current_commit current_tree checkout_status
  current_commit=$(git rev-parse --verify HEAD) \
    || { echo "Unable to verify Git commit during $phase." >&2; return 1; }
  current_tree=$(git rev-parse --verify 'HEAD^{tree}') \
    || { echo "Unable to verify Git tree during $phase." >&2; return 1; }
  checkout_status=$(git status --porcelain=v1 --untracked-files=all) \
    || { echo "Unable to verify Git checkout during $phase." >&2; return 1; }
  if [[ "$current_commit" != "$SOURCE_COMMIT" || "$current_tree" != "$SOURCE_TREE" ]]; then
    echo "Git HEAD/tree changed during $phase." >&2
    return 1
  fi
  if [[ -n "$checkout_status" ]]; then
    echo "Git checkout changed during $phase." >&2
    return 1
  fi
}

if [[ "$#" -ne 0 ]]; then
  echo "Usage: $0" >&2
  echo "Bump, review and commit the version before this clean-tree build." >&2
  exit 2
fi

require_clean_checkout
SOURCE_COMMIT=$(git rev-parse --verify HEAD)
SOURCE_TREE=$(git rev-parse --verify 'HEAD^{tree}')
VERSION_LINE=$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)
if [[ ! "$VERSION_LINE" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]]; then
  echo "Invalid pubspec version: $VERSION_LINE" >&2
  exit 1
fi
VERSION="${BASH_REMATCH[1]}"
BUILD="${BASH_REMATCH[2]}"

bash scripts/verify_payment_release.sh
require_source_unchanged "release checks"

flutter clean
flutter pub get --enforce-lockfile
(
  cd ios
  pod install --deployment
)
require_source_unchanged "dependency setup"

rm -f -- "$IPA_PATH"
rm -rf -- "$ARCHIVE_PATH"
BUILD_START_MARKER=$(mktemp "${TMPDIR:-/tmp}/calymob-ipa-build.XXXXXX")
flutter build ipa --release

if [[ ! -s "$IPA_PATH" || "$IPA_PATH" -ot "$BUILD_START_MARKER" ]]; then
  echo "Release build did not create a fresh non-empty IPA." >&2
  exit 1
fi
if [[ ! -s "$ARCHIVE_INFO" || "$ARCHIVE_INFO" -ot "$BUILD_START_MARKER" ]]; then
  echo "Release build did not create a fresh archive Info.plist." >&2
  exit 1
fi

ARTIFACT_VERSION=$(plutil -extract CFBundleShortVersionString raw -o - "$ARCHIVE_INFO")
ARTIFACT_BUILD=$(plutil -extract CFBundleVersion raw -o - "$ARCHIVE_INFO")
if [[ "$ARTIFACT_VERSION" != "$VERSION" || "$ARTIFACT_BUILD" != "$BUILD" ]]; then
  echo "IPA version/build does not match pubspec.yaml." >&2
  exit 1
fi
if [[ "$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)" != "$VERSION_LINE" ]]; then
  echo "pubspec version changed during the build." >&2
  exit 1
fi
require_source_unchanged "the release build"

IPA_SHA256=$(shasum -a 256 "$IPA_PATH" | awk '{print $1}')
if [[ ! "$IPA_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Could not calculate the IPA SHA-256." >&2
  exit 1
fi
IPA_MTIME=$(stat -f '%m' "$IPA_PATH")

printf 'SOURCE_COMMIT=%s\nSOURCE_TREE=%s\nVERSION=%s\nBUILD=%s\nIPA_MTIME_EPOCH=%s\nIPA_SHA256=%s\n' \
  "$SOURCE_COMMIT" "$SOURCE_TREE" "$VERSION" "$BUILD" "$IPA_MTIME" "$IPA_SHA256"
printf 'IPA=%s\n' "$IPA_PATH"
