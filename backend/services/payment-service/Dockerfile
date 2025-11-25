FROM node:20-alpine AS builder
WORKDIR /app
# Copy shared module first
COPY backend/shared ./backend/shared
# Build shared module
WORKDIR /app/backend/shared
RUN npm install --legacy-peer-deps
RUN npm run build
# Copy payment-service
WORKDIR /app
COPY backend/services/payment-service ./backend/services/payment-service
# Build payment-service
WORKDIR /app/backend/services/payment-service
RUN npm install --legacy-peer-deps
RUN npm run build
# Copy knexfile to dist/config after build
RUN cp src/config/knexfile.js dist/config/ 2>/dev/null || true

# Production stage
FROM node:20-alpine
WORKDIR /app
# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init
# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared
# Copy package files
COPY --from=builder /app/backend/services/payment-service/package.json /app/backend/services/payment-service/package.json
COPY --from=builder /app/backend/services/payment-service/package-lock.json /app/backend/services/payment-service/package-lock.json
# Install production dependencies (this will properly link @tickettoken/shared)
WORKDIR /app/backend/services/payment-service
RUN npm ci --legacy-peer-deps
# Copy built artifacts
COPY --from=builder /app/backend/services/payment-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/payment-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/payment-service/src/migrations ./src/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for payment-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/payment-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/services/payment-service/src/index.js"]
