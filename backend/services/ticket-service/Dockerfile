FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/shared ./backend/shared
COPY backend/services/ticket-service ./backend/services/ticket-service
WORKDIR /app/backend/shared
RUN npm ci
RUN npm run build || true
WORKDIR /app/backend/services/ticket-service
RUN npm ci
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/ticket-service/package.json /app/backend/services/ticket-service/package.json
COPY --from=builder /app/backend/services/ticket-service/package-lock.json /app/backend/services/ticket-service/package-lock.json
WORKDIR /app/backend/services/ticket-service
RUN npm ci
COPY --from=builder /app/backend/services/ticket-service/dist ./dist

# Copy migration files
COPY --from=builder /app/backend/services/ticket-service/knexfile.ts ./knexfile.ts
COPY --from=builder /app/backend/services/ticket-service/src/migrations ./src/migrations

# Create entrypoint script for migrations
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations for ticket-service..."' >> /app/entrypoint.sh && \
    echo 'cd /app/backend/services/ticket-service' >> /app/entrypoint.sh && \
    echo 'npm run migrate' >> /app/entrypoint.sh && \
    echo 'if [ $? -ne 0 ]; then' >> /app/entrypoint.sh && \
    echo '  echo "ERROR: Migration failed! Container will not start."' >> /app/entrypoint.sh && \
    echo '  exit 1' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
ENTRYPOINT ["/app/entrypoint.sh", "dumb-init", "--"]
CMD ["node", "dist/services/ticket-service/src/index.js"]
