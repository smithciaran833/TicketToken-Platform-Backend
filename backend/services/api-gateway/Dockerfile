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
COPY --from=builder /app/backend/services/api-gateway /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/services/api-gateway/src/server.js"]
