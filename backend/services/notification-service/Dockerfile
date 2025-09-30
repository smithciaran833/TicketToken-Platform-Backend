FROM node:20-alpine

WORKDIR /app

# Copy pre-built dist folder
COPY backend/services/notification-service/dist ./dist

# Copy templates and migrations into dist (they don't get compiled by TypeScript)
COPY backend/services/notification-service/src/templates ./dist/templates
COPY backend/services/notification-service/src/migrations ./dist/migrations

# Copy package.json
COPY backend/services/notification-service/package.json ./

# Copy and setup shared module
COPY backend/shared /shared

# Fix shared module path and install dependencies without lock file
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json && \
    npm install --production --no-package-lock

EXPOSE 3006

CMD ["node", "dist/index.js"]
