#!/bin/sh

# Xcode Cloud runs scripts from the repository-level ci_scripts directory.
# Prepare Flutter and CocoaPods before Xcode archives the iOS workspace.

set -e

echo "=== CalyMob Xcode Cloud post-clone ==="

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"
FLUTTER_DIR="$HOME/flutter"
export PATH="$FLUTTER_DIR/bin:$PATH"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

cd "$REPO_ROOT"

if [ ! -x "$FLUTTER_DIR/bin/flutter" ]; then
  echo "Installing Flutter stable..."
  git clone https://github.com/flutter/flutter.git --depth 1 -b stable "$FLUTTER_DIR"
fi

flutter config --no-analytics
flutter --version

echo "Getting Flutter dependencies..."
flutter pub get

echo "Installing CocoaPods dependencies..."
cd "$REPO_ROOT/ios"
pod install --repo-update

echo "=== CalyMob Xcode Cloud post-clone complete ==="
