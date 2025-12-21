FROM node:20-alpine AS builder
WORKDIR /app
# Copy the base tsconfig from root
COPY tsconfig.base.json ./tsconfig.base.json
# Copy the entire shared module with all its subdirectories
COPY backend/shared ./backend/shared
# Copy integration-service
COPY backend/services/integration-service ./backend/services/integration-service
# Build shared module first
WORKDIR /app/backend/shared
RUN npm install
# Build shared/cache module
WORKDIR /app/backend/services/integration-service
RUN npm install
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init
# Copy everything from builder
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/integration-service /app

# Copy migration files (correct paths from service directory)
COPY --from=builder /app/backend/services/integration-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/integration-service/src/migrations ./src/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for integration-service..."' >> /app/entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3015
# Use dumb-init to handle signals properly
ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
