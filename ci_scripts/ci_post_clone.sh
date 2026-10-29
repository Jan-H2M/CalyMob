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
"$REPO_ROOT/scripts/check_xcode_cloud_environment.sh" "$REPO_ROOT/pubspec.yaml"

# Flutter's config-only path also prepares Pods: pin pod before invoking it.
# Apple's system Ruby 2.6 cannot resolve current native gem dependencies.
# Install the reviewed runtime on the cloud worker, never on the local Mac.
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
if [ ! -x "$(brew --prefix)/opt/ruby@3.3/bin/ruby" ]; then
  brew install ruby@3.3
fi
export PATH="$(brew --prefix ruby@3.3)/bin:$PATH"
[ "$(ruby -e 'print RUBY_VERSION')" = "$RUBY_VERSION" ] || {
  echo 'Unexpected Ruby patch version; review the toolchain pin before release.' >&2
  exit 1
}
export GEM_HOME="$HOME/.calymob-gems/ruby-$RUBY_VERSION"
export GEM_PATH="$GEM_HOME"
export PATH="$GEM_HOME/bin:$PATH"
gem install cocoapods --version "$COCOAPODS_VERSION" --no-document
[ "$(pod --version)" = "$COCOAPODS_VERSION" ] || exit 1

# Generates configuration only. Xcode Cloud compiles, archives, signs and uploads.
flutter build ios --config-only --release --no-pub \
  --build-name "$BUILD_NAME" --build-number "$CI_BUILD_NUMBER"

(cd ios && pod install --deployment)
git diff --exit-code -- pubspec.lock ios/Podfile.lock

# Real widgets, access control, confirmations and QR parsing; no live Firebase.
flutter test --no-pub \
  test/config/firebase_options_test.dart \
  test/models/boutique_product_personalization_test.dart \
  test/screens/boutique_screen_access_test.dart \
  test/services/boutique_access_service_test.dart \
  test/widgets/boutique_access_guard_test.dart \
  test/services/dive_computer_import_service_test.dart \
  test/services/dive_log_import_registry_test.dart \
  test/services/suunto_dive_log_adapter_test.dart \
  test/services/suunto_share_inbox_test.dart \
  test/services/uddf_dive_log_adapter_test.dart \
  test/services/subsurface_dive_log_adapter_test.dart

echo "CalyMob $BUILD_NAME ($CI_BUILD_NUMBER): dependencies and Flutter tests ready."
