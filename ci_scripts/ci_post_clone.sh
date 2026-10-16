#!/bin/sh
# Runs on Apple's Xcode Cloud workers, never builds a native app locally.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/toolchain.env"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export FLUTTER_SUPPRESS_ANALYTICS=true
FLUTTER_DIR="$HOME/calymob-flutter-$FLUTTER_VERSION"
export PATH="$FLUTTER_DIR/bin:$PATH"

if [ ! -x "$FLUTTER_DIR/bin/flutter" ]; then
  git clone --depth 1 --branch "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$FLUTTER_DIR"
fi
[ "$(git -C "$FLUTTER_DIR" rev-parse HEAD)" = "$FLUTTER_REVISION" ] || {
  echo 'Unexpected Flutter revision; refusing a non-reproducible build.' >&2
  exit 1
}

cd "$REPO_ROOT"
flutter config --no-analytics
flutter --version
flutter precache --ios
flutter pub get --enforce-lockfile

# Keep the reviewed marketing version; use Apple's product-wide build counter.
BUILD_NAME="$(sed -n 's/^version: *\([^+ ]*\).*/\1/p' pubspec.yaml)"
case "${CI_BUILD_NUMBER:-}" in
  ''|*[!0-9]*) echo 'CI_BUILD_NUMBER must be supplied by Xcode Cloud.' >&2; exit 1 ;;
esac
[ "$CI_BUILD_NUMBER" -gt 226 ] || {
  echo 'Cloud build number must exceed existing App Store Connect build 226.' >&2
  exit 1
}

# Flutter's config-only path also prepares Pods: pin pod before invoking it.
if ! command -v pod >/dev/null 2>&1 || [ "$(pod --version)" != "$COCOAPODS_VERSION" ]; then
  gem install cocoapods --version "$COCOAPODS_VERSION" --no-document --user-install
  export PATH="$(ruby -e 'print Gem.user_dir')/bin:$PATH"
fi
[ "$(pod --version)" = "$COCOAPODS_VERSION" ] || exit 1

# Generates configuration only. Xcode Cloud compiles, archives, signs and uploads.
flutter build ios --config-only --release --no-pub \
  --build-name "$BUILD_NAME" --build-number "$CI_BUILD_NUMBER"

(cd ios && pod install --deployment)
git diff --exit-code -- pubspec.lock ios/Podfile.lock

# Real widgets, access control, confirmations and QR parsing; no live Firebase.
flutter test --no-pub \
  test/models/boutique \
  test/models/boutique_product_personalization_test.dart \
  test/screens/boutique_qr_access_test.dart \
  test/screens/boutique_qr_confirmation_lifecycle_test.dart \
  test/screens/boutique_screen_access_test.dart \
  test/services/boutique_access_service_test.dart \
  test/widgets/boutique_access_guard_test.dart \
  test/services/notification_navigation_service_test.dart

echo "CalyMob $BUILD_NAME ($CI_BUILD_NUMBER): dependencies and Flutter tests ready."
