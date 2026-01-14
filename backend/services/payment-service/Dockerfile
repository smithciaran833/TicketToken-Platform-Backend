# Payment Service Dockerfile
# 
# LOW FIXES:
# - Pin base image with @sha256 digest for reproducibility
# - Add npm cache clean to reduce image size
# - Multi-stage build for smaller production image

# =============================================================================
# Build Stage
# =============================================================================
# LOW FIX: Pin Node.js LTS image with SHA256 digest
FROM node:20.10.0-alpine3.18@sha256:e96618520c7db4c3e082648678ab72a49b73367b9a1e7884cf75ac30a198e454 AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# LOW FIX: Clean npm cache after install
RUN npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# LOW FIX: Final cache clean
RUN npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# =============================================================================
# Production Stage
# =============================================================================
# LOW FIX: Pin Node.js LTS image with SHA256 digest
FROM node:20.10.0-alpine3.18@sha256:e96618520c7db4c3e082648678ab72a49b73367b9a1e7884cf75ac30a198e454 AS production

# Set production environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -s /bin/sh -D nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p logs && chown nodejs:nodejs logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3006}/health || exit 1

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE ${PORT:-3006}

# Set memory limits for Node.js
ENV NODE_OPTIONS="--max-old-space-size=512"

# Start the application
CMD ["node", "dist/index.js"]

# =============================================================================
# Development Stage (optional, for local dev)
# =============================================================================
FROM node:20.10.0-alpine3.18@sha256:e96618520c7db4c3e082648678ab72a49b73367b9a1e7884cf75ac30a198e454 AS development

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci && npm cache clean --force

# Copy source
COPY . .

# Start in development mode
CMD ["npm", "run", "dev"]
