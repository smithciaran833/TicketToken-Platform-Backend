# Pinned to digest for reproducible builds
# To update: docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine
FROM node:20-alpine@sha256:7a91aa397f2e2dfbfcdad2e2d72599f374e0b0172be1d86eeb73f1d33f36a4b2 AS builder

WORKDIR /app

# Copy root tsconfig first
COPY tsconfig.base.json ./tsconfig.base.json

# Copy shared dependencies
COPY backend/shared ./backend/shared
COPY backend/services/minting-service ./backend/services/minting-service

# Install shared dependencies
WORKDIR /app/backend/shared
RUN npm install && npm cache clean --force

WORKDIR /app/backend/services/minting-service
RUN npm install && npm cache clean --force
RUN npm run build

# Production stage
# Pinned to digest for reproducible builds
FROM node:20-alpine@sha256:7a91aa397f2e2dfbfcdad2e2d72599f374e0b0172be1d86eeb73f1d33f36a4b2

WORKDIR /app

# Install dumb-init and clean apk cache
RUN apk add --no-cache dumb-init && rm -rf /var/cache/apk/*

# Copy built application
COPY --from=builder /app/backend/services/minting-service/dist ./dist
COPY --from=builder /app/backend/services/minting-service/node_modules ./node_modules
COPY --from=builder /app/backend/services/minting-service/package*.json ./

# Copy configuration files
COPY backend/services/minting-service/real-merkle-tree-config.json ./real-merkle-tree-config.json
COPY backend/services/minting-service/collection-config.json ./collection-config.json

# Copy migration files
COPY --from=builder /app/backend/services/minting-service/dist/migrations ./dist/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Starting minting-service..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create logs directory and set permissions
RUN mkdir -p /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Remove SUID/SGID binaries for security hardening
RUN find / -perm /6000 -type f -exec chmod a-s {} \; 2>/dev/null || true

USER nodejs

EXPOSE 3018

ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
