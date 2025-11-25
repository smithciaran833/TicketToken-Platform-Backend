.PHONY: help build up down restart logs test clean

help:
	@echo "TicketToken Platform - Docker Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make build     - Build all Docker images"
	@echo "  make up        - Start all services"
	@echo "  make down      - Stop all services"
	@echo "  make restart   - Restart all services"
	@echo "  make logs      - View logs (ctrl+c to exit)"
	@echo "  make test      - Run integration tests"
	@echo "  make clean     - Remove all containers and volumes"
	@echo ""

build:
	docker-compose build --no-cache

up:
	./docker-startup.sh

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

test:
	./docker-test.sh

clean:
	docker-compose down -v
	docker system prune -f
