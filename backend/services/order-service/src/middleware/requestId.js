const { v4: uuidv4 } = require('uuid');

function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  
  // Add to logger context if logger exists
  if (req.app.locals.logger) {
    req.log = req.app.locals.logger.child({ requestId: req.id });
  }
  
  next();
}

module.exports = requestIdMiddleware;
