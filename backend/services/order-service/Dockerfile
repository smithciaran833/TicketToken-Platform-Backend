FROM node:20-alpine

WORKDIR /app

# Copy shared module first
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Go back to app directory
WORKDIR /app

# Copy and install order service
COPY backend/services/order-service/package.json ./
RUN npm install

# Copy source
COPY backend/services/order-service/ ./

EXPOSE 3008
CMD ["node", "src/index.js"]
