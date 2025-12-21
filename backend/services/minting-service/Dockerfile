FROM node:20-alpine AS builder
WORKDIR /app
# Copy root tsconfig first
COPY tsconfig.base.json ./tsconfig.base.json
# Copy shared dependencies
COPY backend/shared ./backend/shared
COPY backend/services/minting-service ./backend/services/minting-service
# Install shared dependencies
WORKDIR /app/backend/shared
RUN npm install
WORKDIR /app/backend/services/minting-service
RUN npm install
RUN npm run build
# Production stage
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init && npm install -g ts-node typescript
# Copy built application
COPY --from=builder /app/backend/services/minting-service/dist ./dist
COPY --from=builder /app/backend/services/minting-service/node_modules ./node_modules
COPY --from=builder /app/backend/services/minting-service/package*.json ./
# Copy configuration files
COPY backend/services/minting-service/real-merkle-tree-config.json ./real-merkle-tree-config.json
COPY backend/services/minting-service/collection-config.json ./collection-config.json
# Copy migration files
COPY --from=builder /app/backend/services/minting-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/minting-service/src/migrations ./src/migrations
# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for minting-service..."' >> /app/entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh
# Create logs directory and set permissions
RUN mkdir -p /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3018
ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
