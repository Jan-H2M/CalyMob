#!/bin/sh

# Xcode Cloud post-clone script
# This script runs after the repository is cloned

set -e

echo "=== CI Post Clone Script ==="

# Navigate to repository root
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Flutter
echo "Installing Flutter..."
git clone https://github.com/flutter/flutter.git --depth 1 -b stable "$HOME/flutter"
export PATH="$PATH:$HOME/flutter/bin"

# Disable analytics
flutter config --no-analytics

# Get Flutter dependencies
echo "Getting Flutter dependencies..."
flutter pub get

# Generate iOS project files
echo "Generating iOS project files..."
flutter build ios --release --no-codesign || true

# Navigate to ios directory
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"

# Clean any existing Pods
echo "Cleaning existing Pods..."
rm -rf Pods
rm -rf Podfile.lock

# Install CocoaPods if needed
if ! command -v pod &> /dev/null; then
    echo "Installing CocoaPods..."
    gem install cocoapods
fi

# Install pods
echo "Installing Pods..."
pod install --repo-update

echo "=== CI Post Clone Complete ==="
