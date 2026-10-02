#!/usr/bin/env bash
set -euo pipefail

is_forbidden_path() {
  local path="${1#./}"

  shopt -s nocasematch
  case "$path" in
    .env*.example|*/.env*.example|.env*.sample|*/.env*.sample|.env*.template|*/.env*.template)
      return 1
      ;;
    key.properties|*/key.properties|*.jks|*.keystore|*.p12|*.pfx|*.p8|*.pk8|*.pepk|service-account*.json|*/service-account*.json|serviceAccount*.json|*/serviceAccount*.json|.env*|*/.env*)
      return 0
      ;;
  esac
  return 1
}

check_path() {
  local path="$1"

  [ -z "$path" ] && return 0
  if is_forbidden_path "$path"; then
    printf 'Blocked sensitive credential path: %s\n' "$path" >&2
    return 1
  fi
  return 0
}

check_null_delimited_stream() {
  local failed=0
  local path

  while IFS= read -r -d '' path; do
    check_path "$path" || failed=1
  done
  return "$failed"
}

if [ "${1:-}" = "--git-range" ]; then
  [ "$#" -eq 2 ] || {
    printf 'Usage: %s --git-range <revision-range>\n' "$0" >&2
    exit 2
  }
  git log --format= --name-only -z "$2" -- | check_null_delimited_stream
elif [ "${1:-}" = "--all-tracked" ]; then
  [ "$#" -eq 1 ] || {
    printf 'Usage: %s --all-tracked\n' "$0" >&2
    exit 2
  }
  git ls-files -z | check_null_delimited_stream
else
  failed=0
  for path in "$@"; do
    check_path "$path" || failed=1
  done
  exit "$failed"
fi
