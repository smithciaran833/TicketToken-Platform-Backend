const rateLimit = require('express-rate-limit');

// CSP middleware
function cspMiddleware(req, res, next) {
  res.setHeader(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "report-uri /csp-report"
  );
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
}

// CORS configuration
function corsConfig() {
  return {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Tenant-Id', 'X-User-Id']
  };
}

// Rate limiters for different endpoints
const purchaseRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 purchases per minute per IP
  message: 'Too many purchase requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentIntentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 payment intents per minute per IP
  message: 'Too many payment intent requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Tenant validation middleware
function tenantValidation(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  
  if (!tenantId && req.path !== '/health' && req.path !== '/metrics') {
    return res.status(400).json({
      error: 'Missing X-Tenant-Id header',
      requestId: req.requestId
    });
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (tenantId && !uuidRegex.test(tenantId)) {
    return res.status(400).json({
      error: 'Invalid X-Tenant-Id format',
      requestId: req.requestId
    });
  }
  
  next();
}

module.exports = {
  cspMiddleware,
  corsConfig,
  purchaseRateLimit,
  paymentIntentRateLimit,
  generalRateLimit,
  tenantValidation
};
