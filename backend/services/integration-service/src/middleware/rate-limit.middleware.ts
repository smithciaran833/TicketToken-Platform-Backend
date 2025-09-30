import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

export const webhookRateLimiter = rateLimit({
  windowMs: 60000,
  max: 1000, // Higher limit for webhooks
  message: 'Too many webhook requests'
});
