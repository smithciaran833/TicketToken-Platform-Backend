FROM node:20-alpine AS builder
WORKDIR /app

# Copy the entire shared module
COPY backend/shared ./backend/shared

# Build shared module with legacy peer deps
WORKDIR /app/backend/shared
RUN npm install --legacy-peer-deps
RUN npm run build

# Copy payment-service
WORKDIR /app
COPY backend/services/payment-service ./backend/services/payment-service

# Build payment-service
WORKDIR /app/backend/services/payment-service
RUN npm install --legacy-peer-deps
RUN npm run build

# Copy knexfile to dist/config after build
RUN cp src/config/knexfile.js dist/config/ 2>/dev/null || true

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy both built shared module and payment service
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/payment-service /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3005

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
