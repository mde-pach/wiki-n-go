# wiki-n-go Worker

Anonymous edit relay: receives an in-site edit and opens a PR authored as
`anon-<ip_hash>`. The raw IP is hashed (HMAC) and never stored or committed.

## Deploy

```bash
bun install
wrangler secret put GITHUB_TOKEN   # fine-grained PAT: Contents + Pull requests = read/write on the content repo
wrangler secret put HASH_SECRET    # any long random string; set once, never rotate
bun run deploy
```

Then set the deployed URL in the site's `src/config.ts` → `workerUrl`, and
adjust `[vars]` in `wrangler.toml` if your repo or origin differ.
