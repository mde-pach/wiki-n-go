FROM oven/bun:1

WORKDIR /app

# Install runtime deps first for layer caching (devDeps — wrangler/vitest/tsc —
# are skipped with --production; they're not needed to run the server).
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

# No volume: the Engine is no-DB. All KV state is in-memory and rebuildable from
# git on a miss (see store.ts / SPEC M11); durable moderation state lives in the
# repo. A restart loses nothing durable.
ENV PORT=8787
EXPOSE 8787

CMD ["bun", "run", "src/server.ts"]
