#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || ( "$1" != "android" && "$1" != "ios" ) ]]; then
  echo "Usage: $0 <android|ios> <lane> [lane options...]" >&2
  exit 64
fi

platform="$1"
shift

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

cd "$repo_root/$platform"

# Prefer the repository lock only when a known Bundler installation can
# actually satisfy it. Runtime-derived gem bin directories are not a reliable
# way to find Bundler on Homebrew Ruby installations.
bundle_candidates=(
  /opt/homebrew/opt/ruby/bin/bundle
  /usr/local/opt/ruby/bin/bundle
  /usr/bin/bundle
)
for bundle_bin in "${bundle_candidates[@]}"; do
  if [[ -x "$bundle_bin" ]] \
    && BUNDLE_GEMFILE="$repo_root/android/Gemfile" "$bundle_bin" check >/dev/null 2>&1; then
    export BUNDLE_GEMFILE="$repo_root/android/Gemfile"
    exec "$bundle_bin" exec fastlane "$platform" "$@"
  fi
done

# The supported fallback is Homebrew's self-contained Fastlane launcher. It
# supplies its own Ruby and gems and is the working installation on Jan's Mac.
# Never fall back to an arbitrary PATH entry or silently install dependencies.
fastlane_candidates=(
  /opt/homebrew/bin/fastlane
  /usr/local/bin/fastlane
)
for fastlane_bin in "${fastlane_candidates[@]}"; do
  if [[ -x "$fastlane_bin" ]]; then
    unset BUNDLE_GEMFILE BUNDLE_BIN_PATH RUBYOPT RUBYLIB GEM_HOME GEM_PATH
    if link_target=$(readlink "$fastlane_bin" 2>/dev/null); then
      if [[ "$link_target" = /* ]]; then
        resolved_target="$link_target"
      else
        resolved_target="$(dirname "$fastlane_bin")/$link_target"
      fi
      fastlane_prefix="$(cd "$(dirname "$resolved_target")/.." && pwd -P)"
      if [[ -x "$fastlane_prefix/libexec/bin/fastlane" ]]; then
        export FASTLANE_GEM_HOME="$fastlane_prefix/libexec"
      fi
    fi
    exec "$fastlane_bin" "$platform" "$@"
  fi
done

echo "Fastlane is unavailable: no locked bundle or supported Homebrew launcher was found." >&2
exit 1
