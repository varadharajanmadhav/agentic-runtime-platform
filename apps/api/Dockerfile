# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/ai/package.json packages/ai/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN npm ci --ignore-scripts

# Copy source
COPY apps/api apps/api
COPY packages/ai packages/ai
COPY packages/db packages/db
COPY packages/shared packages/shared

# Build all packages
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=packages/ai
RUN npm run build --workspace=apps/api

# ── Runtime stage ──────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S arp -u 1001

# Copy built artefacts only — no dev dependencies
COPY --from=builder --chown=arp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=arp:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=arp:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=arp:nodejs /app/packages ./packages

USER arp

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
