#!/usr/bin/env bash
# Deploy the Worker non-interactively using credentials from .deploy.env.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .deploy.env ] || { echo "Missing worker/.deploy.env"; exit 1; }
set -a
# shellcheck disable=SC1091
source .deploy.env
set +a

for v in CLOUDFLARE_API_TOKEN GITHUB_BOT_TOKEN HASH_SECRET; do
  [ -n "${!v:-}" ] || { echo "Missing $v in .deploy.env"; exit 1; }
done

bunx wrangler deploy
printf '%s' "$GITHUB_BOT_TOKEN" | bunx wrangler secret put GITHUB_TOKEN
printf '%s' "$HASH_SECRET" | bunx wrangler secret put HASH_SECRET
echo "Done. Use the workers.dev URL printed above as config.workerUrl."
