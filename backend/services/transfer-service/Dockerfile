FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY backend/services/transfer-service/package*.json ./
COPY backend/services/transfer-service/tsconfig.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy shared modules (needed for imports)
COPY backend/shared/ ../shared/

# Copy service source
COPY backend/services/transfer-service/src/ ./src/
COPY backend/services/transfer-service/knexfile.ts ./

# Build
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app

COPY backend/services/transfer-service/package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs backend/services/transfer-service/knexfile.ts ./

USER nodejs
EXPOSE 3019

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3019/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/app/src/index.js"]
