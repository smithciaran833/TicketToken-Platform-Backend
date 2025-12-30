FROM node:20-alpine AS builder

WORKDIR /app

# Copy root tsconfig and shared module
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/api-gateway ./backend/services/api-gateway

# Build shared module first
WORKDIR /app/backend/shared
RUN npm install
RUN npm run build

# Build api-gateway
WORKDIR /app/backend/services/api-gateway
RUN npm install
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built shared module and api-gateway
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/api-gateway/dist ./dist
COPY --from=builder /app/backend/services/api-gateway/package*.json ./

# Install production dependencies only (no devDependencies, no node_modules bloat)
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

# Health check - hits the liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
