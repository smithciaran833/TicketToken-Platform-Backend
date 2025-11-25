#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  TICKETTOKEN DOCKER STARTUP${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${YELLOW}⚠️  No .env file found, copying from .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}✅ .env file created${NC}"
fi

# Clean up any existing containers
echo -e "${YELLOW}🧹 Cleaning up old containers...${NC}"
docker-compose down -v 2>/dev/null || true

# Build images
echo ""
echo -e "${BLUE}🔨 Building Docker images...${NC}"
docker-compose build --no-cache

# Start infrastructure first
echo ""
echo -e "${BLUE}🚀 Starting infrastructure services...${NC}"
docker-compose up -d postgres redis rabbitmq mongodb elasticsearch

# Wait for postgres to be healthy
echo ""
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
for i in {1..30}; do
  if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"
    break
  fi
  echo -n "."
  sleep 2
done

# Run migrations
echo ""
echo -e "${BLUE}📊 Running database migrations...${NC}"
echo -e "${YELLOW}Note: You may need to run migrations manually for each service${NC}"

# Start application services
echo ""
echo -e "${BLUE}🚀 Starting application services...${NC}"
docker-compose up -d auth-service venue-service event-service

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
echo ""
echo -e "${BLUE}🏥 Checking service health...${NC}"

check_health() {
  local service=$1
  local port=$2
  local url="http://localhost:${port}/health"
  
  if curl -f -s "$url" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ${service} is healthy${NC}"
    return 0
  else
    echo -e "${RED}❌ ${service} is not responding${NC}"
    return 1
  fi
}

ALL_HEALTHY=true
check_health "Auth Service" 3001 || ALL_HEALTHY=false
check_health "Venue Service" 3002 || ALL_HEALTHY=false
check_health "Event Service" 3003 || ALL_HEALTHY=false

echo ""
if [ "$ALL_HEALTHY" = true ]; then
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN}  🎉 ALL SERVICES ARE RUNNING!${NC}"
  echo -e "${GREEN}============================================${NC}"
  echo ""
  echo -e "${BLUE}Service URLs:${NC}"
  echo -e "  Auth Service:   ${GREEN}http://localhost:3001${NC}"
  echo -e "  Venue Service:  ${GREEN}http://localhost:3002${NC}"
  echo -e "  Event Service:  ${GREEN}http://localhost:3003${NC}"
  echo ""
  echo -e "${BLUE}Infrastructure:${NC}"
  echo -e "  PostgreSQL:     ${GREEN}localhost:5432${NC}"
  echo -e "  Redis:          ${GREEN}localhost:6379${NC}"
  echo -e "  RabbitMQ:       ${GREEN}localhost:15672${NC} (admin/admin)"
  echo -e "  MongoDB:        ${GREEN}localhost:27017${NC}"
  echo -e "  Elasticsearch:  ${GREEN}localhost:9200${NC}"
  echo ""
  echo -e "${BLUE}Useful commands:${NC}"
  echo -e "  View logs:      ${YELLOW}docker-compose logs -f [service]${NC}"
  echo -e "  Stop all:       ${YELLOW}docker-compose down${NC}"
  echo -e "  Restart:        ${YELLOW}docker-compose restart [service]${NC}"
  echo ""
else
  echo -e "${RED}============================================${NC}"
  echo -e "${RED}  ⚠️  SOME SERVICES FAILED TO START${NC}"
  echo -e "${RED}============================================${NC}"
  echo ""
  echo -e "${YELLOW}Check logs with: docker-compose logs [service]${NC}"
  exit 1
fi
