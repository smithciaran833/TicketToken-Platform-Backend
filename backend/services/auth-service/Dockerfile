FROM node:20-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN npm install --legacy-peer-deps

EXPOSE 3001

CMD ["npm", "run", "dev"]
