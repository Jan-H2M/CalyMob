#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || ( "$1" != "android" && "$1" != "ios" ) ]]; then
  echo "Usage: $0 <android|ios> <lane> [lane options...]" >&2
  exit 64
fi

platform="$1"
shift

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
ruby_bin="${RUBY_BIN:-/opt/homebrew/bin/ruby}"
gem_bin="$($ruby_bin -e 'print Gem.bindir')"
bundle_bin="$gem_bin/bundle"

if [[ ! -x "$bundle_bin" ]]; then
  echo "Bundler is missing at $bundle_bin; install the version pinned in android/Gemfile.lock." >&2
  exit 1
fi

export BUNDLE_GEMFILE="$repo_root/android/Gemfile"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

cd "$repo_root/$platform"
exec "$bundle_bin" exec fastlane "$platform" "$@"
