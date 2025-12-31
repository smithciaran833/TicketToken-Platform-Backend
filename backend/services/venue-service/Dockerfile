# SECURITY FIX (BI2): Pin base image version for reproducibility
FROM node:20-alpine@sha256:df01469346db2bf1cfc1f7261aeab86b2960efa840fe2bd46d83ff339f463665 AS builder
WORKDIR /app
RUN npm install -g npm@latest
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/venue-service ./backend/services/venue-service

WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true

WORKDIR /app/backend/services/venue-service
RUN npm ci
RUN npm run build

# Production stage
# SECURITY FIX (BI2): Pin base image version for reproducibility
FROM node:20-alpine@sha256:df01469346db2bf1cfc1f7261aeab86b2960efa840fe2bd46d83ff339f463665
WORKDIR /app/backend/services/venue-service
RUN apk add --no-cache dumb-init
RUN npm install -g npm@latest

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/venue-service/package.json ./package.json
COPY --from=builder /app/backend/services/venue-service/package-lock.json ./package-lock.json

# SECURITY FIX (BS6): Use npm ci --omit=dev for production (excludes devDependencies)
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/backend/services/venue-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/venue-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/venue-service/src/migrations ./src/migrations

# Create entrypoint script
RUN echo '#!/bin/sh' > ./entrypoint.sh && \
    echo 'set -e' >> ./entrypoint.sh && \
    echo 'echo "Running migrations for venue-service..."' >> ./entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> ./entrypoint.sh && \
    echo 'exec "$@"' >> ./entrypoint.sh && \
    chmod +x ./entrypoint.sh

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["./entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
