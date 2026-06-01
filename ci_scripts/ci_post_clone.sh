#!/bin/sh

# Xcode Cloud runs scripts from the repository-level ci_scripts directory.
# Prepare Flutter and CocoaPods before Xcode archives the iOS workspace.

set -e

echo "=== CalyMob Xcode Cloud post-clone ==="

find_repo_root() {
  current="$1"
  while [ "$current" != "/" ]; do
    if [ -f "$current/pubspec.yaml" ] && [ -d "$current/ios" ]; then
      printf '%s\n' "$current"
      return 0
    fi
    current="$(dirname "$current")"
  done
  return 1
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(find_repo_root "$SCRIPT_DIR")"
if [ -z "$REPO_ROOT" ] && [ -n "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
  REPO_ROOT="$(find_repo_root "$CI_PRIMARY_REPOSITORY_PATH")"
fi
if [ -z "$REPO_ROOT" ]; then
  echo "Could not find CalyMob repository root containing pubspec.yaml and ios/."
  echo "SCRIPT_DIR=$SCRIPT_DIR"
  echo "CI_PRIMARY_REPOSITORY_PATH=${CI_PRIMARY_REPOSITORY_PATH:-}"
  exit 1
fi

FLUTTER_DIR="$HOME/flutter"
export PATH="$FLUTTER_DIR/bin:$PATH"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

echo "SCRIPT_DIR=$SCRIPT_DIR"
echo "REPO_ROOT=$REPO_ROOT"
echo "CI_PRIMARY_REPOSITORY_PATH=${CI_PRIMARY_REPOSITORY_PATH:-}"

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
