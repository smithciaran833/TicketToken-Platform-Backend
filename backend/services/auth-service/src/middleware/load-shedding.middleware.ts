/**
 * Priority-Based Load Shedding Middleware
 * 
 * Under heavy load, sheds lower-priority requests to protect critical flows.
 * Works in conjunction with @fastify/under-pressure.
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { getRoutePriority, shouldShedRoute, getPriorityName, Priority } from '../config/priorities';
import { logger } from '../utils/logger';
import { Counter, Gauge } from 'prom-client';
import { register } from '../utils/metrics';
import v8 from 'v8';
import os from 'os';

// Metrics for load shedding
const loadSheddingTotal = new Counter({
  name: 'auth_load_shedding_total',
  help: 'Total number of requests shed due to load',
  labelNames: ['priority', 'route'],
  registers: [register]
});

const currentLoadGauge = new Gauge({
  name: 'auth_current_load_level',
  help: 'Current system load level (0-100)',
  registers: [register]
});

// Load calculation state
let currentLoadLevel = 0;
let lastLoadCheck = 0;
const LOAD_CHECK_INTERVAL = 1000; // Check every second

/**
 * Calculate current system load level (0-100)
 */
function calculateLoadLevel(): number {
  const now = Date.now();
  
  // Cache load level calculation
  if (now - lastLoadCheck < LOAD_CHECK_INTERVAL) {
    return currentLoadLevel;
  }
  
  lastLoadCheck = now;

  // Get heap stats
  const heapStats = v8.getHeapStatistics();
  const heapUsedPercent = (heapStats.used_heap_size / heapStats.heap_size_limit) * 100;

  // Get CPU load (1 minute average)
  const cpuLoad = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpuLoadPercent = (cpuLoad / cpuCount) * 100;

  // Get memory stats
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsedPercent = ((totalMem - freeMem) / totalMem) * 100;

  // Weighted average (heap is most important for Node.js)
  currentLoadLevel = Math.min(100, Math.max(0,
    heapUsedPercent * 0.5 +
    cpuLoadPercent * 0.3 +
    memUsedPercent * 0.2
  ));

  // Update metric
  currentLoadGauge.set(currentLoadLevel);

  return currentLoadLevel;
}

/**
 * Get current load level (for monitoring)
 */
export function getCurrentLoadLevel(): number {
  return calculateLoadLevel();
}

/**
 * Load shedding middleware
 */
export async function loadSheddingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const loadLevel = calculateLoadLevel();
  const routePriority = getRoutePriority(request.method, request.routeOptions?.url || request.url);

  // Check if we should shed this request
  if (shouldShedRoute(routePriority, loadLevel)) {
    const priorityName = getPriorityName(routePriority);
    const route = request.routeOptions?.url || request.url.split('?')[0];

    // Log the shed
    logger.warn('Request shed due to load', {
      method: request.method,
      route,
      priority: priorityName,
      loadLevel: Math.round(loadLevel),
      ip: request.ip,
      correlationId: request.correlationId || request.id,
    });

    // Increment metric
    loadSheddingTotal.inc({ priority: priorityName, route });

    // Return 503 with Retry-After
    return reply
      .status(503)
      .header('Content-Type', 'application/problem+json')
      .header('Retry-After', '5')
      .header('X-Load-Level', Math.round(loadLevel).toString())
      .header('X-Priority', priorityName)
      .send({
        type: 'https://httpstatuses.com/503',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Server is under heavy load. Please retry shortly.',
        instance: request.url,
        correlationId: request.correlationId || request.id,
        code: 'LOAD_SHED',
        retryAfter: 5,
      });
  }

  // Attach priority to request for logging
  (request as any).routePriority = routePriority;
}

/**
 * Register load shedding middleware with Fastify
 */
export function registerLoadShedding(app: FastifyInstance): void {
  // Add as preHandler hook so it runs after routing but before handler
  app.addHook('preHandler', loadSheddingMiddleware);

  logger.info('Priority-based load shedding enabled', {
    checkInterval: LOAD_CHECK_INTERVAL,
    thresholds: {
      low: 50,
      normal: 70,
      high: 85,
      critical: 95,
    }
  });
}
