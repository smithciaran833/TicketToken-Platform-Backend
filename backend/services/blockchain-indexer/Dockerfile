# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/blockchain-indexer ./backend/services/blockchain-indexer

# Install and build shared first
WORKDIR /app/backend/shared
RUN npm install

# Build service
WORKDIR /app/backend/services/blockchain-indexer
RUN npm install --no-package-lock
RUN npm run build

# Production stage
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=builder /app/backend/services/blockchain-indexer/dist ./dist
COPY --from=builder /app/backend/services/blockchain-indexer/node_modules ./node_modules
COPY --from=builder /app/backend/services/blockchain-indexer/package.json ./
COPY --from=builder /app/backend/shared ./backend/shared
COPY --from=builder /app/backend/services/blockchain-indexer/knexfile.js ./knexfile.js

# Remove TypeScript declaration files from migrations
RUN find ./dist/migrations -name "*.d.ts" -delete 2>/dev/null || true && \
    find ./dist/migrations -name "*.d.ts.map" -delete 2>/dev/null || true && \
    find ./dist/migrations -name "*.js.map" -delete 2>/dev/null || true

# Create entrypoint script
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for blockchain-indexer..."' >> /app/entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

RUN mkdir -p /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3012

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3012/health', (r) => {let b=''; r.on('data', (c) => b+=c); r.on('end', () => {try{const j=JSON.parse(b); process.exit(j.status==='healthy'?0:1)}catch(e){process.exit(1)}})})" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
