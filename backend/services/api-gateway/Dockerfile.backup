FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared module first
COPY backend/shared ./backend/shared

# Copy api-gateway service
COPY backend/services/api-gateway ./backend/services/api-gateway

# Go to api-gateway directory
WORKDIR /app/backend/services/api-gateway

# Install dependencies (this will now resolve the local shared module)
RUN npm install

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy the entire built application including node_modules
COPY --from=builder /app/backend/services/api-gateway ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/server.js"]
