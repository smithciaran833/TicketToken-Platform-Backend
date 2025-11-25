# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared modules first
COPY backend/shared ./backend/shared

# Build shared modules
WORKDIR /app/backend/shared
RUN npm install
RUN npm run build || true

# Copy service files
WORKDIR /app
COPY backend/services/blockchain-service ./backend/services/blockchain-service

# Build service
WORKDIR /app/backend/services/blockchain-service
RUN npm install
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy shared modules
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy service files
COPY --from=builder /app/backend/services/blockchain-service/package.json /app/backend/services/blockchain-service/package.json
COPY --from=builder /app/backend/services/blockchain-service/package-lock.json /app/backend/services/blockchain-service/package-lock.json

WORKDIR /app/backend/services/blockchain-service

# Install production dependencies
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/backend/services/blockchain-service/dist ./dist
COPY --from=builder /app/backend/services/blockchain-service/knexfile.js ./knexfile.js

# Remove TypeScript declaration files from migrations to avoid ES module issues
RUN find ./dist/migrations -name "*.d.ts" -delete && \
    find ./dist/migrations -name "*.d.ts.map" -delete && \
    find ./dist/migrations -name "*.js.map" -delete

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for blockchain-service..."' >> /app/entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Set proper permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3011/health', (r) => {let b=''; r.on('data', (c) => b+=c); r.on('end', () => {try{const j=JSON.parse(b); process.exit(j.status==='healthy'?0:1)}catch(e){process.exit(1)}})})" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
