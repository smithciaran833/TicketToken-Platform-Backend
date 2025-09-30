const crypto = require('crypto');
const logger = require('../utils/logger');

// Internal service authentication middleware
function validateInternalRequest(req, res, next) {
  try {
    // Check for internal service header
    const internalService = req.headers['x-internal-service'];
    const signature = req.headers['x-internal-signature'];
    
    if (!internalService || !signature) {
      logger.warn('Internal endpoint called without authentication headers', {
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({ 
        error: 'UNAUTHORIZED',
        message: 'Internal authentication required' 
      });
    }

    // Validate the service is allowed
    const allowedServices = ['payment-service', 'ticket-service', 'order-service', 'blockchain-service'];
    if (!allowedServices.includes(internalService)) {
      logger.warn('Invalid internal service attempted access', {
        service: internalService,
        ip: req.ip
      });
      return res.status(403).json({ 
        error: 'FORBIDDEN',
        message: 'Service not authorized' 
      });
    }

    // Verify the signature
    const secret = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
    const timestamp = req.headers['x-timestamp'];
    
    if (!timestamp) {
      return res.status(401).json({ 
        error: 'UNAUTHORIZED',
        message: 'Missing timestamp' 
      });
    }

    // Check timestamp is within 5 minutes
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      logger.warn('Internal request with expired timestamp', {
        service: internalService,
        timeDiff: Math.abs(now - requestTime)
      });
      return res.status(401).json({ 
        error: 'UNAUTHORIZED',
        message: 'Request expired' 
      });
    }

    // Verify signature (HMAC-SHA256 of service:timestamp:body)
    const body = JSON.stringify(req.body);
    const payload = `${internalService}:${timestamp}:${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid internal service signature', {
        service: internalService,
        ip: req.ip
      });
      return res.status(401).json({ 
        error: 'UNAUTHORIZED',
        message: 'Invalid signature' 
      });
    }

    // Add service info to request
    req.internalService = internalService;
    logger.info('Internal service authenticated', {
      service: internalService,
      path: req.path
    });
    
    next();
  } catch (error) {
    logger.error('Internal auth middleware error:', error);
    res.status(500).json({ 
      error: 'INTERNAL_ERROR',
      message: 'Authentication failed' 
    });
  }
}

module.exports = { validateInternalRequest };
