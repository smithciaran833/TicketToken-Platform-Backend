FROM node:20-alpine
WORKDIR /app
COPY backend/services/event-service/package.json ./
COPY backend/services/event-service/package-lock.json ./
RUN ls -la
RUN cat package.json | head -5
RUN cat package-lock.json | head -5
