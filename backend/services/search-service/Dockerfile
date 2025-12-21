FROM node:20-alpine AS builder
WORKDIR /app
# Copy shared module first
COPY backend/shared ./backend/shared
WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true
# Copy search-service
WORKDIR /app
COPY backend/services/search-service ./backend/services/search-service
# Build search-service
WORKDIR /app/backend/services/search-service
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
COPY --from=builder /app/backend/services/search-service/package.json /app/backend/services/search-service/package.json
COPY --from=builder /app/backend/services/search-service/package-lock.json /app/backend/services/search-service/package-lock.json
# Install production dependencies
WORKDIR /app/backend/services/search-service
RUN npm ci
# Copy built artifacts
COPY --from=builder /app/backend/services/search-service/dist ./dist
# Copy migration files
COPY --from=builder /app/backend/services/search-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/search-service/src/migrations ./src/migrations
# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for search-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/search-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3020
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3020/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/server.js"]
