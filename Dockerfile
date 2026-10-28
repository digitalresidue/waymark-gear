# syntax=docker/dockerfile:1

# ---- build: install everything, compile the frontend, then drop dev deps ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Baked into the frontend bundle at build time (see client/brand.js).
ARG VITE_CONTACT_EMAIL=""
ARG VITE_SOURCE_URL=""
RUN npm run build && npm prune --omit=dev

# ---- runtime: production deps, built assets, no compilers ----
FROM node:24-bookworm-slim

# webp provides cwebp, used to convert uploaded photos (server/images.js).
# tini forwards SIGTERM so the app can shut down gracefully.
RUN apt-get update \
    && apt-get install -y --no-install-recommends webp tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/app.js ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/client ./client
COPY --from=build --chown=node:node /app/config ./config
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/templates ./templates
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./scripts
# Server set-up files (install.sh, the waymark command, compose, Caddyfile):
# install.sh and `waymark update` copy them out of the image they ship with,
# so the server's files always match the version it runs.
COPY --from=build --chown=node:node /app/deploy ./deploy
COPY --from=build --chown=node:node /app/_index.html /app/PRIVACY.md /app/TERMS.md /app/LICENSE ./

# Uploaded photos live here; mount a volume so they survive redeploys.
RUN mkdir -p /app/public/userimages /app/logs && chown node:node /app/public/userimages /app/logs
VOLUME ["/app/public/userimages"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "app.js"]
