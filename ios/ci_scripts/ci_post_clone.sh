#!/bin/sh

# Xcode Cloud post-clone script
# This script runs after the repository is cloned

set -e

echo "=== CI Post Clone Script ==="

# Navigate to ios directory
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"

# Clean any existing Pods
echo "Cleaning existing Pods..."
rm -rf Pods
rm -rf ~/Library/Caches/CocoaPods
rm -rf ~/.cocoapods/repos

# Install CocoaPods if needed
if ! command -v pod &> /dev/null; then
    echo "Installing CocoaPods..."
    gem install cocoapods
fi

# Update repo and install pods
echo "Installing Pods..."
pod repo update
pod install --repo-update

echo "=== CI Post Clone Complete ==="
