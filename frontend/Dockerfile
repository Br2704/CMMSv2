# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Install dependencies first (cache layer)
COPY frontend/package*.json ./
RUN npm ci --loglevel=error && \
    npm cache clean --force

# Copy source and build
COPY frontend/ ./
RUN npx vite build

# ── Production stage (Nginx) ─────────────────────────────────────
FROM nginx:1-alpine-slim

# Security: update packages
RUN apk upgrade --no-cache

ENV NGINX_ENTRYPOINT_QUIET_LOGS=1

# Copy custom config and built assets
COPY frontend/nginx.prod.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx base image already runs as non-root user 'nginx' (uid 101)

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ > /dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
