FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g npm@latest
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/order-service ./backend/services/order-service
WORKDIR /app/backend/shared
RUN npm install
RUN npm run build || true
WORKDIR /app/backend/services/order-service
RUN npm install
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app/backend/services/order-service
RUN apk add --no-cache dumb-init
RUN npm install -g npm@latest
# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared
# Copy package files
COPY --from=builder /app/backend/services/order-service/package.json ./package.json
COPY --from=builder /app/backend/services/order-service/package-lock.json ./package-lock.json
# Install ALL dependencies (need ts-node for migrations)
RUN npm install
# Copy built artifacts
COPY --from=builder /app/backend/services/order-service/dist ./dist
# Copy migration files
COPY --from=builder /app/backend/services/order-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/order-service/src/migrations ./src/migrations
# Create entrypoint script
RUN echo '#!/bin/sh' > ./entrypoint.sh && \
    echo 'set -e' >> ./entrypoint.sh && \
    echo 'echo "Running migrations for order-service..."' >> ./entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> ./entrypoint.sh && \
    echo 'exec "$@"' >> ./entrypoint.sh && \
    chmod +x ./entrypoint.sh
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["./entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
