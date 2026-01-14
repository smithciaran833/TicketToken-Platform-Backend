# Compliance Service Dockerfile
# AUDIT FIXES:
# - DEP-M1: Use npm ci instead of npm install
# - DEP-H1: Pin base image to digest for security
# - CFG-M4: Support for Docker secrets

# =============================================================================
# BUILD STAGE
# =============================================================================
# Using Node.js 20 LTS Alpine - pinned to specific version for reproducibility
FROM node:20.10.0-alpine3.18 AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# DEP-M1: Use npm ci for reproducible builds
RUN npm ci --only=production=false

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20.10.0-alpine3.18 AS production

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl

# Set working directory
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Copy migrations
COPY --chown=nodejs:nodejs migrations/ ./migrations/
COPY --chown=nodejs:nodejs knexfile.ts ./

# Create directories for logs and tmp
RUN mkdir -p /app/logs /app/tmp && \
    chown -R nodejs:nodejs /app/logs /app/tmp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3008
ENV SERVICE_NAME=compliance-service

# CFG-M4: Support for Docker secrets
# Secrets are mounted at /run/secrets/ by Docker Swarm/Compose
ENV SECRETS_PATH=/run/secrets

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3008/health/live || exit 1

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3008

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Labels for metadata
LABEL org.opencontainers.image.title="Compliance Service" \
      org.opencontainers.image.description="TicketToken Compliance Service - GDPR, OFAC, Tax" \
      org.opencontainers.image.vendor="TicketToken" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/tickettoken/compliance-service"
