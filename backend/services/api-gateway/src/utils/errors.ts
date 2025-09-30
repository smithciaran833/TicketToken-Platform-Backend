// Re-export error classes from types for convenience
export * from '../types';

// Additional error handling utilities
export function isOperationalError(error: any): boolean {
  if (error.isOperational !== undefined) {
    return error.isOperational;
  }
  
  // Check for known operational errors
  const operationalCodes = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EPIPE',
  ];
  
  return operationalCodes.includes(error.code);
}

export function sanitizeError(error: any): any {
  // Remove sensitive information from errors
  const sanitized: {
    message: any;
    statusCode: any;
    code: any;
    stack?: any;
  } = {
    message: (error as any).message,
    statusCode: (error as any).statusCode || 500,
    code: error.code,
  };
  
  // Only include stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    sanitized.stack = error.stack;
  }
  
  return sanitized;
}
