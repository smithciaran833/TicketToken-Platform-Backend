#!/bin/bash
# Create Docker and environment setup files

set -euo pipefail

echo "Creating Docker and environment setup..."

# Create docker-compose.yml
cat > docker-compose.yml << 'YAML'
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: tickettoken_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgresql/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf

  pgbouncer:
    image: pgbouncer/pgbouncer:latest
    ports:
      - "6432:6432"
    volumes:
      - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini
      - ./pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt
    depends_on:
      - postgres

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongo_data:/data/db

  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data

  influxdb:
    image: influxdb:2.7
    ports:
      - "8086:8086"
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: ${INFLUX_USER}
      DOCKER_INFLUXDB_INIT_PASSWORD: ${INFLUX_PASSWORD}
      DOCKER_INFLUXDB_INIT_ORG: tickettoken
      DOCKER_INFLUXDB_INIT_BUCKET: metrics
    volumes:
      - influx_data:/var/lib/influxdb2

volumes:
  postgres_data:
  redis_data:
  mongo_data:
  es_data:
  influx_data:
YAML

# Create .env.example
cat > .env.example << 'ENV'
# Database Credentials
DB_USER=postgres
DB_PASSWORD=change_me
DB_HOST=localhost
DB_PORT=6432
DB_NAME=tickettoken_db

# MongoDB
MONGO_USER=admin
MONGO_PASSWORD=change_me

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# InfluxDB
INFLUX_USER=admin
INFLUX_PASSWORD=change_me

# Connection URLs
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}
ENV

# Create PgBouncer configuration
mkdir -p pgbouncer
cat > pgbouncer/pgbouncer.ini << 'INI'
[databases]
tickettoken_db = host=postgres port=5432 dbname=tickettoken_db

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 10000
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 5
max_db_connections = 50
max_user_connections = 50
server_lifetime = 3600
server_idle_timeout = 600
server_connect_timeout = 15
server_login_retry = 15
query_timeout = 0
query_wait_timeout = 120
client_idle_timeout = 0
client_login_timeout = 60
autodb_idle_timeout = 3600
suspend_timeout = 10
idle_transaction_timeout = 0

# Logging
admin_users = postgres
stats_users = postgres, stats_collector
INI

# Create PostgreSQL configuration
mkdir -p postgresql
cat > postgresql/postgresql.conf << 'CONF'
# Connection Settings
listen_addresses = '*'
port = 5432
max_connections = 100
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 4MB

# Checkpoint Settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1

# Logging
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_statement = 'ddl'
log_duration = off
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,client=%h '
log_timezone = 'UTC'

# Enable UUID extension
shared_preload_libraries = 'uuid-ossp'

# Performance
effective_io_concurrency = 200
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_maintenance_workers = 4
max_parallel_workers = 8
CONF

echo "Docker and environment setup complete!"
