FROM oven/bun:1

WORKDIR /app

# Install deps first for layer caching. (The WikigitUser import from ../../shared
# is type-only — Bun erases it at runtime — so the build context can be this dir.)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

# Account records + OpenAuth keys/tokens persist here — mount a Coolify volume.
ENV PORT=3000 STORE_PATH=/data/auth-store.json
VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
