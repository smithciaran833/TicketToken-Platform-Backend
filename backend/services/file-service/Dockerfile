FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

# Copy shared module first
COPY backend/shared ./backend/shared
WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true

# Copy file-service
WORKDIR /app
COPY backend/services/file-service ./backend/services/file-service

# Build file-service
WORKDIR /app/backend/services/file-service
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install runtime dependencies + dumb-init + chromium + ClamAV
RUN apk add --no-cache \
    dumb-init \
    python3 \
    cairo \
    jpeg \
    pango \
    giflib \
    chromium \
    clamav \
    clamav-daemon \
    clamav-libunrar \
    freshclam

# Initialize ClamAV
RUN mkdir -p /var/lib/clamav /var/log/clamav /run/clamav /var/quarantine && \
    chown -R clamav:clamav /var/lib/clamav /var/log/clamav /run/clamav && \
    chmod 755 /var/quarantine

# Configure ClamAV daemon
RUN echo "TCPSocket 3310" > /etc/clamav/clamd.conf && \
    echo "TCPAddr 127.0.0.1" >> /etc/clamav/clamd.conf && \
    echo "LogFile /var/log/clamav/clamd.log" >> /etc/clamav/clamd.conf && \
    echo "LogFileMaxSize 10M" >> /etc/clamav/clamd.conf && \
    echo "LogTime yes" >> /etc/clamav/clamd.conf && \
    echo "PidFile /run/clamav/clamd.pid" >> /etc/clamav/clamd.conf && \
    echo "DatabaseDirectory /var/lib/clamav" >> /etc/clamav/clamd.conf && \
    echo "User clamav" >> /etc/clamav/clamd.conf

# Update virus database (may fail in build, that's OK - will update at runtime)
RUN freshclam || echo "Initial freshclam failed (expected in some build environments)"

# Copy shared module
COPY --from=builder /app/backend/shared /app/backend/shared

# Copy package files
COPY --from=builder /app/backend/services/file-service/package.json /app/backend/services/file-service/package.json
COPY --from=builder /app/backend/services/file-service/package-lock.json /app/backend/services/file-service/package-lock.json

# Install production dependencies
WORKDIR /app/backend/services/file-service
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci

# Copy built artifacts
COPY --from=builder /app/backend/services/file-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/file-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/file-service/src/migrations ./src/migrations

# Create directories for file storage
RUN mkdir -p /app/logs /app/uploads && \
    chmod -R 755 /app/logs /app/uploads

# Create entrypoint script for ClamAV + migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Start ClamAV daemon in background' >> /app/entrypoint.sh && \
    echo 'echo "Starting ClamAV daemon..."' >> /app/entrypoint.sh && \
    echo 'clamd &' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Wait for ClamAV to be ready' >> /app/entrypoint.sh && \
    echo 'sleep 2' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Update virus definitions in background' >> /app/entrypoint.sh && \
    echo 'freshclam -d &' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Run database migrations (fail fast on error)' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for file-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/file-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate' >> /app/entrypoint.sh && \
    echo 'echo "Migrations completed successfully"' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Start the application' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Set Puppeteer to use system chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Declare volumes for data persistence (important for development)
# NOTE: In production with S3, these volumes are not critical but still useful for temp files
VOLUME ["/app/uploads", "/var/quarantine", "/app/logs"]

EXPOSE 3013
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3013/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/index.js"]
