#!/bin/bash
set -euo pipefail
# Bump version number in pubspec.yaml
# Usage: ./bump_version.sh [major|minor|patch]
# Default: patch

cd "$(dirname "$0")/.."

# Read current version
CURRENT_VERSION=$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)
if [[ ! "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)\+([0-9]+)$ ]]; then
  echo "Invalid pubspec version: $CURRENT_VERSION" >&2
  exit 1
fi
MAJOR=${BASH_REMATCH[1]}
MINOR=${BASH_REMATCH[2]}
PATCH=${BASH_REMATCH[3]}

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

# App Store Connect/Xcode Cloud owns the product-wide build counter. Reserve
# exactly its next number; never increment a stale local counter in isolation.
IFS=$'\t' read -r ASC_VERSION ASC_BUILD < <(scripts/read_app_store_build_number.sh tsv)
BUILD_NUMBER=$((ASC_BUILD + 1))

NEW_VERSION="$MAJOR.$MINOR.$PATCH+$BUILD_NUMBER"
NEW_VERSION_NAME="$MAJOR.$MINOR.$PATCH"

# Update pubspec.yaml
sed -i '' "s/^version: .*/version: $NEW_VERSION/" pubspec.yaml

echo "Version bumped: $CURRENT_VERSION → $NEW_VERSION"
echo "Build $BUILD_NUMBER reserved from App Store Connect latest $ASC_VERSION+$ASC_BUILD."

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
