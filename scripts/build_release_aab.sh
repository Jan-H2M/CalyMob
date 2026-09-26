#!/bin/bash
# Build AAB voor Play Store upload
# Usage: ./build_release_aab.sh [--bump patch|minor|major]
set -euo pipefail

cd "$(dirname "$0")/.."

OUTPUT_DIR="build/app/outputs/bundle/release"
AAB_PATH="$OUTPUT_DIR/app-release.aab"
BUNDLE_MANIFEST="build/app/intermediates/bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml"
BUILD_START_MARKER=""
AAB_NAME=""

cleanup() {
  local status=$?
  set +e
  unset CALYMOB_UPLOAD_STORE_FILE CALYMOB_UPLOAD_PASSWORD_FILE CALYMOB_UPLOAD_KEY_ALIAS
  if [ "$status" -ne 0 ]; then
    rm -f -- "$AAB_PATH" "$BUNDLE_MANIFEST"
    if [ -n "$AAB_NAME" ]; then
      rm -f -- "$OUTPUT_DIR/$AAB_NAME"
    fi
  fi
  if [ -n "$BUILD_START_MARKER" ]; then
    rm -f -- "$BUILD_START_MARKER"
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

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

# Optioneel versie bumpen
if [ "${1:-}" == "--bump" ]; then
  ./scripts/bump_version.sh "${2:-patch}"
fi

bash scripts/verify_payment_release.sh

# Bron en versie vastleggen vóór de build.
SOURCE_COMMIT=$(git rev-parse --verify HEAD)
FULL_VERSION=$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)
if [[ ! "$FULL_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]]; then
  echo "❌ Invalid pubspec version: $FULL_VERSION" >&2
  exit 1
fi
VERSION="${BASH_REMATCH[1]}"
BUILD="${BASH_REMATCH[2]}"
AAB_NAME="calymob-$VERSION-build$BUILD.aab"

echo "Building CalyMob AAB v$VERSION (build $BUILD)..."

# Oude of gedeeltelijke uitvoer mag nooit als nieuwe build worden aangezien.
rm -f -- "$AAB_PATH" "$OUTPUT_DIR/$AAB_NAME" "$BUNDLE_MANIFEST"
BUILD_START_MARKER=$(mktemp "${TMPDIR:-/tmp}/calymob-aab-build.XXXXXX")

# AAB bouwen. set -e zorgt dat de cleanup-trap elke mislukking doorgeeft.
flutter build appbundle --release

# De build moet dit artefact en manifest na de startmarker hebben aangemaakt.
if [ ! -s "$AAB_PATH" ] || [ "$AAB_PATH" -ot "$BUILD_START_MARKER" ]; then
  echo "❌ Release build did not create a fresh non-empty AAB." >&2
  exit 1
fi
if [ ! -s "$BUNDLE_MANIFEST" ] || [ "$BUNDLE_MANIFEST" -ot "$BUILD_START_MARKER" ]; then
  echo "❌ Release build did not create a fresh bundle manifest." >&2
  exit 1
fi

ARTIFACT_VERSION=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$BUNDLE_MANIFEST")
ARTIFACT_BUILD=$(sed -n 's/.*android:versionCode="\([^"]*\)".*/\1/p' "$BUNDLE_MANIFEST")
if [ "$ARTIFACT_VERSION" != "$VERSION" ] || [ "$ARTIFACT_BUILD" != "$BUILD" ]; then
  echo "❌ AAB version/build does not match pubspec.yaml." >&2
  exit 1
fi
if [ "$(git rev-parse --verify HEAD)" != "$SOURCE_COMMIT" ]; then
  echo "❌ Git source commit changed during the build." >&2
  exit 1
fi
if [ "$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)" != "$FULL_VERSION" ]; then
  echo "❌ pubspec version changed during the build." >&2
  exit 1
fi

AAB_SHA256=$(shasum -a 256 "$AAB_PATH" | awk '{print $1}')
if [[ ! "$AAB_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "❌ Could not calculate the AAB SHA-256." >&2
  exit 1
fi
AAB_MTIME=$(stat -f '%m' "$AAB_PATH")

cp "$AAB_PATH" "$OUTPUT_DIR/$AAB_NAME"
NAMED_SHA256=$(shasum -a 256 "$OUTPUT_DIR/$AAB_NAME" | awk '{print $1}')
if [ "$NAMED_SHA256" != "$AAB_SHA256" ]; then
  echo "❌ Versioned AAB copy hash mismatch." >&2
  exit 1
fi

echo "✅ Build successful!"
echo "📦 AAB: $OUTPUT_DIR/$AAB_NAME"
echo "📏 Size: $(du -h "$OUTPUT_DIR/$AAB_NAME" | cut -f1)"
echo "SOURCE_COMMIT=$SOURCE_COMMIT"
echo "VERSION=$VERSION"
echo "BUILD=$BUILD"
echo "AAB_MTIME_EPOCH=$AAB_MTIME"
echo "AAB_SHA256=$AAB_SHA256"
echo ""
echo "Upload dit bestand naar de Google Play Console."
