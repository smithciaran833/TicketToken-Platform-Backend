#!/bin/bash
echo "Health Check"
echo "============"
nc -zv localhost 5432 2>&1 | grep succeeded && echo "✓ PostgreSQL" || echo "✗ PostgreSQL"
nc -zv localhost 6379 2>&1 | grep succeeded && echo "✓ Redis" || echo "✗ Redis"
nc -zv localhost 3000 2>&1 | grep succeeded && echo "✓ API Gateway" || echo "✗ API Gateway"
