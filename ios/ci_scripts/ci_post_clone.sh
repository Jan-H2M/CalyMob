#!/bin/sh

# Compatibility wrapper for Xcode Cloud setups that look under ios/ci_scripts.
# The primary script lives at repository root: ci_scripts/ci_post_clone.sh.

set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
exec "$REPO_ROOT/ci_scripts/ci_post_clone.sh"
