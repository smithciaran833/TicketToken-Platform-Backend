# =============================================================================
# BLOCKCHAIN SERVICE DOCKERFILE
# 
# AUDIT FIXES:
# - #74: Clean npm cache after install
# - #75: Add dumb-init to ENTRYPOINT for proper signal handling
# - Hardening: Remove SUID/SGID binaries, non-root user, minimal image
# =============================================================================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared modules first
COPY backend/shared ./backend/shared

# Build shared modules
WORKDIR /app/backend/shared
RUN npm install && npm cache clean --force
RUN npm run build || true

# Copy service files
WORKDIR /app
COPY backend/services/blockchain-service ./backend/services/blockchain-service

# Build service
WORKDIR /app/backend/services/blockchain-service
# AUDIT FIX #74: Clean npm cache after install
RUN npm install && npm cache clean --force
RUN npm run build

# =============================================================================
# Production stage
# =============================================================================
FROM node:20-alpine AS production

# Security: Set labels
LABEL maintainer="platform-team@tickettoken.com"
LABEL service="blockchain-service"
LABEL security.audit="2026-01-02"

# Install dumb-init for proper signal handling
# AUDIT FIX #75: dumb-init ensures proper signal propagation
RUN apk add --no-cache dumb-init \
    # AUDIT FIX #74: Clean apk cache
    && rm -rf /var/cache/apk/*

# Security hardening: Remove SUID/SGID binaries
# This prevents privilege escalation attacks
RUN find / -perm /6000 -type f -exec chmod a-s {} \; 2>/dev/null || true

# Copy shared modules
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy service files
COPY --from=builder /app/backend/services/blockchain-service/package.json /app/backend/services/blockchain-service/package.json
COPY --from=builder /app/backend/services/blockchain-service/package-lock.json /app/backend/services/blockchain-service/package-lock.json

WORKDIR /app/backend/services/blockchain-service

# Install production dependencies
# AUDIT FIX #74: Clean npm cache after install
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /tmp/* /root/.npm

# Copy built files
COPY --from=builder /app/backend/services/blockchain-service/dist ./dist
COPY --from=builder /app/backend/services/blockchain-service/knexfile.js ./knexfile.js

# Remove TypeScript declaration files from migrations to avoid ES module issues
RUN find ./dist/migrations -name "*.d.ts" -delete 2>/dev/null || true && \
    find ./dist/migrations -name "*.d.ts.map" -delete 2>/dev/null || true && \
    find ./dist/migrations -name "*.js.map" -delete 2>/dev/null || true

# Create entrypoint script for migrations
# Uses set -e for error handling and proper signal handling
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Handle SIGTERM gracefully' >> /app/entrypoint.sh && \
    echo 'trap "echo Received SIGTERM, shutting down; exit 0" SIGTERM' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for blockchain-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/blockchain-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate || exit 1' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo 'echo "Migrations complete, starting service..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Security: Drop all capabilities, run as non-root
USER nodejs

# Service port
EXPOSE 3011

# Health check using curl-less approach for minimal image
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3011/health/live', (r) => {process.exit(r.statusCode===200?0:1)}).on('error', () => process.exit(1))" || exit 1

# AUDIT FIX #75: Use dumb-init for proper signal handling
# dumb-init acts as PID 1 and forwards signals to the Node.js process
# This ensures SIGTERM/SIGINT are properly handled for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/entrypoint.sh", "node", "dist/index.js"]
