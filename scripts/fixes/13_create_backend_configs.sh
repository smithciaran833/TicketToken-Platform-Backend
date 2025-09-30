#!/bin/bash
# Create backend service configuration files

set -euo pipefail

echo "Creating backend service configuration files..."

# Create backend directory structure
mkdir -p backend/config
mkdir -p backend/services
mkdir -p backend/middleware

# Create database configuration file
cat > backend/config/database.js << 'JS'
const knex = require('knex');

const connection = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 6432, // PgBouncer port
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  },
  pool: {
    min: 2,
    max: 10,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100
  },
  acquireConnectionTimeout: 30000
});

// Set tenant context for each query
connection.on('query', (query) => {
  if (global.currentTenant) {
    query.on('query', (q) => {
      connection.raw(`SET app.current_tenant = '${global.currentTenant}'`);
    });
  }
});

module.exports = connection;
JS

# Create Redis configuration
cat > backend/config/redis.js << 'JS'
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

module.exports = redis;
JS

# Create cache service
cat > backend/services/cache-service.js << 'JS'
const redis = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutes
  }

  async get(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async delete(key) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async flush() {
    try {
      await redis.flushdb();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }

  // Specific cache methods
  async getAvailableSeats(eventId) {
    const key = `seats:available:${eventId}`;
    return await this.get(key);
  }

  async setAvailableSeats(eventId, seats, ttl = 30) {
    const key = `seats:available:${eventId}`;
    return await this.set(key, seats, ttl);
  }

  async invalidateEvent(eventId) {
    const pattern = `*:${eventId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

module.exports = new CacheService();
JS

# Create tenant context middleware
cat > backend/middleware/tenant-context.js << 'JS'
// Middleware to set tenant context for all requests

module.exports = function tenantContext() {
  return async (req, res, next) => {
    try {
      // Get tenant from various sources
      let tenantId = null;
      
      // 1. From subdomain (e.g., venue1.tickettoken.com)
      const subdomain = req.hostname.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'tickettoken') {
        // Look up tenant by subdomain
        tenantId = await getTenantBySubdomain(subdomain);
      }
      
      // 2. From header (for API clients)
      if (!tenantId && req.headers['x-tenant-id']) {
        tenantId = req.headers['x-tenant-id'];
      }
      
      // 3. From authenticated user
      if (!tenantId && req.user && req.user.tenantId) {
        tenantId = req.user.tenantId;
      }
      
      // Set global context
      if (tenantId) {
        global.currentTenant = tenantId;
        req.tenantId = tenantId;
        
        // Set PostgreSQL session variable
        if (req.db) {
          await req.db.raw('SET app.current_tenant = ?', [tenantId]);
        }
      }
      
      next();
    } catch (error) {
      console.error('Tenant context error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

async function getTenantBySubdomain(subdomain) {
  // Implementation depends on your database setup
  // This is a placeholder
  const db = require('../config/database');
  const result = await db('tenants')
    .where('slug', subdomain)
    .first();
  return result ? result.id : null;
}
JS

echo "Backend configuration files created successfully!"
