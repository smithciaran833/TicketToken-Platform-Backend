FROM node:20-alpine
WORKDIR /app
COPY backend/services/event-service/package.json ./
RUN npm install --omit=dev
