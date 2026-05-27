# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Security: pin apk version and run as non-root in final stage
RUN apk upgrade --no-cache

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_APP_NAME=OptiX Maintenance Pro
ENV VITE_APP_NAME=$VITE_APP_NAME

ARG VITE_APP_COMPANY=TamOptiX Technologies
ENV VITE_APP_COMPANY=$VITE_APP_COMPANY

ARG VITE_APP_TAGLINE=Powered by TamOptiX Technologies
ENV VITE_APP_TAGLINE=$VITE_APP_TAGLINE
 
ARG VITE_APP_SHORT_NAME=OptiX Maint - Pro
ENV VITE_APP_SHORT_NAME=$VITE_APP_SHORT_NAME

# Install dependencies first (cache layer)
COPY frontend/package*.json ./
RUN npm ci --loglevel=error && \
    npm cache clean --force

# Copy source and build
COPY frontend/ ./
RUN npx vite build

# ── Production stage (Node static server) ────────────────────────
FROM node:22-alpine

WORKDIR /app

# Security: upgrade packages and create non-root user
RUN apk upgrade --no-cache && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup

ENV NODE_ENV=production

COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY frontend/server.js ./server.js

# Security: non-root user
USER appuser

EXPOSE 80

# Security: read-only root filesystem compatible
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ > /dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
