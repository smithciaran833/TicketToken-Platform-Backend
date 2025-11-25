import { FastifyPluginAsync } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

export const registerRateLimiter: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests, please try again later'
    })
  });
};

export const registerWebhookRateLimiter: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: 1000, // Higher limit for webhooks
    timeWindow: 60000,
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many webhook requests'
    })
  });
};
