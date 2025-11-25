FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY backend/shared ./backend/shared
COPY backend/services/transfer-service ./

# Install shared dependencies
WORKDIR /app/backend/shared
RUN npm install

WORKDIR /app/backend/shared/cache
RUN npm install

# Install service dependencies
WORKDIR /app
RUN npm install

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app/logs

USER nodejs

EXPOSE 3019

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
