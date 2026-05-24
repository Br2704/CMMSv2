# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Security: install as root, will drop to non-root in final stage
RUN apk upgrade --no-cache

# Install dependencies first (cache layer unless package*.json changes)
COPY package*.json ./
RUN npm ci --include=dev --loglevel=error

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ─────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

RUN apk upgrade --no-cache && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=384" \
    PORT=3001

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --loglevel=error && \
    npm cache clean --force

# Copy compiled output from build stage
COPY --from=build --chown=appuser:appgroup /app/dist ./dist

EXPOSE 3001

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health > /dev/null 2>&1 || exit 1

CMD ["node", "dist/server.js"]
