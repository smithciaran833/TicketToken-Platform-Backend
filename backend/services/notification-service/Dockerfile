FROM node:20-alpine AS builder
WORKDIR /app

# Copy shared module first
COPY backend/shared ./backend/shared
WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true

# Copy notification-service
WORKDIR /app
COPY backend/services/notification-service ./backend/services/notification-service

# Build notification-service
WORKDIR /app/backend/services/notification-service
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install dumb-init and ts-node for migrations
RUN apk add --no-cache dumb-init && npm install -g ts-node typescript

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/notification-service/package.json /app/backend/services/notification-service/package.json
COPY --from=builder /app/backend/services/notification-service/package-lock.json /app/backend/services/notification-service/package-lock.json

# Install production dependencies
WORKDIR /app/backend/services/notification-service
RUN npm ci

# Copy built artifacts
COPY --from=builder /app/backend/services/notification-service/dist ./dist

# Copy templates (not compiled by TypeScript)
COPY --from=builder /app/backend/services/notification-service/src/templates ./dist/templates

# Copy migration files
COPY --from=builder /app/backend/services/notification-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/notification-service/src/migrations ./src/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for notification-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/notification-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (r) => {let b=''; r.on('data', (c) => b+=c); r.on('end', () => {try{const j=JSON.parse(b); process.exit(j.status==='healthy'?0:1)}catch(e){process.exit(1)}})})" || exit 1

ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
