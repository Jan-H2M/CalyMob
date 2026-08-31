#!/usr/bin/env bash
# Common fail-closed test gate; does not build, upload or update app_version.
set -euo pipefail
cd "$(dirname "$0")/.."
flutter pub get --enforce-lockfile
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
npm --prefix functions ci --ignore-scripts
npm --prefix functions test -- --runInBand
git diff --exit-code -- pubspec.lock functions/package-lock.json
echo "Payment release tests passed for working tree based on $(git rev-parse HEAD)."
echo "This test run is not a clean-commit attestation. Upload requires separate reviewed provenance."
echo "This is not store approval or proof that an existing binary came from this commit."
