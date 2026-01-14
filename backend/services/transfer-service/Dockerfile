# Transfer Service Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune devDependencies
RUN npm prune --production

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-alpine AS production

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Install runtime dependencies only
RUN apk add --no-cache dumb-init curl

WORKDIR /app

# Copy built artifacts
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/migrations ./migrations

# Set environment defaults
ENV NODE_ENV=production \
    PORT=3019 \
    HOST=0.0.0.0

# Expose port
EXPOSE 3019

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3019/health/live || exit 1

# Switch to non-root user
USER nodejs

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]

# =============================================================================
# Stage 3: Development (optional)
# =============================================================================
FROM node:20-alpine AS development

RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy all files for development
COPY . .

# Install all dependencies
RUN npm ci

# Expose port
EXPOSE 3019

# Start with hot reload
CMD ["npm", "run", "dev"]
