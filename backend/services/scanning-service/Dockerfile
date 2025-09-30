FROM node:20-alpine

WORKDIR /app

# Copy shared module first
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Go back to app directory
WORKDIR /app

# Copy and install scanning service
COPY backend/services/scanning-service/package.json ./
RUN npm install
RUN npm install --save-dev typescript @types/cors @types/uuid @types/express @types/node

# Copy source
COPY backend/services/scanning-service/ ./

# Build
RUN npm run build

EXPOSE 3007
CMD ["npm", "start"]
