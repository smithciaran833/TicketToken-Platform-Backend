/**
 * Artillery Load Test Processor
 * Custom functions for load testing scenarios
 */

const jwt = require('jsonwebtoken');

module.exports = {
  /**
   * Generate a valid test JWT token
   */
  generateTestToken: function(context, events, done) {
    const user = {
      id: `test-user-${Math.floor(Math.random() * 1000)}`,
      userId: `test-user-${Math.floor(Math.random() * 1000)}`,
      venueId: `venue-${Math.floor(Math.random() * 10)}`,
      role: 'user'
    };

    const token = jwt.sign(
      user,
      process.env.JWT_SECRET || 'test-secret-key-for-testing-purposes-only',
      { expiresIn: '1h' }
    );

    context.vars.authToken = token;
    context.vars.userId = user.id;
    context.vars.venueId = user.venueId;
    
    return done();
  },

  /**
   * Generate random search query
   */
  generateSearchQuery: function(context, events, done) {
    const queries = [
      'concert',
      'rock show',
      'jazz festival',
      'comedy night',
      'baseball game',
      'soccer match',
      'theater',
      'music festival',
      'sports event',
      'live show'
    ];

    context.vars.query = queries[Math.floor(Math.random() * queries.length)];
    return done();
  },

  /**
   * Log response metrics
   */
  logResponseTime: function(requestParams, response, context, ee, next) {
    const responseTime = response.timings.phases.firstByte;
    
    if (responseTime > 1000) {
      console.log(`⚠️  Slow response: ${responseTime}ms for ${requestParams.url}`);
    }
    
    ee.emit('counter', 'search_service.response_time', responseTime);
    return next();
  },

  /**
   * Track errors
   */
  trackErrors: function(requestParams, response, context, ee, next) {
    if (response.statusCode >= 400) {
      ee.emit('counter', `search_service.errors.${response.statusCode}`, 1);
      console.log(`❌ Error ${response.statusCode}: ${requestParams.url}`);
    }
    return next();
  },

  /**
   * Verify tenant isolation in results
   */
  verifyTenantIsolation: function(requestParams, response, context, ee, next) {
    if (response.statusCode === 200 && response.body) {
      try {
        const body = JSON.parse(response.body);
        if (body.results && Array.isArray(body.results)) {
          const userVenueId = context.vars.venueId;
          const invalidResults = body.results.filter(
            r => r.venueId && r.venueId !== userVenueId
          );
          
          if (invalidResults.length > 0) {
            console.log(`🔴 TENANT ISOLATION BREACH: Found ${invalidResults.length} results from other venues`);
            ee.emit('counter', 'search_service.tenant_isolation_breach', 1);
          } else {
            ee.emit('counter', 'search_service.tenant_isolation_ok', 1);
          }
        }
      } catch (err) {
        // Ignore JSON parse errors
      }
    }
    return next();
  },

  /**
   * Check cache hit rate
   */
  checkCacheHit: function(requestParams, response, context, ee, next) {
    const cacheHeader = response.headers['x-cache-hit'];
    if (cacheHeader === 'true') {
      ee.emit('counter', 'search_service.cache_hit', 1);
    } else {
      ee.emit('counter', 'search_service.cache_miss', 1);
    }
    return next();
  },

  /**
   * Before test setup
   */
  beforeTest: function(context, ee, next) {
    console.log('🚀 Starting load test...');
    console.log(`Target: ${process.env.SEARCH_SERVICE_URL || 'http://localhost:3020'}`);
    console.log(`Test duration: ~11 minutes`);
    
    // Generate initial token
    module.exports.generateTestToken(context, ee, () => {
      module.exports.generateSearchQuery(context, ee, next);
    });
  },

  /**
   * After test summary
   */
  afterTest: function(context, ee, next) {
    console.log('\n✅ Load test completed');
    console.log('Check Artillery report for detailed metrics');
    return next();
  }
};
