#!/bin/bash
# Build AAB voor Play Store upload
# Usage: ./build_release_aab.sh [--bump patch|minor|major]

cd "$(dirname "$0")/.."

# Optioneel versie bumpen
if [ "$1" == "--bump" ]; then
  ./scripts/bump_version.sh "${2:-patch}"
fi

# Versie uitlezen
FULL_VERSION=$(grep "^version:" pubspec.yaml | sed 's/version: //')
VERSION=$(echo "$FULL_VERSION" | cut -d'+' -f1)
BUILD=$(echo "$FULL_VERSION" | cut -d'+' -f2)

echo "Building CalyMob AAB v$VERSION (build $BUILD)..."

# AAB bouwen
flutter build appbundle --release

if [ $? -eq 0 ]; then
  OUTPUT_DIR="build/app/outputs/bundle/release"
  AAB_NAME="calymob-$VERSION-build$BUILD.aab"
  cp "$OUTPUT_DIR/app-release.aab" "$OUTPUT_DIR/$AAB_NAME"
  echo "✅ Build successful!"
  echo "📦 AAB: $OUTPUT_DIR/$AAB_NAME"
  echo "📏 Size: $(du -h "$OUTPUT_DIR/$AAB_NAME" | cut -f1)"
  echo ""
  echo "Upload dit bestand naar de Google Play Console."
else
  echo "❌ Build failed!"
  exit 1
fi
