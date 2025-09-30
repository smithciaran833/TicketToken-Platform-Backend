FROM node:20-alpine AS builder

WORKDIR /app

# First, set up the shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Now set up the search service
WORKDIR /app

# Copy package.json only
COPY backend/services/search-service/package.json ./

# Replace the file reference with the actual path in container
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json

# Now install dependencies
RUN npm install

# Copy tsconfig files
COPY tsconfig.base.json /tsconfig.base.json
COPY backend/services/search-service/tsconfig.json ./

# Copy source code
COPY backend/services/search-service/src ./src

# Build the TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Set up shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install --only=production

WORKDIR /app

# Copy package.json and modify the shared reference
COPY backend/services/search-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json

# Install production dependencies
RUN npm install --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3010

# Use server.js, not index.js
CMD ["node", "dist/server.js"]
