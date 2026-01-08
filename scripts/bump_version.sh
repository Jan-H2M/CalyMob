#!/bin/bash
# Bump version number in pubspec.yaml
# Usage: ./bump_version.sh [major|minor|patch]
# Default: patch

cd "$(dirname "$0")/.."

# Read current version
CURRENT_VERSION=$(grep "^version:" pubspec.yaml | sed 's/version: //')
VERSION_NAME=$(echo $CURRENT_VERSION | cut -d'+' -f1)
BUILD_NUMBER=$(echo $CURRENT_VERSION | cut -d'+' -f2)

MAJOR=$(echo $VERSION_NAME | cut -d'.' -f1)
MINOR=$(echo $VERSION_NAME | cut -d'.' -f2)
PATCH=$(echo $VERSION_NAME | cut -d'.' -f3)

# Bump version based on argument
case "${1:-patch}" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Usage: $0 [major|minor|patch]"
    exit 1
    ;;
esac

# Always increment build number
BUILD_NUMBER=$((BUILD_NUMBER + 1))

NEW_VERSION="$MAJOR.$MINOR.$PATCH+$BUILD_NUMBER"
NEW_VERSION_NAME="$MAJOR.$MINOR.$PATCH"

# Update pubspec.yaml
sed -i '' "s/^version: .*/version: $NEW_VERSION/" pubspec.yaml

echo "Version bumped: $CURRENT_VERSION → $NEW_VERSION"

# Update Firestore version (CalyCompta maintenance page)
echo ""
echo "📱 Syncing version to Firestore..."
if node scripts/update_firestore_version.cjs "$NEW_VERSION_NAME" "$BUILD_NUMBER"; then
  echo "✅ Firestore version synced successfully"
else
  echo "⚠️  Warning: Could not update Firestore version"
  echo "   Mobile version updated, but web admin maintenance page may be out of sync"
  echo "   You can manually update it in CalyCompta > Paramètres > Maintenance"
fi
