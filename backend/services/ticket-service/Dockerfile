# ============================================
# Ticket Service Dockerfile
# Multi-stage build for optimal image size
# ============================================

# ---------------------------------------------
# Stage 1: Dependencies
# Install production dependencies only
# ---------------------------------------------
FROM node:18-alpine AS deps

WORKDIR /app

# Install native dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# ---------------------------------------------
# Stage 2: Builder
# Build TypeScript application
# ---------------------------------------------
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ---------------------------------------------
# Stage 3: Runner
# Minimal production image
# ---------------------------------------------
FROM node:18-alpine AS runner

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ticketservice

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3004

# Copy production dependencies
COPY --from=deps --chown=ticketservice:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=ticketservice:nodejs /app/dist ./dist
COPY --from=builder --chown=ticketservice:nodejs /app/package.json ./

# Copy migrations (needed for runtime migrations)
COPY --chown=ticketservice:nodejs src/migrations ./src/migrations

# Security: Remove unnecessary files
RUN rm -rf /tmp/* /var/cache/apk/*

# Switch to non-root user
USER ticketservice

# Expose application port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3004/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]

# ---------------------------------------------
# Metadata
# ---------------------------------------------
LABEL org.opencontainers.image.title="Ticket Service" \
      org.opencontainers.image.description="TicketToken Ticket Management Service" \
      org.opencontainers.image.vendor="TicketToken" \
      org.opencontainers.image.source="https://github.com/tickettoken/platform" \
      org.opencontainers.image.documentation="https://docs.tickettoken.io/services/ticket" \
      maintainer="platform@tickettoken.io"
