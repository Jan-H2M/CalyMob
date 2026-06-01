#!/bin/sh

# Compatibility wrapper for Xcode Cloud setups that look under ios/ci_scripts.
# The primary script lives at repository root: ci_scripts/ci_post_clone.sh.

set -e

find_repo_root() {
  current="$1"
  while [ "$current" != "/" ]; do
    if [ -f "$current/pubspec.yaml" ] && [ -x "$current/ci_scripts/ci_post_clone.sh" ]; then
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
  echo "Could not find CalyMob repository root from $SCRIPT_DIR"
  echo "CI_PRIMARY_REPOSITORY_PATH=${CI_PRIMARY_REPOSITORY_PATH:-}"
  exit 1
fi

exec "$REPO_ROOT/ci_scripts/ci_post_clone.sh"
