FROM node:20-alpine AS builder

WORKDIR /app

COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/compliance-service ./backend/services/compliance-service

WORKDIR /app/backend/shared
RUN npm install

WORKDIR /app/backend/shared/cache
RUN npm install

WORKDIR /app/backend/services/compliance-service
RUN npm install
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/compliance-service /app

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads /app/logs && \
    chown -R 1001:1001 /app && \
    chmod -R 755 /app/uploads /app/logs

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3010

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
