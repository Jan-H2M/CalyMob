#!/bin/bash
# Build release APK with automatic version naming
# Usage: ./build_release.sh [--bump patch|minor|major]
set -euo pipefail

cd "$(dirname "$0")/.."

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

# Optionally bump version first
if [ "${1:-}" == "--bump" ]; then
  ./scripts/bump_version.sh "${2:-patch}"
fi

bash scripts/verify_payment_release.sh

# Read current version and build number
FULL_VERSION=$(grep "^version:" pubspec.yaml | sed 's/version: //')
VERSION=$(echo "$FULL_VERSION" | cut -d'+' -f1)
BUILD=$(echo "$FULL_VERSION" | cut -d'+' -f2)

echo "Building CalyMob v$VERSION (build $BUILD)..."

# Build APK
flutter build apk --release

if [ $? -eq 0 ]; then
  # Copy with version name including build number
  OUTPUT_DIR="build/app/outputs/flutter-apk"
  APK_NAME="calymob-$VERSION-build$BUILD.apk"
  cp "$OUTPUT_DIR/app-release.apk" "$OUTPUT_DIR/$APK_NAME"

  echo ""
  echo "✅ Build successful!"
  echo "📦 APK: $OUTPUT_DIR/$APK_NAME"
  echo "📏 Size: $(du -h "$OUTPUT_DIR/$APK_NAME" | cut -f1)"
else
  echo "❌ Build failed!"
  exit 1
fi
