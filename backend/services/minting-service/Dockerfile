FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY backend/shared ./backend/shared
COPY backend/services/minting-service ./
# Install shared dependencies
WORKDIR /app/backend/shared
RUN npm install
WORKDIR /app/backend/shared/cache
RUN npm install
# Install service dependencies
WORKDIR /app
RUN npm install

# Copy configuration files before changing user
COPY backend/services/minting-service/devnet-wallet.json ./devnet-wallet.json
COPY backend/services/minting-service/real-merkle-tree-config.json ./real-merkle-tree-config.json

# Create logs directory and set permissions for everything
RUN mkdir -p /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3018
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
