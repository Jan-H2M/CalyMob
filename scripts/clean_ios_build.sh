#!/bin/bash
# Clean iOS Build Script for CalyMob
# Usage: ./scripts/clean_ios_build.sh
#
# Run this script when you encounter iOS build errors like:
# - "The sandbox is not in sync with the Podfile.lock"
# - "could not find included file 'Generated.xcconfig'"
# - Pods/CocoaPods sync issues

set -e

echo "🧹 Starting iOS clean build..."

# Navigate to CalyMob root
cd "$(dirname "$0")/.."

# 1. Kill any hanging processes
echo "⏹️  Killing hanging processes..."
pkill -f "pod install" 2>/dev/null || true
pkill -f "xcodebuild" 2>/dev/null || true
sleep 1

# 2. Clean Flutter
echo "🔄 Running flutter clean..."
flutter clean

# 3. Get dependencies
echo "📦 Getting Flutter dependencies..."
flutter pub get

# 4. Clean iOS artifacts
echo "🗑️  Removing iOS build artifacts..."
cd ios
rm -rf Pods
rm -rf Podfile.lock
rm -rf .symlinks
rm -rf ~/Library/Developer/Xcode/DerivedData/Runner-* 2>/dev/null || true

# 5. Run pod install with repo update
echo "📱 Running pod install (this may take a few minutes)..."
pod install --repo-update

# 6. Verify Manifest.lock exists
if [ -f "Pods/Manifest.lock" ]; then
    echo "✅ Pods/Manifest.lock created successfully"
else
    echo "❌ ERROR: Pods/Manifest.lock not created!"
    echo "   Try running 'pod install' manually in the ios directory"
    exit 1
fi

# 7. Generate iOS config
echo "⚙️  Generating iOS config..."
cd ..
flutter build ios --config-only

# 8. Verify Generated.xcconfig exists
if [ -f "ios/Flutter/Generated.xcconfig" ]; then
    echo "✅ Generated.xcconfig created successfully"
else
    echo "❌ ERROR: Generated.xcconfig not created!"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════"
echo "✅ Clean build complete!"
echo ""
echo "Next steps:"
echo "  1. Close Xcode completely (Cmd+Q)"
echo "  2. Run: open ios/Runner.xcworkspace"
echo "  3. Build in Xcode (Cmd+B or Play button)"
echo "════════════════════════════════════════════"
