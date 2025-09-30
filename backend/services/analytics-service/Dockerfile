FROM node:20-alpine AS builder

WORKDIR /app

# Set up shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Set up analytics service
WORKDIR /app
COPY backend/services/analytics-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json
RUN npm install

# Copy tsconfig files
COPY tsconfig.base.json /tsconfig.base.json
COPY backend/services/analytics-service/tsconfig.json ./

# Copy source
COPY backend/services/analytics-service/src ./src

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Set up shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install --only=production

WORKDIR /app
COPY backend/services/analytics-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json
RUN npm install --only=production

# Copy built app
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3011

CMD ["node", "dist/index.js"]
