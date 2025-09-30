const { Pool } = require('pg');
const Redis = require('ioredis');
const amqp = require('amqplib');
const os = require('os');
const { performance } = require('perf_hooks');

class HealthChecker {
  constructor(serviceName, dependencies = {}) {
    this.serviceName = serviceName;
    this.dependencies = dependencies;
    this.checks = new Map();
    this.circuitBreakers = new Map();
    this.startTime = Date.now();
    
    // Initialize circuit breakers for each dependency
    Object.keys(dependencies).forEach(dep => {
      this.circuitBreakers.set(dep, {
        state: 'closed', // closed, open, half-open
        failures: 0,
        lastFailure: null,
        successCount: 0,
        threshold: 5,
        timeout: 60000, // 1 minute
        halfOpenRequests: 0
      });
    });
  }

  // Register health check functions
  registerCheck(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      critical: options.critical || false,
      timeout: options.timeout || 5000,
      cache: null,
      cacheExpiry: options.cacheExpiry || 10000, // Cache for 10 seconds
      lastCheck: null
    });
  }

  // Database health check
  async checkDatabase() {
    const start = performance.now();
    const config = this.dependencies.database;
    
    if (!config) {
      return { healthy: false, message: 'Database not configured' };
    }

    const pool = new Pool({
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      database: config.database || process.env.DB_NAME,
      user: config.user || process.env.DB_USER,
      password: config.password || process.env.DB_PASSWORD,
      max: 1,
      connectionTimeoutMillis: 5000
    });

    try {
      const client = await pool.connect();
      const result = await client.query('SELECT 1 as health_check');
      
      // Check connection pool stats
      const poolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
      
      client.release();
      await pool.end();
      
      const duration = performance.now() - start;
      
      return {
        healthy: true,
        duration: Math.round(duration),
        details: {
          connected: true,
          responseTime: `${Math.round(duration)}ms`,
          pool: poolStats,
          host: config.host,
          database: config.database
        }
      };
    } catch (error) {
      await pool.end().catch(() => {});
      
      return {
        healthy: false,
        duration: Math.round(performance.now() - start),
        error: error.message,
        details: {
          connected: false,
          host: config.host,
          database: config.database
        }
      };
    }
  }

  // Redis health check
  async checkRedis() {
    const start = performance.now();
    const config = this.dependencies.redis;
    
    if (!config) {
      return { healthy: false, message: 'Redis not configured' };
    }

    const redis = new Redis({
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || process.env.REDIS_PORT || 6379,
      password: config.password || process.env.REDIS_PASSWORD,
      connectTimeout: 5000,
      lazyConnect: true
    });

    try {
      await redis.connect();
      await redis.ping();
      
      // Get Redis info
      const info = await redis.info('server');
      const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
      const usedMemory = await redis.info('memory').then(m => 
        m.match(/used_memory_human:([^\r\n]+)/)?.[1]
      );
      
      await redis.quit();
      
      const duration = performance.now() - start;
      
      return {
        healthy: true,
        duration: Math.round(duration),
        details: {
          connected: true,
          responseTime: `${Math.round(duration)}ms`,
          version,
          usedMemory,
          host: config.host
        }
      };
    } catch (error) {
      await redis.quit().catch(() => {});
      
      return {
        healthy: false,
        duration: Math.round(performance.now() - start),
        error: error.message,
        details: {
          connected: false,
          host: config.host
        }
      };
    }
  }

  // RabbitMQ health check
  async checkRabbitMQ() {
    const start = performance.now();
    const config = this.dependencies.rabbitmq;
    
    if (!config) {
      return { healthy: false, message: 'RabbitMQ not configured' };
    }

    const url = config.url || process.env.RABBITMQ_URL || 'amqp://localhost';

    try {
      const connection = await amqp.connect(url, {
        timeout: 5000
      });
      
      const channel = await connection.createChannel();
      
      // Test by asserting a temporary queue
      const q = await channel.assertQueue('', { exclusive: true });
      await channel.deleteQueue(q.queue);
      
      await channel.close();
      await connection.close();
      
      const duration = performance.now() - start;
      
      return {
        healthy: true,
        duration: Math.round(duration),
        details: {
          connected: true,
          responseTime: `${Math.round(duration)}ms`,
          host: new URL(url).hostname
        }
      };
    } catch (error) {
      return {
        healthy: false,
        duration: Math.round(performance.now() - start),
        error: error.message,
        details: {
          connected: false,
          host: config.host || 'localhost'
        }
      };
    }
  }

  // System resource checks
  checkSystemResources() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsagePercent = (usedMem / totalMem) * 100;
    
    const cpus = os.cpus();
    const avgLoad = os.loadavg();
    
    // Calculate CPU usage
    const cpuUsage = cpus.map((cpu, i) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return {
        core: i,
        usage: Math.round(((total - idle) / total) * 100)
      };
    });
    
    const avgCpuUsage = cpuUsage.reduce((a, b) => a + b.usage, 0) / cpuUsage.length;
    
    return {
      healthy: memoryUsagePercent < 90 && avgCpuUsage < 90,
      details: {
        memory: {
          total: `${Math.round(totalMem / 1024 / 1024)}MB`,
          used: `${Math.round(usedMem / 1024 / 1024)}MB`,
          free: `${Math.round(freeMem / 1024 / 1024)}MB`,
          usagePercent: Math.round(memoryUsagePercent)
        },
        cpu: {
          cores: cpus.length,
          avgUsage: Math.round(avgCpuUsage),
          loadAverage: avgLoad.map(l => Math.round(l * 100) / 100)
        },
        uptime: Math.round(os.uptime()),
        platform: os.platform(),
        nodeVersion: process.version
      }
    };
  }

  // Circuit breaker logic
  async checkWithCircuitBreaker(name, checkFn) {
    const breaker = this.circuitBreakers.get(name);
    
    if (!breaker) {
      return await checkFn();
    }

    // If circuit is open, check if timeout has passed
    if (breaker.state === 'open') {
      if (Date.now() - breaker.lastFailure > breaker.timeout) {
        breaker.state = 'half-open';
        breaker.halfOpenRequests = 0;
      } else {
        return {
          healthy: false,
          circuitBreaker: 'open',
          message: `Circuit breaker open. Will retry after ${new Date(breaker.lastFailure + breaker.timeout).toISOString()}`
        };
      }
    }

    // If half-open, allow limited requests
    if (breaker.state === 'half-open' && breaker.halfOpenRequests >= 3) {
      return {
        healthy: false,
        circuitBreaker: 'half-open',
        message: 'Circuit breaker half-open, limiting requests'
      };
    }

    try {
      if (breaker.state === 'half-open') {
        breaker.halfOpenRequests++;
      }

      const result = await checkFn();
      
      if (result.healthy) {
        breaker.failures = 0;
        breaker.successCount++;
        
        if (breaker.state === 'half-open' && breaker.successCount >= 3) {
          breaker.state = 'closed';
          breaker.successCount = 0;
        }
      } else {
        throw new Error(result.error || 'Health check failed');
      }
      
      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailure = Date.now();
      breaker.successCount = 0;
      
      if (breaker.failures >= breaker.threshold) {
        breaker.state = 'open';
      }
      
      return {
        healthy: false,
        circuitBreaker: breaker.state,
        failures: breaker.failures,
        error: error.message
      };
    }
  }

  // Main health check endpoint
  async getHealth(detailed = false) {
    const checks = {};
    const checkPromises = [];

    // Database check
    if (this.dependencies.database) {
      checkPromises.push(
        this.checkWithCircuitBreaker('database', () => this.checkDatabase())
          .then(result => { checks.database = result; })
      );
    }

    // Redis check
    if (this.dependencies.redis) {
      checkPromises.push(
        this.checkWithCircuitBreaker('redis', () => this.checkRedis())
          .then(result => { checks.redis = result; })
      );
    }

    // RabbitMQ check
    if (this.dependencies.rabbitmq) {
      checkPromises.push(
        this.checkWithCircuitBreaker('rabbitmq', () => this.checkRabbitMQ())
          .then(result => { checks.rabbitmq = result; })
      );
    }

    // Custom checks
    for (const [name, check] of this.checks) {
      checkPromises.push(
        Promise.race([
          check.fn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Check timeout')), check.timeout)
          )
        ])
        .then(result => { checks[name] = result; })
        .catch(error => { 
          checks[name] = { healthy: false, error: error.message };
        })
      );
    }

    // Run all checks in parallel
    await Promise.allSettled(checkPromises);

    // System resources
    checks.system = this.checkSystemResources();

    // Calculate overall health
    const criticalChecks = ['database', 'redis', 'rabbitmq'].filter(c => 
      this.dependencies[c] && checks[c] && !checks[c].healthy
    );
    
    const allHealthy = Object.values(checks).every(c => c.healthy !== false);
    const status = criticalChecks.length > 0 ? 'unhealthy' : 
                   allHealthy ? 'healthy' : 'degraded';

    const health = {
      status,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      checks: detailed ? checks : undefined
    };

    if (!detailed) {
      health.summary = {
        total: Object.keys(checks).length,
        healthy: Object.values(checks).filter(c => c.healthy).length,
        unhealthy: Object.values(checks).filter(c => !c.healthy).length
      };
    }

    return health;
  }

  // Readiness check
  async getReadiness() {
    const health = await this.getHealth(true);
    
    // Service is ready if all critical dependencies are healthy
    const criticalHealthy = ['database'].every(dep => 
      !this.dependencies[dep] || health.checks[dep]?.healthy
    );

    return {
      ready: criticalHealthy && health.status !== 'unhealthy',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      dependencies: Object.keys(health.checks).reduce((acc, key) => {
        acc[key] = health.checks[key].healthy ? 'ready' : 'not ready';
        return acc;
      }, {})
    };
  }

  // Liveness check (simple, fast)
  getLiveness() {
    return {
      alive: true,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      pid: process.pid
    };
  }
}

module.exports = HealthChecker;
