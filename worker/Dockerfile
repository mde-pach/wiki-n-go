FROM oven/bun:1

# curl is for the container healthcheck (the bun image ships neither curl nor
# wget, which Coolify's default healthcheck needs).
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install runtime deps first for layer caching (devDeps — @types/bun/vitest/tsc —
# are skipped with --production; they're not needed to run the server).
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

# No volume: the Engine is no-DB. All KV state is in-memory and rebuildable from
# git on a miss (see store.ts / SPEC M11); durable moderation state lives in the
# repo. A restart loses nothing durable.
ENV PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8787/health || exit 1

CMD ["bun", "run", "src/server.ts"]
