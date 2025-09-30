FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev chromium
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/file-service ./backend/services/file-service

# Build shared cache module
WORKDIR /app/backend/shared/cache
RUN npm install && npm run build

# Install file service dependencies
WORKDIR /app/backend/services/file-service
RUN PUPPETEER_SKIP_DOWNLOAD=true npm install
# Copy shared module into node_modules properly
RUN rm -rf node_modules/@tickettoken && mkdir -p node_modules/@tickettoken
RUN cp -r /app/backend/shared node_modules/@tickettoken/shared
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init python3 cairo jpeg pango giflib chromium
COPY --from=builder /app/backend/services/file-service /app
COPY --from=builder /app/backend/shared /app/node_modules/@tickettoken/shared
RUN mkdir -p /app/logs /app/uploads && \
    chown -R 1001:1001 /app && \
    chmod -R 755 /app/logs /app/uploads
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
USER nodejs
EXPOSE 3013
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
