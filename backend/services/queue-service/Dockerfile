FROM node:20-alpine AS builder
WORKDIR /app
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/queue-service ./backend/services/queue-service
WORKDIR /app/backend/shared
RUN npm install
WORKDIR /app/backend/shared/cache
RUN npm install
WORKDIR /app/backend/services/queue-service
RUN npm install
RUN npm install --save-dev @types/uuid
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/queue-service /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 3011
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
