FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/shared ./backend/shared
COPY backend/services/event-service ./backend/services/event-service
WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true
WORKDIR /app/backend/services/event-service
RUN npm ci
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
# Maintain directory structure
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/event-service/package.json /app/backend/services/event-service/package.json
COPY --from=builder /app/backend/services/event-service/package-lock.json /app/backend/services/event-service/package-lock.json
# Install from the correct directory where file:../../shared resolves
WORKDIR /app/backend/services/event-service
RUN npm ci
# Copy built artifacts
COPY --from=builder /app/backend/services/event-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/event-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/event-service/src/migrations ./src/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for event-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/event-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
