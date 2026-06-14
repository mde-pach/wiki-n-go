FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
# Flagship apex build: served at the domain root, canonical apex URL, pointed at
# the hosted Engine. Each value is a Coolify build variable so other instances
# (forks, self-hosters) can rebuild the same image for their own domain/Engine.
ARG SITE_URL=https://wikigit.org
ARG BASE_PATH=/
ARG PUBLIC_WORKER_URL=https://api.wikigit.org
ARG PUBLIC_REPO_OWNER=mde-pach
ARG PUBLIC_REPO_NAME=wiki-n-go
ARG PUBLIC_GITHUB_APP_SLUG=wikigit-app
ARG PUBLIC_PLATFORM_HOST=wikigit.org
ENV SITE_URL=$SITE_URL BASE_PATH=$BASE_PATH \
  PUBLIC_WORKER_URL=$PUBLIC_WORKER_URL PUBLIC_REPO_OWNER=$PUBLIC_REPO_OWNER \
  PUBLIC_REPO_NAME=$PUBLIC_REPO_NAME PUBLIC_GITHUB_APP_SLUG=$PUBLIC_GITHUB_APP_SLUG \
  PUBLIC_PLATFORM_HOST=$PUBLIC_PLATFORM_HOST
RUN bun run build

FROM nginx:alpine
RUN apk add --no-cache curl
COPY web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost/ || exit 1
