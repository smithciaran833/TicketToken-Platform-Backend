FROM node:20-alpine AS builder
WORKDIR /app
# Copy shared module first
COPY backend/shared ./backend/shared
WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true

# Copy marketplace-service
WORKDIR /app
COPY backend/services/marketplace-service ./backend/services/marketplace-service

# Build marketplace-service
WORKDIR /app/backend/services/marketplace-service
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
# Install dumb-init
RUN apk add --no-cache dumb-init

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/marketplace-service/package.json /app/backend/services/marketplace-service/package.json
COPY --from=builder /app/backend/services/marketplace-service/package-lock.json /app/backend/services/marketplace-service/package-lock.json

# Install production dependencies
WORKDIR /app/backend/services/marketplace-service
RUN npm ci

# Copy built artifacts
COPY --from=builder /app/backend/services/marketplace-service/dist ./dist

# Copy IDL files
COPY --from=builder /app/backend/services/marketplace-service/src/idl ./dist/idl

# Copy migration files
COPY --from=builder /app/backend/services/marketplace-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/marketplace-service/src/migrations ./src/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for marketplace-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/marketplace-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3016
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3016/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
