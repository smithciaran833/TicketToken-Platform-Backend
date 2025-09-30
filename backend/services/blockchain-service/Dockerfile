FROM node:20-alpine AS builder

WORKDIR /app

# Set up shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Set up blockchain service
WORKDIR /app
COPY backend/services/blockchain-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json
RUN npm install

# Copy tsconfig files
COPY tsconfig.base.json /tsconfig.base.json
COPY backend/services/blockchain-service/tsconfig.json ./

# Copy source
COPY backend/services/blockchain-service/src ./src

# Build TypeScript files
RUN npm run build || true

# If build failed or didn't create dist, copy JS files directly
RUN if [ ! -d "dist" ]; then mkdir dist && cp -r src/* dist/; fi

# Production stage
FROM node:20-alpine

WORKDIR /app

# Set up shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install --only=production

WORKDIR /app
COPY backend/services/blockchain-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json
RUN npm install --only=production

# Copy built/source files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3012

# Use the JS entry point since it exists
CMD ["node", "src/index.js"]
