#!/bin/bash
# Tail logs from key services
docker-compose -f docker-compose.yml -f docker-compose.staging.yml logs -f \
    api-gateway \
    payment-service \
    ticket-service \
    order-service \
    minting-service \
    scanning-service
