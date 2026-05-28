# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --ignore-scripts

COPY apps/web apps/web
COPY packages/shared packages/shared

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

# ── Runtime stage — nginx to serve static files ───────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# SPA fallback: all unknown paths serve index.html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
