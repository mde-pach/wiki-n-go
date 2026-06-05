#!/usr/bin/env bash
# Stop-gate: refuse to finish on a broken tree. Only runs when tracked source
# under src/ or worker/src/ has uncommitted changes — committed work is assumed
# already verified, and pure Q&A turns are never gated.
set -euo pipefail

input="$(cat)"
# Avoid an infinite loop if a prior stop hook is already re-running us.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if git diff --quiet -- src worker/src 2>/dev/null &&
  git diff --cached --quiet -- src worker/src 2>/dev/null; then
  exit 0
fi

if ! bun run verify >/tmp/wng-verify.log 2>&1; then
  echo "bun run verify failed — fix before finishing. Last output:" >&2
  tail -n 20 /tmp/wng-verify.log >&2
  exit 2
fi
exit 0
