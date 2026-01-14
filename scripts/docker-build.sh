#!/bin/bash
set -e

echo "========================================"
echo "TicketToken Docker Build"
echo "========================================"

# Build base image first
echo ""
echo "[1/2] Building base image..."
docker build -f Dockerfile.base -t tickettoken-base:latest .

echo ""
echo "[2/2] Base image complete."
echo ""
echo "To build a service, run:"
echo "  docker-compose build <service-name>"
echo ""
echo "To build all services:"
echo "  docker-compose build"
