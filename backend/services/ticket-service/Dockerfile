FROM node:20-alpine AS builder

WORKDIR /app

# Copy the entire shared module with all its subdirectories
COPY backend/shared ./backend/shared

# Copy ticket-service
COPY backend/services/ticket-service ./backend/services/ticket-service

# Build shared module first
WORKDIR /app/backend/shared
RUN npm install

# Build shared/cache module
WORKDIR /app/backend/shared/cache
RUN npm install

# Now build ticket-service
WORKDIR /app/backend/services/ticket-service
RUN npm install
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy everything from builder
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/ticket-service /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3004

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
