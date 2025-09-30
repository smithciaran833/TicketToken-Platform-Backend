const ResponseFormatter = require('./responseFormatter');
const RequestValidator = require('./requestValidator');
const RateLimiter = require('./rateLimiter');

module.exports = {
  ResponseFormatter,
  RequestValidator,
  RateLimiter,
  
  // Helper to apply all middleware to Express app
  applyToExpress: (app) => {
    // Add response formatter
    app.use(ResponseFormatter.expressMiddleware());
    
    // Add default rate limiting
    app.use(RateLimiter.createExpressLimiter());
    
    // Note: Error handler should be added last in the app
    return {
      errorHandler: ResponseFormatter.expressErrorHandler()
    };
  },
  
  // Helper to apply all middleware to Fastify app
  applyToFastify: async (fastify) => {
    // Add response formatter
    await fastify.register(ResponseFormatter.fastifyPlugin);
    
    // Add rate limiting
    await fastify.register(fastifyRateLimit, RateLimiter.createFastifyLimiter());
    
    // Set error handler
    fastify.setErrorHandler(ResponseFormatter.fastifyErrorHandler);
  }
};
