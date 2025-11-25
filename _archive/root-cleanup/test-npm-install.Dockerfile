FROM node:20-alpine
WORKDIR /app
COPY backend/services/event-service/package.json ./
COPY backend/services/event-service/package-lock.json ./
RUN npm install --production
