#!/bin/bash
# Build release APK with automatic version naming from a reviewed, clean commit.
# Usage: ./build_release.sh
set -euo pipefail

cd "$(dirname "$0")/.."

OUTPUT_DIR="build/app/outputs/flutter-apk"
APK_PATH="$OUTPUT_DIR/app-release.apk"
PACKAGED_MANIFEST="build/app/intermediates/packaged_manifests/release/processReleaseManifestForPackage/AndroidManifest.xml"
BUILD_START_MARKER=""
APK_NAME=""

cleanup() {
  local status=$?
  set +e
  unset CALYMOB_UPLOAD_STORE_FILE CALYMOB_UPLOAD_PASSWORD_FILE CALYMOB_UPLOAD_KEY_ALIAS
  if [ "$status" -ne 0 ]; then
    rm -f -- "$APK_PATH" "$PACKAGED_MANIFEST"
    if [ -n "$APK_NAME" ]; then
      rm -f -- "$OUTPUT_DIR/$APK_NAME"
    fi
  fi
  if [ -n "$BUILD_START_MARKER" ]; then
    rm -f -- "$BUILD_START_MARKER"
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

require_clean_checkout() {
  local checkout_status
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "❌ Unable to verify Git checkout cleanliness." >&2
    return 1
  fi
  if [ -n "$checkout_status" ]; then
    echo "❌ Release build requires a completely clean Git checkout." >&2
    echo "Commit or remove every tracked and untracked source change before building." >&2
    return 1
  fi
}

require_source_unchanged() {
  local phase="$1"
  local current_commit current_tree checkout_status
  if ! current_commit=$(git rev-parse --verify HEAD) \
    || ! current_tree=$(git rev-parse --verify 'HEAD^{tree}'); then
    echo "❌ Unable to verify Git source during $phase." >&2
    return 1
  fi
  if [ "$current_commit" != "$SOURCE_COMMIT" ] || [ "$current_tree" != "$SOURCE_TREE" ]; then
    echo "❌ Git HEAD/tree changed during $phase." >&2
    return 1
  fi
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "❌ Unable to verify Git checkout during $phase." >&2
    return 1
  fi
  if [ -n "$checkout_status" ]; then
    echo "❌ Git checkout changed during $phase." >&2
    return 1
  fi
}

required_signing_vars=(
  CALYMOB_UPLOAD_STORE_FILE
  CALYMOB_UPLOAD_PASSWORD_FILE
  CALYMOB_UPLOAD_KEY_ALIAS
)
for signing_var in "${required_signing_vars[@]}"; do
  if [ -z "${!signing_var:-}" ]; then
    echo "❌ Missing Android release-signing variable: $signing_var" >&2
    echo "Set only the external keystore path, password-file path and key alias; never the password itself." >&2
    exit 1
  fi
done

if [ "$#" -ne 0 ]; then
  echo "Usage: $0" >&2
  echo "Bump the version separately, review and commit it, then run this clean-tree build." >&2
  exit 2
fi

require_clean_checkout
SOURCE_COMMIT=$(git rev-parse --verify HEAD)
SOURCE_TREE=$(git rev-parse --verify 'HEAD^{tree}')

bash scripts/verify_payment_release.sh
require_source_unchanged "release checks"

# Record exact source/version before building.
FULL_VERSION=$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)
if [[ ! "$FULL_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]]; then
  echo "❌ Invalid pubspec version: $FULL_VERSION" >&2
  exit 1
fi
VERSION="${BASH_REMATCH[1]}"
BUILD="${BASH_REMATCH[2]}"
APK_NAME="calymob-$VERSION-build$BUILD.apk"

echo "Building CalyMob v$VERSION (build $BUILD)..."

# Remove stale/partial outputs before the release build.
rm -f -- "$APK_PATH" "$OUTPUT_DIR/$APK_NAME" "$PACKAGED_MANIFEST"
BUILD_START_MARKER=$(mktemp "${TMPDIR:-/tmp}/calymob-apk-build.XXXXXX")

flutter build apk --release

if [ ! -s "$APK_PATH" ] || [ "$APK_PATH" -ot "$BUILD_START_MARKER" ]; then
  echo "❌ Release build did not create a fresh non-empty APK." >&2
  exit 1
fi
if [ ! -s "$PACKAGED_MANIFEST" ] || [ "$PACKAGED_MANIFEST" -ot "$BUILD_START_MARKER" ]; then
  echo "❌ Release build did not create a fresh packaged manifest." >&2
  exit 1
fi

ARTIFACT_VERSION=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$PACKAGED_MANIFEST")
ARTIFACT_BUILD=$(sed -n 's/.*android:versionCode="\([^"]*\)".*/\1/p' "$PACKAGED_MANIFEST")
if [ "$ARTIFACT_VERSION" != "$VERSION" ] || [ "$ARTIFACT_BUILD" != "$BUILD" ]; then
  echo "❌ APK version/build does not match pubspec.yaml." >&2
  exit 1
fi
if [ "$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)" != "$FULL_VERSION" ]; then
  echo "❌ pubspec version changed during the build." >&2
  exit 1
fi
require_source_unchanged "the release build"

APK_SHA256=$(shasum -a 256 "$APK_PATH" | awk '{print $1}')
if [[ ! "$APK_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "❌ Could not calculate the APK SHA-256." >&2
  exit 1
fi
APK_MTIME=$(stat -f '%m' "$APK_PATH")

cp "$APK_PATH" "$OUTPUT_DIR/$APK_NAME"
NAMED_SHA256=$(shasum -a 256 "$OUTPUT_DIR/$APK_NAME" | awk '{print $1}')
if [ "$NAMED_SHA256" != "$APK_SHA256" ]; then
  echo "❌ Versioned APK copy hash mismatch." >&2
  exit 1
fi

echo ""
echo "✅ Build successful!"
echo "📦 APK: $OUTPUT_DIR/$APK_NAME"
echo "📏 Size: $(du -h "$OUTPUT_DIR/$APK_NAME" | cut -f1)"
echo "SOURCE_COMMIT=$SOURCE_COMMIT"
echo "SOURCE_TREE=$SOURCE_TREE"
echo "VERSION=$VERSION"
echo "BUILD=$BUILD"
echo "APK_MTIME_EPOCH=$APK_MTIME"
echo "APK_SHA256=$APK_SHA256"
