# =============================================================================
# Integration Service Dockerfile
# 
# AUDIT FIX DOC-1: Missing HEALTHCHECK → Production-ready health check
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune devDependencies
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S integration -u 1001 -G nodejs

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=integration:nodejs /app/dist ./dist
COPY --from=builder --chown=integration:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=integration:nodejs /app/package*.json ./

# Copy migrations if they exist
COPY --chown=integration:nodejs migrations/ ./migrations/ 2>/dev/null || true

# Environment configuration
ENV NODE_ENV=production \
    PORT=3008 \
    # Optimize Node.js for production
    NODE_OPTIONS="--max-old-space-size=512 --enable-source-maps" \
    # Disable color in logs for better parsing
    NO_COLOR=1

# Switch to non-root user
USER integration

# Expose service port
EXPOSE 3008

# =============================================================================
# AUDIT FIX DOC-1: Add proper HEALTHCHECK
# =============================================================================
# Health check configuration:
# - interval: Check every 30 seconds
# - timeout: Fail if no response within 10 seconds
# - start-period: Give container 60 seconds to start
# - retries: Mark unhealthy after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3008/health/live || exit 1

# Use dumb-init to handle PID 1 responsibilities (signal forwarding, zombie reaping)
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# -----------------------------------------------------------------------------
# Labels for container metadata
# -----------------------------------------------------------------------------
LABEL org.opencontainers.image.title="TicketToken Integration Service" \
      org.opencontainers.image.description="Third-party integrations service for Stripe, Square, Ticketmaster, and Eventbrite" \
      org.opencontainers.image.vendor="TicketToken" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.authors="TicketToken Engineering" \
      org.opencontainers.image.source="https://github.com/tickettoken/platform" \
      maintainer="engineering@tickettoken.com"
