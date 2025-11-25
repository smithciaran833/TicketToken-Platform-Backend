FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g npm@latest
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/auth-service ./backend/services/auth-service

WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true

WORKDIR /app/backend/services/auth-service
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app/backend/services/auth-service
RUN apk add --no-cache dumb-init
RUN npm install -g npm@latest

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/auth-service/package.json ./package.json
COPY --from=builder /app/backend/services/auth-service/package-lock.json ./package-lock.json

# Install ALL dependencies (need typescript and knex for migrations)
RUN npm ci

# Copy built artifacts
COPY --from=builder /app/backend/services/auth-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/auth-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/auth-service/src/migrations ./src/migrations

# Create entrypoint script IN THE WORKDIR
RUN echo '#!/bin/sh' > ./entrypoint.sh && \
    echo 'set -e' >> ./entrypoint.sh && \
    echo 'echo "Running migrations for auth-service..."' >> ./entrypoint.sh && \
    echo 'npm run migrate || echo "Migration failed, continuing..."' >> ./entrypoint.sh && \
    echo 'exec "$@"' >> ./entrypoint.sh && \
    chmod +x ./entrypoint.sh

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["./entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
