// Response Formatter Middleware - Works for both Express and Fastify

// Helper function to generate request ID
function generateRequestId() {
  try {
    const { nanoid } = require('nanoid');
    return nanoid();
  } catch (e) {
    // Fallback if nanoid is not available
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

class ResponseFormatter {
  // For Express
  static expressMiddleware() {
    return (req, res, next) => {
      // Add request ID if not present
      req.id = req.id || req.headers['x-request-id'] || generateRequestId();
      
      // Add success response helper
      res.success = (data, meta = {}) => {
        res.json({
          success: true,
          data,
          meta: {
            ...meta,
            timestamp: new Date().toISOString(),
            requestId: req.id,
            version: 'v1'
          }
        });
      };
      
      // Add error response helper
      res.error = (code, message, statusCode = 400, details = {}) => {
        res.status(statusCode).json({
          success: false,
          error: {
            code,
            message,
            details,
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      };
      
      // Add paginated response helper
      res.paginated = (data, page, limit, total) => {
        const totalPages = Math.ceil(total / limit);
        res.json({
          success: true,
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.id,
            version: 'v1'
          }
        });
      };
      
      next();
    };
  }
  
  // For Fastify
  static fastifyPlugin(fastify, options, done) {
    fastify.decorateRequest('id', null);
    fastify.decorateReply('success', null);
    fastify.decorateReply('error', null);
    fastify.decorateReply('paginated', null);
    
    fastify.addHook('preHandler', (req, reply, done) => {
      req.id = req.id || req.headers['x-request-id'] || generateRequestId();
      
      reply.success = function(data, meta = {}) {
        return this.send({
          success: true,
          data,
          meta: {
            ...meta,
            timestamp: new Date().toISOString(),
            requestId: req.id,
            version: 'v1'
          }
        });
      };
      
      reply.error = function(code, message, statusCode = 400, details = {}) {
        return this.code(statusCode).send({
          success: false,
          error: {
            code,
            message,
            details,
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      };
      
      reply.paginated = function(data, page, limit, total) {
        const totalPages = Math.ceil(total / limit);
        return this.send({
          success: true,
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.id,
            version: 'v1'
          }
        });
      };
      
      done();
    });
    
    done();
  }
  
  // Error handler for Express
  static expressErrorHandler() {
    return (err, req, res, next) => {
      const statusCode = err.statusCode || err.status || 500;
      const code = err.code || 'INTERNAL_ERROR';
      
      // Log error
      console.error({
        error: err.message,
        stack: err.stack,
        requestId: req.id,
        path: req.path,
        method: req.method
      });
      
      res.status(statusCode).json({
        success: false,
        error: {
          code,
          message: err.message || 'An unexpected error occurred',
          details: err.details || {},
          timestamp: new Date().toISOString(),
          requestId: req.id
        }
      });
    };
  }
  
  // Error handler for Fastify
  static fastifyErrorHandler(error, request, reply) {
    const statusCode = error.statusCode || error.status || 500;
    const code = error.code || 'INTERNAL_ERROR';
    
    // Log error
    request.log.error({
      error: error.message,
      stack: error.stack,
      requestId: request.id,
      path: request.url,
      method: request.method
    });
    
    reply.code(statusCode).send({
      success: false,
      error: {
        code,
        message: error.message || 'An unexpected error occurred',
        details: error.details || {},
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  }
}

module.exports = ResponseFormatter;
