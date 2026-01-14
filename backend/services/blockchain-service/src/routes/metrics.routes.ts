import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { register } from '../utils/metrics';
import { circuitBreakerManager } from '../utils/circuitBreaker';
import { ValidationError } from '../errors';
import { logger } from '../utils/logger';
import { getBulkheadMetrics } from '../middleware/bulkhead';
import { getLoadSheddingMetrics, getLoadStatus } from '../middleware/load-shedding';
import { getRateLimitMetrics } from '../middleware/rate-limit';

/**
 * Metrics Routes with Input Validation
 *
 * AUDIT FIX #4: Add schema validation for circuit breaker name
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

// Allowlist of valid circuit breaker names
const VALID_BREAKER_NAMES = ['rpc', 'database', 'minting', 'external', 'metaplex', 'treasury'] as const;
type BreakerName = typeof VALID_BREAKER_NAMES[number];

/**
 * Validate circuit breaker name against allowlist
 */
function isValidBreakerName(name: string): name is BreakerName {
  return VALID_BREAKER_NAMES.includes(name as BreakerName);
}

// =============================================================================
// SCHEMAS
// =============================================================================

// Params schema for breaker name
const breakerParamsSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      enum: VALID_BREAKER_NAMES
    }
  }
};

// Response schema for circuit breakers
const circuitBreakersResponseSchema = {
  type: 'object',
  properties: {
    timestamp: { type: 'string' },
    circuitBreakers: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          state: { type: 'string' },
          failures: { type: 'number' },
          successes: { type: 'number' },
          lastFailure: { type: ['string', 'null'] },
          lastSuccess: { type: ['string', 'null'] }
        }
      }
    }
  }
};

// Response schema for reset
const resetResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    timestamp: { type: 'string' }
  }
};

// Error response schema
const errorResponseSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'number' },
    detail: { type: 'string' },
    code: { type: 'string' }
  }
};

// =============================================================================
// ROUTES
// =============================================================================

export default async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * GET /metrics
   * Prometheus metrics endpoint
   */
  fastify.get('/metrics', {
    schema: {
      response: {
        200: {
          type: 'string'
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.header('Content-Type', register.contentType);
      return register.metrics();
    } catch (error: any) {
      logger.error('Failed to generate metrics', { error: error.message });
      return reply.status(500).send({
        type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to generate metrics',
        code: 'METRICS_ERROR'
      });
    }
  });

  /**
   * GET /metrics/circuit-breakers
   * Get all circuit breaker statistics
   */
  fastify.get('/metrics/circuit-breakers', {
    schema: {
      response: {
        200: circuitBreakersResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = circuitBreakerManager.getAllStats();

      return {
        timestamp: new Date().toISOString(),
        circuitBreakers: stats
      };
    } catch (error: any) {
      logger.error('Failed to get circuit breaker stats', { error: error.message });
      return reply.status(500).send({
        type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to get circuit breaker stats',
        code: 'CIRCUIT_BREAKER_ERROR'
      });
    }
  });

  /**
   * GET /metrics/circuit-breakers/:name
   * Get specific circuit breaker statistics
   * AUDIT FIX #4: Validate breaker name against allowlist
   */
  fastify.get<{ Params: { name: string } }>('/metrics/circuit-breakers/:name', {
    schema: {
      params: breakerParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
            name: { type: 'string' },
            stats: { type: 'object' }
          }
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { name } = request.params;

    // AUDIT FIX #4: Validate against allowlist
    if (!isValidBreakerName(name)) {
      logger.warn('Invalid circuit breaker name requested', {
        name,
        validNames: VALID_BREAKER_NAMES,
        requestId: request.id
      });

      return reply.status(400).send({
        type: 'https://api.tickettoken.com/errors/VALIDATION_FAILED',
        title: 'Validation Error',
        status: 400,
        detail: `Invalid circuit breaker name. Valid names are: ${VALID_BREAKER_NAMES.join(', ')}`,
        code: 'INVALID_BREAKER_NAME'
      });
    }

    try {
      const allStats = circuitBreakerManager.getAllStats();
      const stats = allStats[name];

      if (!stats) {
        return reply.status(404).send({
          type: 'https://api.tickettoken.com/errors/NOT_FOUND',
          title: 'Not Found',
          status: 404,
          detail: `Circuit breaker '${name}' not found`,
          code: 'BREAKER_NOT_FOUND'
        });
      }

      return {
        timestamp: new Date().toISOString(),
        name,
        stats
      };
    } catch (error: any) {
      logger.error('Failed to get circuit breaker stats', { error: error.message, name });
      return reply.status(500).send({
        type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to get circuit breaker stats',
        code: 'CIRCUIT_BREAKER_ERROR'
      });
    }
  });

  /**
   * POST /metrics/circuit-breakers/:name/reset
   * Reset a specific circuit breaker
   * AUDIT FIX #4: Validate breaker name against allowlist
   */
  fastify.post<{ Params: { name: string } }>('/metrics/circuit-breakers/:name/reset', {
    schema: {
      params: breakerParamsSchema,
      response: {
        200: resetResponseSchema,
        400: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { name } = request.params;

    // AUDIT FIX #4: Validate against allowlist
    if (!isValidBreakerName(name)) {
      logger.warn('Invalid circuit breaker reset attempted', {
        name,
        validNames: VALID_BREAKER_NAMES,
        requestId: request.id
      });

      return reply.status(400).send({
        type: 'https://api.tickettoken.com/errors/VALIDATION_FAILED',
        title: 'Validation Error',
        status: 400,
        detail: `Invalid circuit breaker name. Valid names are: ${VALID_BREAKER_NAMES.join(', ')}`,
        code: 'INVALID_BREAKER_NAME'
      });
    }

    try {
      circuitBreakerManager.reset(name);

      logger.info('Circuit breaker reset', { name, requestId: request.id });

      return {
        success: true,
        message: `Circuit breaker '${name}' reset successfully`,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Failed to reset circuit breaker', { error: error.message, name });
      return reply.status(500).send({
        type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to reset circuit breaker',
        code: 'CIRCUIT_BREAKER_ERROR'
      });
    }
  });

  /**
   * GET /metrics/load
   * Get load management metrics (bulkhead, load shedding, rate limiting)
   */
  fastify.get('/metrics/load', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
            loadStatus: { type: 'object' },
            loadShedding: { type: 'object' },
            bulkheads: { type: 'object' },
            rateLimits: { type: 'object' }
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return {
        timestamp: new Date().toISOString(),
        loadStatus: getLoadStatus(),
        loadShedding: getLoadSheddingMetrics(),
        bulkheads: getBulkheadMetrics(),
        rateLimits: getRateLimitMetrics()
      };
    } catch (error: any) {
      logger.error('Failed to get load metrics', { error: error.message });
      return reply.status(500).send({
        type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to get load metrics',
        code: 'LOAD_METRICS_ERROR'
      });
    }
  });
}
