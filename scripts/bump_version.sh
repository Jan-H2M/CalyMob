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

# ⚠️  Firestore version wordt NIET meer automatisch bijgewerkt!
# De versie wordt pas gepubliceerd als je op "Publier" drukt in CalyMob > Mon Profil > Paramètres.
# Dit voorkomt dat gebruikers een update-melding zien terwijl de app nog in review staat.
#
# Om manueel te publishen:
#   node scripts/update_firestore_version.cjs "$NEW_VERSION_NAME" "$BUILD_NUMBER"
#   of gebruik de knop in CalyMob settings (admin only)
echo ""
echo "ℹ️  Firestore versie wordt NIET automatisch bijgewerkt."
echo "   Publiceer de versie pas na goedkeuring door Apple/Google:"
echo "   → CalyMob > Mon Profil > Paramètres > Publier la version"
echo "   → Of: node scripts/update_firestore_version.cjs \"$NEW_VERSION_NAME\" \"$BUILD_NUMBER\""
