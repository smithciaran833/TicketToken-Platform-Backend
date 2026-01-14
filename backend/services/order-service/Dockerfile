# MEDIUM: Pin base image to specific digest for reproducible builds
# To update: docker pull node:20-alpine && docker inspect node:20-alpine --format='{{index .RepoDigests 0}}'
# Last updated: 2024-12-28
FROM node:20-alpine@sha256:c13b26e7e602ef2f1074aef304ce6e9b7dd284c419b35d89fcf3cc8e44a8def9 AS builder

WORKDIR /app

RUN npm install -g npm@latest

COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/order-service ./backend/services/order-service

WORKDIR /app/backend/shared
RUN npm install
RUN npm run build || true

WORKDIR /app/backend/services/order-service
RUN npm install
RUN npm run build

# Production stage
# MEDIUM: Pin base image to specific digest for reproducible builds
FROM node:20-alpine@sha256:c13b26e7e602ef2f1074aef304ce6e9b7dd284c419b35d89fcf3cc8e44a8def9

WORKDIR /app/backend/services/order-service

RUN apk add --no-cache dumb-init && \
    # MEDIUM: Clear npm cache to reduce image size
    npm install -g npm@latest && \
    npm cache clean --force

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/order-service/package.json ./package.json
COPY --from=builder /app/backend/services/order-service/package-lock.json ./package-lock.json

# Install ALL dependencies (need ts-node for migrations)
# MEDIUM: Clear npm cache after install
RUN npm install && npm cache clean --force

# Copy built artifacts
COPY --from=builder /app/backend/services/order-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/order-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/order-service/src/migrations ./src/migrations

# Create entrypoint script
RUN echo '#!/bin/sh' > ./entrypoint.sh && \
    echo 'set -e' >> ./entrypoint.sh && \
    echo 'echo "Running migrations for order-service..."' >> ./entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> ./entrypoint.sh && \
    echo 'exec "$@"' >> ./entrypoint.sh && \
    chmod +x ./entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health/live', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["./entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/services/order-service/src/index.js"]
