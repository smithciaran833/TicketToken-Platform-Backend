// Simplified Request Validation Middleware

class RequestValidator {
  // Basic validation for Express
  static validateExpress(rules, property = 'body') {
    return (req, res, next) => {
      const data = req[property];
      const errors = {};
      
      // Simple validation
      for (const [field, rule] of Object.entries(rules)) {
        if (rule.required && !data[field]) {
          errors[field] = `${field} is required`;
        }
        if (rule.type && data[field] && typeof data[field] !== rule.type) {
          errors[field] = `${field} must be a ${rule.type}`;
        }
        if (rule.min && data[field] && data[field].length < rule.min) {
          errors[field] = `${field} must be at least ${rule.min} characters`;
        }
        if (rule.max && data[field] && data[field].length > rule.max) {
          errors[field] = `${field} must be at most ${rule.max} characters`;
        }
      }
      
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: errors,
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      }
      
      req[`validated${property.charAt(0).toUpperCase() + property.slice(1)}`] = data;
      next();
    };
  }
  
  // Basic validation for Fastify
  static validateFastify(rules, property = 'body') {
    return async (req, reply) => {
      const data = req[property];
      const errors = {};
      
      // Simple validation
      for (const [field, rule] of Object.entries(rules)) {
        if (rule.required && !data[field]) {
          errors[field] = `${field} is required`;
        }
        if (rule.type && data[field] && typeof data[field] !== rule.type) {
          errors[field] = `${field} must be a ${rule.type}`;
        }
        if (rule.min && data[field] && data[field].length < rule.min) {
          errors[field] = `${field} must be at least ${rule.min} characters`;
        }
        if (rule.max && data[field] && data[field].length > rule.max) {
          errors[field] = `${field} must be at most ${rule.max} characters`;
        }
      }
      
      if (Object.keys(errors).length > 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: errors,
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        });
      }
      
      req[`validated${property.charAt(0).toUpperCase() + property.slice(1)}`] = data;
    };
  }
}

module.exports = RequestValidator;
