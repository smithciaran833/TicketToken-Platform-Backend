FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies for TensorFlow
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest

COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/analytics-service ./backend/services/analytics-service

WORKDIR /app/backend/shared
RUN npm install
RUN npm run build || true

WORKDIR /app/backend/services/analytics-service
RUN npm install
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app/backend/services/analytics-service

# Install runtime dependencies for TensorFlow
RUN apt-get update && apt-get install -y \
    python3 \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/analytics-service/package.json ./package.json
COPY --from=builder /app/backend/services/analytics-service/package-lock.json ./package-lock.json

# Install ALL dependencies (need typescript and ts-node for migrations)
RUN npm install

# Copy built artifacts
COPY --from=builder /app/backend/services/analytics-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/analytics-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/analytics-service/src/migrations ./src/migrations

# Create entrypoint script
RUN echo '#!/bin/sh' > ./entrypoint.sh && \
    echo 'set -e' >> ./entrypoint.sh && \
    echo 'echo "Running migrations for analytics-service..."' >> ./entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> ./entrypoint.sh && \
    echo 'exec "$@"' >> ./entrypoint.sh && \
    chmod +x ./entrypoint.sh

RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3010
ENTRYPOINT ["./entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
